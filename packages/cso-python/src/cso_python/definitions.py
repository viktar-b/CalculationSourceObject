"""Static public interfaces shared by generation and invocation planning."""

from __future__ import annotations

import ast
import hashlib
from dataclasses import dataclass, replace
from pathlib import Path

from .annotations import Annotation, annotation, symbol_annotation
from .source import (
    Capture,
    CapturedModule,
    Json,
    SourceError,
    authoring_name,
    compact,
    literal,
    number,
    span,
)


@dataclass(frozen=True)
class ParameterDefinition:
    """Keep declared input behavior separate from legacy given-row documentation."""

    node: ast.arg
    declared: Annotation
    documented: Annotation
    default: ast.expr | None
    default_value: int | float | None


@dataclass(frozen=True)
class OutputDefinition:
    annotation: Annotation
    selection: ast.expr
    parameter_source: str | None


@dataclass(frozen=True)
class Definition:
    module: CapturedModule
    function: ast.FunctionDef
    parameters: dict[str, ParameterDefinition]
    outputs: dict[str, OutputDefinition]
    fingerprint: str
    given_parameters: frozenset[str]
    legacy_return: bool


class Definitions:
    def __init__(self, capture: Capture):
        self.capture = capture
        self.cache: dict[tuple[Path, str], Definition] = {}
        self.visiting: set[tuple[Path, str]] = set()

    def get(self, path: Path, function: str) -> Definition:
        key = (path.resolve(), function)
        if key in self.cache:
            return self.cache[key]
        if key in self.visiting:
            raise SourceError("DEPENDENCY_CYCLE", f"Recursive calculation {function}")
        self.visiting.add(key)
        try:
            definition = self._read(self.capture.load(path), function)
            self.cache[key] = definition
            return definition
        finally:
            self.visiting.remove(key)

    def _read(self, module: CapturedModule, function: str) -> Definition:
        fn = module.functions.get(function)
        if fn is None:
            raise SourceError("MISSING_FUNCTION", f"Missing calculation {function}")
        if fn.args.posonlyargs or fn.args.vararg or fn.args.kwarg:
            raise SourceError(
                "UNSUPPORTED_SIGNATURE",
                "Use named positional or keyword-only parameters",
                location=span(module.id, fn),
            )
        parameter_nodes = [*fn.args.args, *fn.args.kwonlyargs]
        nodes = {a.arg: a for a in parameter_nodes}
        if len(nodes) != len(parameter_nodes):
            raise SourceError(
                "UNSUPPORTED_SIGNATURE",
                "Parameter names must be unique",
                location=span(module.id, fn),
            )
        if nodes.keys() & module.imported or any(
            name.startswith("__cso_") for name in nodes
        ):
            raise SourceError(
                "UNSUPPORTED_SIGNATURE",
                "Parameters cannot shadow imported authoring helpers or math names",
                location=span(module.id, fn),
            )
        defaults = (
            dict(
                zip(
                    [a.arg for a in fn.args.args][-len(fn.args.defaults) :],
                    fn.args.defaults,
                )
            )
            if fn.args.defaults
            else {}
        )
        defaults.update(
            {
                a.arg: d
                for a, d in zip(fn.args.kwonlyargs, fn.args.kw_defaults)
                if d is not None
            }
        )
        parameters = {}
        for name, node in nodes.items():
            if node.annotation is None:
                raise SourceError(
                    "UNSUPPORTED_SIGNATURE",
                    "Parameters need numeric annotations",
                    location=span(module.id, node),
                )
            declared = annotation(node.annotation, module.id, module.aliases)
            default = defaults.get(name)
            parameters[name] = ParameterDefinition(
                node=node,
                declared=declared,
                documented=declared,
                default=default,
                default_value=(
                    number(literal(default, module.id), span(module.id, default))
                    if default is not None
                    else None
                ),
            )
        legacy_signature = all(p.declared.metadata is None for p in parameters.values())
        documented_names: list[str] = []
        known = {name: p.declared for name, p in parameters.items()}
        children: dict[str, dict[str, Annotation]] = {}
        forwarded: dict[str, dict[str, str]] = {}
        assigned: set[str] = set()
        given_parameters: set[str] = set()
        outputs: dict[str, OutputDefinition] = {}
        returned = False
        legacy_return = False

        def reference(expr: ast.expr) -> Annotation:
            if isinstance(expr, ast.Name) and expr.id in known:
                return known[expr.id]
            if (
                isinstance(expr, ast.Subscript)
                and isinstance(expr.value, ast.Name)
                and expr.value.id in children
                and isinstance(expr.slice, ast.Constant)
                and isinstance(expr.slice.value, str)
            ):
                output = children[expr.value.id].get(expr.slice.value)
                if output is not None:
                    return output
            raise SourceError(
                "MISSING_OUTPUT",
                "Public outputs must select documented quantities",
                location=span(module.id, expr),
            )

        def parameter_source(expr: ast.expr) -> str | None:
            if (
                isinstance(expr, ast.Name)
                and expr.id in parameters
                and expr.id not in assigned
            ):
                return expr.id
            if (
                isinstance(expr, ast.Subscript)
                and isinstance(expr.value, ast.Name)
                and isinstance(expr.slice, ast.Constant)
                and isinstance(expr.slice.value, str)
            ):
                return forwarded.get(expr.value.id, {}).get(expr.slice.value)
            return None

        def dependency(path: Path, function: str, call: ast.Assign) -> Definition:
            try:
                return self.get(path, function)
            except SourceError as error:
                error.diagnostic.setdefault("callChain", []).insert(
                    0, span(module.id, call)
                )
                raise

        def bind_child(
            name: str, child: Definition, arguments: dict[str, ast.expr]
        ) -> None:
            children[name] = {
                key: output.annotation for key, output in child.outputs.items()
            }
            forwarded[name] = {}
            for output, selection in child.outputs.items():
                if selection.parameter_source is None:
                    continue
                argument = arguments.get(selection.parameter_source)
                if argument is None or isinstance(
                    argument, (ast.Constant, ast.UnaryOp)
                ):
                    continue
                children[name][output] = reference(argument)
                parent_parameter = parameter_source(argument)
                if parent_parameter:
                    forwarded[name][output] = parent_parameter

        def statements(body: list[ast.stmt], *, grouped: bool = False) -> None:
            nonlocal returned, legacy_return
            for index, node in enumerate(body):
                if isinstance(node, ast.AnnAssign) and isinstance(
                    node.target, ast.Name
                ):
                    if node.target.id in assigned:
                        raise SourceError(
                            "DUPLICATE_IDENTITY",
                            "Symbols need unique simple names",
                            location=span(module.id, node),
                        )
                    assigned.add(node.target.id)
                    documented_names.append(node.target.id)
                    declared = symbol_annotation(node, module.id, module.aliases)
                    known[node.target.id] = declared
                    if (
                        isinstance(node.value, ast.Call)
                        and authoring_name(node.value.func) == "given"
                        and len(node.value.args) == 1
                        and isinstance(node.value.args[0], ast.Name)
                    ):
                        parameter = node.value.args[0].id
                        if parameter in parameters:
                            original = parameters[parameter]
                            if (
                                original.declared.metadata is not None
                                or parameter in given_parameters
                            ):
                                raise SourceError(
                                    "AMBIGUOUS_METADATA",
                                    "A parameter must have one metadata declaration",
                                    location=span(module.id, original.node),
                                )
                            given_parameters.add(parameter)
                            parameters[parameter] = replace(
                                original, documented=declared
                            )
                elif (
                    isinstance(node, ast.Assign)
                    and isinstance(node.value, ast.Call)
                    and len(node.targets) == 1
                    and isinstance(node.targets[0], ast.Name)
                ):
                    call = node.value
                    name = authoring_name(call.func)
                    if name in module.handles:
                        handle = module.handles[name]
                        child = dependency(handle["path"], handle["function"], node)
                        if (
                            handle["fingerprint"] is not None
                            and handle["fingerprint"] != child.fingerprint
                        ):
                            raise SourceError(
                                "STALE_BINDINGS",
                                "Run cso bindings to refresh the changed public interface",
                                location=span(module.id, call),
                            )
                        bind_child(
                            node.targets[0].id,
                            child,
                            {
                                kw.arg: kw.value
                                for kw in call.keywords
                                if kw.arg is not None
                            },
                        )
                    elif name == "calculation_call":
                        kw = {k.arg: k.value for k in call.keywords}
                        if call.args and "function" in kw:
                            path = literal(call.args[0], module.id)
                            function_name = literal(kw["function"], module.id)
                            if (
                                not isinstance(path, str)
                                or not path
                                or Path(path).is_absolute()
                                or "\\" in path
                                or ":" in path
                                or not isinstance(function_name, str)
                                or not function_name.isidentifier()
                            ):
                                raise SourceError(
                                    "INVALID_CALL",
                                    "Use a static relative path and function name",
                                    location=span(module.id, call),
                                )
                            child = dependency(
                                module.path.parent / path, function_name, node
                            )
                            inputs = kw.get("inputs")
                            if isinstance(inputs, ast.Dict):
                                arguments = {}
                                for key, value in zip(inputs.keys, inputs.values):
                                    if (
                                        not isinstance(key, ast.Constant)
                                        or not isinstance(key.value, str)
                                        or key.value in arguments
                                    ):
                                        raise SourceError(
                                            "INVALID_CALL_INPUTS",
                                            "Duplicate call input or nonliteral key",
                                            location=span(module.id, inputs),
                                            related=[
                                                span(child.module.id, child.function)
                                            ],
                                        )
                                    arguments[key.value] = value
                                bind_child(node.targets[0].id, child, arguments)
                elif isinstance(node, ast.With):
                    statements(node.body, grouped=True)
                elif isinstance(node, ast.Return):
                    if grouped:
                        raise SourceError(
                            "UNSUPPORTED_SYNTAX",
                            "Document groups cannot contain returns",
                            location=span(module.id, node),
                        )
                    if index != len(body) - 1:
                        raise SourceError(
                            "UNSUPPORTED_SYNTAX",
                            "Statements after return are unsupported",
                            location=span(module.id, body[index + 1]),
                        )
                    if not isinstance(node.value, ast.Dict):
                        raise SourceError(
                            "INVALID_RETURN_KEYS",
                            "Return a literal-key result dictionary",
                            location=span(module.id, node),
                        )
                    keys = [
                        key.value
                        if isinstance(key, ast.Constant) and isinstance(key.value, str)
                        else None
                        for key in node.value.keys
                    ]
                    if any(key is None or not key for key in keys) or len(
                        set(keys)
                    ) != len(keys):
                        raise SourceError(
                            "INVALID_RETURN_KEYS",
                            "Return unique nonempty literal output names",
                            location=span(module.id, node),
                        )
                    # Preserve source order, including assignments inside document groups.
                    # Complete legacy maps keep incorrect runtime returns independently observable.
                    legacy_return = legacy_signature and keys == documented_names
                    for key, value in zip(keys, node.value.values):
                        outputs[key] = OutputDefinition(
                            annotation=known[key]
                            if legacy_return
                            else reference(value),
                            selection=value,
                            parameter_source=parameter_source(value),
                        )
                    returned = True

        statements(fn.body)
        if not returned:
            raise SourceError(
                "INVALID_RETURN_KEYS",
                "Calculation needs one final return dictionary",
                location=span(module.id, fn),
            )
        interface: Json = {
            "function": function,
            "parameters": [
                {
                    "name": name,
                    "type": spec.documented.numeric_type,
                    "metadata": spec.documented.metadata,
                    **(
                        {"default": spec.default_value}
                        if spec.default is not None
                        else {}
                    ),
                    "keywordOnly": name in {a.arg for a in fn.args.kwonlyargs},
                }
                for name, spec in parameters.items()
            ],
            "outputs": [
                {
                    "name": name,
                    "selection": ast.dump(spec.selection, include_attributes=False),
                    "type": spec.annotation.numeric_type,
                    "metadata": spec.annotation.metadata,
                }
                for name, spec in outputs.items()
            ],
        }
        return Definition(
            module=module,
            function=fn,
            parameters=parameters,
            outputs=outputs,
            fingerprint=hashlib.sha256(compact(interface).encode()).hexdigest(),
            given_parameters=frozenset(given_parameters),
            legacy_return=legacy_return,
        )
