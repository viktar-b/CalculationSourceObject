"""Static, entry-bounded source capture for trusted local calculations."""

from __future__ import annotations

import ast
import hashlib
import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

Json = dict[str, Any]
HELPERS = {
    "CalculationResults",
    "calculation",
    "section",
    "symbol",
    "given",
    "load_calculation",
    "documented_result",
    "calculation_call",
    "text",
    "figure",
    "document_section",
}
IMPORTS = {
    "__future__": {"annotations"},
    "typing": {"Annotated", "Any", "TypeAlias"},
    "math": {"sqrt", "isclose"},
    "cso_python": HELPERS,
}


def authoring_name(node: ast.AST) -> str | None:
    """Recognize bare imports and the one supported qualified helper."""
    if isinstance(node, ast.Name):
        return node.id
    if (
        isinstance(node, ast.Attribute)
        and isinstance(node.value, ast.Name)
        and node.value.id == "math"
        and node.attr == "sqrt"
    ):
        return "math.sqrt"
    return None


def compact(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def identity(kind: str, invocation: str, local: str) -> str:
    return compact([kind, invocation, local])


def span(module: str, node: ast.AST) -> Json:
    return {
        "moduleId": module,
        "start": {"line": node.lineno, "column": node.col_offset},
        "end": {"line": node.end_lineno, "column": node.end_col_offset},
    }


def syntax_location(module: str, data: bytes, error: SyntaxError) -> Json | None:
    """Locate the complete offending source line using exact byte columns."""
    lines = data.splitlines()
    if error.lineno is None or not 1 <= error.lineno <= len(lines):
        return None
    return {
        "moduleId": module,
        "start": {"line": error.lineno, "column": 0},
        "end": {"line": error.lineno, "column": len(lines[error.lineno - 1])},
    }


class SourceError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        location: Json | None = None,
        stage: str = "source",
        related: list[Json] | None = None,
        **details: Any,
    ):
        super().__init__(message)
        self.diagnostic = {"code": code, "message": message, "stage": stage, **details}
        if location is not None:
            self.diagnostic["location"] = location
        if related:
            self.diagnostic["relatedLocations"] = related


def number(
    value: Any, location: Json | None = None, stage: str = "source"
) -> int | float:
    code = None
    if type(value) not in (int, float):
        code = "UNSUPPORTED_RESULT"
    elif isinstance(value, float) and not math.isfinite(value):
        code = "NON_FINITE_VALUE"
    elif (isinstance(value, int) or value.is_integer()) and abs(value) > 2**53 - 1:
        code = "UNSUPPORTED_NUMERIC_RANGE"
    if code:
        kind = (
            "python-int"
            if type(value) is int
            else "python-float"
            if type(value) is float
            else "unsupported"
        )
        display = (
            hex(value)
            if type(value) is int and value.bit_length() > 13000
            else repr(value)
        )
        raise SourceError(
            code,
            f"Unsupported numeric value: {display}",
            location=location,
            stage=stage,
            valueDisplay={"kind": kind, "text": display},
        )
    return value


def json_native(value: Any) -> bool:
    if value is None or type(value) in (bool, str):
        return True
    if type(value) is int:
        return abs(value) <= 2**53 - 1
    if type(value) is float:
        return math.isfinite(value) and (
            not value.is_integer() or abs(value) <= 2**53 - 1
        )
    if type(value) is list:
        return all(json_native(item) for item in value)
    if type(value) is dict:
        return all(
            type(key) is str and json_native(item) for key, item in value.items()
        )
    return False


def literal(node: ast.AST, module: str, *, json_only: bool = False) -> Any:
    for child in ast.walk(node):
        if isinstance(child, ast.Dict):
            keys = [literal(k, module) for k in child.keys if k is not None]
            if len(keys) != len(child.keys) or len({compact(k) for k in keys}) != len(
                keys
            ):
                raise SourceError(
                    "DUPLICATE_MAPPING_KEY",
                    "Duplicate keys or dictionary expansion",
                    location=span(module, child),
                )
    try:
        value = ast.literal_eval(node)
        if json_only and not json_native(value):
            raise SourceError(
                "INVALID_METADATA",
                "Metadata requires string object keys and JSON-native finite values with safe integers",
                location=span(module, node),
            )
        compact(value).encode("utf-8")
        return value
    except (ValueError, TypeError, SyntaxError, UnicodeError) as error:
        raise SourceError(
            "INVALID_LITERAL",
            "Expected a finite JSON literal",
            location=span(module, node),
        ) from error


def numeric_literal(node: ast.AST) -> bool:
    return (
        isinstance(node, ast.Constant)
        and type(node.value) in (int, float)
        or isinstance(node, ast.UnaryOp)
        and isinstance(node.op, ast.USub)
        and isinstance(node.operand, ast.Constant)
        and type(node.operand.value) in (int, float)
    )


def kwargs(call: ast.Call, module: str, allowed: set[str], required: set[str]) -> Json:
    if call.args:
        raise SourceError(
            "INVALID_METADATA",
            "Metadata accepts keyword arguments only",
            location=span(module, call),
        )
    result = {}
    for kw in call.keywords:
        if kw.arg not in allowed or kw.arg in result:
            raise SourceError(
                "INVALID_METADATA",
                f"Unknown or duplicate keyword {kw.arg!r}",
                location=span(module, kw),
            )
        result[kw.arg] = literal(kw.value, module, json_only=kw.arg == "metadata")
    if not required <= result.keys():
        raise SourceError(
            "MISSING_METADATA",
            f"Missing metadata: {sorted(required - result.keys())}",
            location=span(module, call),
        )
    for key, value in result.items():
        if key == "metadata":
            valid = isinstance(value, dict)
            if valid and {"localId", "invocationId", "location"} & value.keys():
                valid = False
        elif key == "root":
            valid = type(value) is bool
        else:
            valid = isinstance(value, str) and (
                bool(value) or key in {"comment", "unit"}
            )
        if not valid:
            raise SourceError(
                "INVALID_METADATA", f"Invalid {key}", location=span(module, call)
            )
    return result


@dataclass
class CapturedModule:
    path: Path
    id: str
    data: bytes
    tree: ast.Module
    functions: dict[str, ast.FunctionDef]
    imported: set[str]
    aliases: dict[str, Any] = field(default_factory=dict)
    handles: dict[str, Any] = field(default_factory=dict)
    local_imports: dict[str, Path] = field(default_factory=dict)


@dataclass
class Symbol:
    name: str
    spec: Json
    node: ast.AnnAssign
    definition: Json
    cso: Json
    numeric_type: str


@dataclass
class Invocation:
    module: CapturedModule
    function: ast.FunctionDef
    id: str
    calculation: Json
    parameters: dict[str, ast.arg]
    defaults: dict[str, ast.expr]
    record: Json
    section: Json
    symbols: dict[str, Symbol] = field(default_factory=dict)
    calls: dict[str, Invocation] = field(default_factory=dict)
    call_node: ast.Assign | None = None
    parent: Invocation | None = None
    parameters_v2: list[Json] = field(default_factory=list)
    uses: list[Json] = field(default_factory=list)
    outputs: dict[str, Any] = field(default_factory=dict)
    output_records: list[Json] = field(default_factory=list)
    signature_inputs: set[str] = field(default_factory=set)
    parameter_symbols: dict[str, Symbol] = field(default_factory=dict)


class Capture:
    def __init__(self, entry: Path):
        requested_entry = entry.absolute()
        self.entry = entry.resolve(strict=True)
        self.root = self.entry.parent
        self.modules: dict[Path, CapturedModule] = {}
        self.loading: set[Path] = set()
        self.resolutions = {requested_entry: self.entry}
        self.for_bindings = False

    def resolve(self, path: Path, location: Json | None = None) -> Path:
        requested = path.absolute()
        try:
            resolved = path.resolve(strict=True)
            relative = resolved.relative_to(self.root).as_posix()
            relative.encode("utf-8")
        except (OSError, ValueError, RuntimeError, UnicodeError) as error:
            raise SourceError(
                "INVALID_DEPENDENCY_PATH",
                f"Dependency is missing or outside entry directory: {path}",
                location=location,
            ) from error
        if (
            not resolved.is_file()
            or not relative.endswith(".py")
            or "\\" in relative
            or ":" in relative
            or "\0" in relative
        ):
            raise SourceError(
                "INVALID_DEPENDENCY_PATH",
                f"Expected a local .cso.py file: {path}",
                location=location,
            )
        self.resolutions[requested] = resolved
        return resolved

    def unchanged(self) -> bool:
        try:
            if any(
                requested.resolve(strict=True) != resolved
                for requested, resolved in self.resolutions.items()
            ):
                return False
            return all(
                module.path.read_bytes() == module.data
                for module in self.modules.values()
            )
        except (OSError, RuntimeError):
            return False

    def load(self, path: Path, location: Json | None = None) -> CapturedModule:
        path = self.resolve(path, location)
        if path in self.modules:
            return self.modules[path]
        if path in self.loading:
            raise SourceError(
                "DEPENDENCY_CYCLE", "Local import cycle", location=location
            )
        self.loading.add(path)
        module = path.relative_to(self.root).as_posix()
        data = path.read_bytes()
        try:
            source = data.decode("utf-8")
            tree = ast.parse(source, filename=str(path))
        except SyntaxError as error:
            raise SourceError(
                "INVALID_SOURCE",
                f"{module}: {error}",
                location=syntax_location(module, data, error),
                related=[location] if location else None,
            ) from error
        except UnicodeError as error:
            raise SourceError(
                "INVALID_SOURCE", f"{module}: {error}", location=location
            ) from error
        from .annotations import annotation

        functions = {}
        aliases = {}
        handles = {}
        local_imports = {}
        imported = set()
        bound = set()
        for node in tree.body:
            names: list[str] = []
            if (
                isinstance(node, ast.ImportFrom)
                and node.level == 0
                and node.module in IMPORTS
            ):
                if any(
                    a.asname or a.name not in IMPORTS[node.module] for a in node.names
                ):
                    self.unsupported(module, node, "Unapproved or aliased import")
                names = [a.name for a in node.names]
                imported.update(names)
            elif isinstance(node, ast.ImportFrom):
                if (node.module or "").startswith("cso_python."):
                    self.unsupported(module, node, "Unapproved or aliased import")
                if node.module is None or any(a.name == "*" for a in node.names):
                    self.unsupported(module, node, "Use explicit local imports")
                folder = path.parent if node.level else self.root
                for _ in range(max(0, node.level - 1)):
                    folder = folder.parent
                target = folder.joinpath(*node.module.split(".")).with_suffix(".py")
                if self.for_bindings and node.module.startswith("_cso_bindings."):
                    target_source = self.root.joinpath(
                        *node.module.split(".")[1:]
                    ).with_suffix(".cso.py")
                    self.resolve(target_source, span(module, node))
                    for entry in node.names:
                        handles[entry.asname or entry.name] = {
                            "path": target_source,
                            "function": entry.name,
                            "fingerprint": None,
                        }
                else:
                    # Python imports package initializers too. Capture and preflight
                    # them so direct and captured imports cannot hide module effects.
                    for folder in reversed(target.parents):
                        if folder == self.root or not folder.is_relative_to(self.root):
                            continue
                        initializer = folder / "__init__.py"
                        if initializer.exists():
                            self.load(initializer, span(module, node))
                    dependency = self.load(target, span(module, node))
                    local_imports[node.module] = dependency.path
                    for entry in node.names:
                        name = entry.asname or entry.name
                        if entry.name in dependency.aliases:
                            aliases[name] = dependency.aliases[entry.name]
                        elif entry.name in dependency.handles:
                            handles[name] = dependency.handles[entry.name]
                        else:
                            self.unsupported(
                                module,
                                node,
                                "Local imports expose only metadata aliases and calculation handles",
                            )
                names = [entry.asname or entry.name for entry in node.names]
                imported.update(names)
            elif isinstance(node, ast.AnnAssign):
                if not (
                    isinstance(node.target, ast.Name)
                    and isinstance(node.annotation, ast.Name)
                    and node.annotation.id == "TypeAlias"
                    and "TypeAlias" in imported
                    and node.value is not None
                ):
                    self.unsupported(
                        module,
                        node,
                        "Module annotations must declare TypeAlias metadata",
                    )
                declared = annotation(node.value, module, aliases)
                if (
                    declared.metadata is None
                    or {"id", "root_key"} & declared.metadata.keys()
                ):
                    self.unsupported(
                        module,
                        node,
                        "Shared metadata requires symbol metadata without local identity fields",
                    )
                if not {"Annotated", "symbol"} <= imported and not isinstance(
                    node.value, ast.Name
                ):
                    self.unsupported(
                        module, node, "Import Annotated and symbol for metadata aliases"
                    )
                aliases[node.target.id] = declared
                names = [node.target.id]
            elif (
                isinstance(node, ast.Assign)
                and isinstance(node.value, ast.Call)
                and authoring_name(node.value.func) == "load_calculation"
            ):
                if not (
                    len(node.targets) == 1
                    and isinstance(node.targets[0], ast.Name)
                    and "load_calculation" in imported
                    and len(node.value.args) == 1
                ):
                    self.unsupported(module, node, "Bind one named calculation handle")
                target = literal(node.value.args[0], module)
                settings = kwargs(
                    ast.copy_location(
                        ast.Call(
                            func=node.value.func, args=[], keywords=node.value.keywords
                        ),
                        node.value,
                    ),
                    module,
                    {"function", "fingerprint"},
                    {"function"},
                )
                if (
                    not isinstance(target, str)
                    or Path(target).is_absolute()
                    or not target.endswith(".cso.py")
                ):
                    self.unsupported(
                        module,
                        node,
                        "Calculation handles require a relative .cso.py path",
                    )
                handles[node.targets[0].id] = {
                    "path": self.resolve(path.parent / target, span(module, node)),
                    "function": settings["function"],
                    "fingerprint": settings.get("fingerprint"),
                }
                names = [node.targets[0].id]
            elif (
                isinstance(node, ast.Import)
                and len(node.names) == 1
                and node.names[0].name == "math"
                and node.names[0].asname is None
            ):
                names = ["math"]
                imported.add("math")
            elif (
                isinstance(node, ast.Expr)
                and isinstance(node.value, ast.Constant)
                and isinstance(node.value.value, str)
            ):
                pass
            elif (
                isinstance(node, ast.Assign)
                and len(node.targets) == 1
                and isinstance(node.targets[0], ast.Name)
            ):
                literal(node.value, module)
                names = [node.targets[0].id]
            elif isinstance(node, ast.FunctionDef):
                names = [node.name]
                self.safe_signature(module, node, imported, aliases)
                for decorator in node.decorator_list:
                    if not isinstance(decorator, ast.Call) or authoring_name(
                        decorator.func
                    ) not in {"calculation", "section"}:
                        self.unsupported(module, decorator, "Unsupported decorator")
                    name = authoring_name(decorator.func)
                    if name not in imported:
                        self.unsupported(
                            module, decorator, "Unimported authoring helper"
                        )
                    if name == "calculation":
                        kwargs(
                            decorator,
                            module,
                            {"id", "title", "schema_version", "metadata"},
                            {"id", "title"},
                        )
                    else:
                        kwargs(
                            decorator,
                            module,
                            {"id", "title", "root", "metadata"},
                            {"title"},
                        )
                functions[node.name] = node
            elif self.main_guard(node):
                # Never run this branch: captured modules use a non-main name.
                pass
            else:
                self.unsupported(module, node, "Unsupported module statement")
            for name in names:
                if (
                    name.startswith("__")
                    or name in bound
                    or (name in HELPERS and name not in imported)
                ):
                    self.unsupported(
                        module, node, f"Duplicate or reserved module binding {name}"
                    )
                bound.add(name)
        if not path.name.endswith(".cso.py") and functions:
            raise SourceError(
                "UNSUPPORTED_SYNTAX",
                "Local metadata and binding modules cannot contain executable functions",
            )
        captured = CapturedModule(
            path,
            module,
            data,
            tree,
            functions,
            imported,
            aliases,
            handles,
            local_imports,
        )
        self.loading.remove(path)
        self.modules[path] = captured
        return captured

    @staticmethod
    def main_guard(node: ast.AST) -> bool:
        return (
            isinstance(node, ast.If)
            and not node.orelse
            and ast.dump(node.test)
            == ast.dump(ast.parse('__name__ == "__main__"', mode="eval").body)
        )

    @staticmethod
    def unsupported(module: str, node: ast.AST, message: str) -> None:
        raise SourceError("UNSUPPORTED_SYNTAX", message, location=span(module, node))

    def safe_signature(
        self,
        module: str,
        fn: ast.FunctionDef,
        imported: set[str],
        aliases: dict | None = None,
    ) -> None:
        if getattr(fn, "type_params", []):
            self.unsupported(module, fn, "Generic function parameters are unsupported")
        for node in [
            *(
                a.annotation
                for a in [*fn.args.posonlyargs, *fn.args.args, *fn.args.kwonlyargs]
                if a.annotation
            ),
            *([fn.returns] if fn.returns else []),
        ]:
            if not (
                isinstance(node, ast.Name)
                and node.id in {"float", "int", "CalculationResults", "Any"}
                or isinstance(node, ast.Constant)
                and node.value is None
            ):
                from .annotations import annotation

                annotation(node, module, aliases or {})
                if (
                    isinstance(node, ast.Subscript)
                    and not {"Annotated", "symbol"} <= imported
                ):
                    self.unsupported(
                        module, node, "Import Annotated and symbol for input metadata"
                    )
            if (
                isinstance(node, ast.Name)
                and node.id in {"CalculationResults", "Any"}
                and node.id not in imported
            ):
                self.unsupported(module, node, "Unimported type annotation")
        for default in [
            *fn.args.defaults,
            *(d for d in fn.args.kw_defaults if d is not None),
        ]:
            if not numeric_literal(default):
                self.unsupported(
                    module, default, "Function defaults must be finite numeric literals"
                )
            number(literal(default, module), span(module, default))

    def manifest(self) -> list[Json]:
        return sorted(
            [
                {"moduleId": m.id, "sha256": hashlib.sha256(m.data).hexdigest()}
                for m in self.modules.values()
            ],
            key=lambda m: m["moduleId"].encode("utf-8"),
        )

    def closure_hash(self) -> str:
        return hashlib.sha256(
            compact([[m["moduleId"], m["sha256"]] for m in self.manifest()]).encode(
                "utf-8"
            )
        ).hexdigest()
