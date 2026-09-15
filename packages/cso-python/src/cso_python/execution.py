"""Execute captured, preflighted source once; observe inputs, assignments and returns."""

from __future__ import annotations

import argparse
import ast
import builtins
import contextvars
import copy
import json
import platform
import sys
import types
from pathlib import Path
from typing import Any

from .exporter import authored_output_to_stderr
from .glyphs import qualify_glyphs
from .planner import Planner
from .source import Invocation, Json, SourceError, number, span, syntax_location

ACTIVE: contextvars.ContextVar[Any] = contextvars.ContextVar(
    "cso_execution", default=None
)


def _declared_number(
    raw: Any,
    numeric_type: str,
    *,
    location: Json,
    code: str,
    subject: str,
) -> int | float:
    value = number(raw, location, "execution")
    if numeric_type == "int" and type(value) is not int:
        raise SourceError(
            code,
            f"{subject} is declared int and requires a Python int; received float",
            location=location,
            stage="execution",
            valueDisplay={"kind": "python-float", "text": repr(value)},
        )
    return value


class Execution:
    def __init__(self, source: Path, function: str, inputs: Json):
        self.planner = Planner(source)
        self.root = self.planner.plan(
            self.planner.capture.entry, function, supplied=inputs
        )
        qualify_glyphs(self.planner.invocations)
        self.code = {}
        for module in self.planner.capture.modules.values():
            try:
                self.code[module.path] = compile(
                    self.instrument(module),
                    str(module.path),
                    "exec",
                    dont_inherit=True,
                )
            except SyntaxError as error:
                raise SourceError(
                    "INVALID_SOURCE",
                    f"{module.id}: {error}",
                    location=syntax_location(module.id, module.data, error),
                ) from error
        self.observations: list[Json] = []
        self.modules: dict[Path, Json] = {}

    def unchanged(self) -> bool:
        return self.planner.unchanged()

    def run_root(self, inputs: Json) -> Json:
        supplied = {name: number(value, stage="usage") for name, value in inputs.items()}
        self.observations.clear()
        for invocation in self.planner.invocations:
            invocation.record["resolvedInputs"] = {}
            for symbol in invocation.symbols.values():
                symbol.cso["valueTree"].pop("result", None)
            for output in invocation.output_records:
                output.pop("value", None)
        return self.run(self.root, supplied)

    def instrument(self, module):
        selected = {
            inv.function.name
            for inv in self.planner.invocations
            if inv.module.path == module.path
        }
        tree = copy.deepcopy(module.tree)

        class Observer(ast.NodeTransformer):
            def visit_AnnAssign(self, node):
                hook = ast.Expr(
                    value=ast.Call(
                        func=ast.Name(id="__cso_observe__", ctx=ast.Load()),
                        args=[
                            ast.Constant(value=node.target.id),
                            ast.Name(id=node.target.id, ctx=ast.Load()),
                        ],
                        keywords=[],
                    )
                )
                return [node, ast.copy_location(hook, node)]

        for node in tree.body:
            if isinstance(node, ast.FunctionDef) and node.name in selected:
                Observer().generic_visit(node)
        return ast.fix_missing_locations(tree)

    def observe(self, name: str, raw: Any) -> None:
        active = ACTIVE.get()
        if active is None or active[0] is not self:
            raise SourceError(
                "INVALID_OBSERVATION",
                "Observation outside its captured invocation",
                stage="execution",
            )
        invocation = active[1]
        symbol = invocation.symbols[name]
        definition = symbol.definition
        if any(o["symbolId"] == definition["symbolId"] for o in self.observations):
            raise SourceError(
                "DUPLICATE_OBSERVATION",
                "An annotated assignment executed more than once",
                stage="execution",
            )
        value = _declared_number(
            raw,
            symbol.numeric_type,
            location=definition["definitionLocation"],
            code="SYMBOL_TYPE_MISMATCH",
            subject=f"Symbol {name!r}",
        )
        self.observations.append(
            {
                **{
                    key: definition[key]
                    for key in ("symbolId", "kind", "definitionLocation")
                },
                "invocationId": invocation.id,
                "value": value,
            }
        )
        symbol.cso["valueTree"]["result"] = {"kind": "number", "value": value}

    def load_module(self, module):
        if module.path in self.modules:
            return self.modules[module.path]
        namespace = {
            "__name__": "_cso_captured_module",
            "__file__": str(module.path),
            "__cso_observe__": self.observe,
        }
        self.modules[module.path] = namespace

        def imported(name, globals=None, locals=None, fromlist=(), level=0):
            if name in module.local_imports:
                dependency = self.planner.capture.modules[module.local_imports[name]]
                proxy = types.ModuleType(name)
                proxy.__dict__.update(self.load_module(dependency))
                return proxy
            return builtins.__import__(name, globals, locals, fromlist, level)

        namespace["__builtins__"] = {**vars(builtins), "__import__": imported}
        exec(self.code[module.path], namespace)  # noqa: S102 - preflighted, captured trusted local source
        return namespace

    def run(self, invocation: Invocation, inputs: Json) -> Json:
        try:
            return self._run(invocation, inputs)
        except SourceError as error:
            chain = []
            current = invocation
            while current.parent is not None:
                chain.insert(0, current.record["callSite"])
                current = current.parent
            if len(error.diagnostic.get("callChain", [])) < len(chain):
                error.diagnostic["callChain"] = chain
            if chain:
                related = error.diagnostic.setdefault("relatedLocations", [])
                if chain[-1] not in related:
                    related.append(chain[-1])
            error.diagnostic.setdefault("invocationId", invocation.id)
            error.diagnostic.setdefault(
                "location", span(invocation.module.id, invocation.function)
            )
            raise

    def _run(self, invocation: Invocation, inputs: Json) -> Json:
        definition = self.planner.definitions.get(
            invocation.module.path, invocation.function.name
        )
        resolved = dict(inputs)
        for binding in invocation.record["inputBindings"]:
            if (
                binding["parameterName"] not in resolved
                and binding["kind"] == "parsedDefault"
            ):
                resolved[binding["parameterName"]] = binding["value"]
        invocation.record["resolvedInputs"] = {
            name: _declared_number(
                resolved[name],
                definition.parameters[name].declared.numeric_type,
                location=span(invocation.module.id, param),
                code="INPUT_TYPE_MISMATCH",
                subject=f"Parameter {name!r}",
            )
            for name, param in invocation.parameters.items()
        }
        for binding in invocation.record["inputBindings"]:
            name = binding["parameterName"]
            if binding["kind"] == "entrySupplied":
                binding["value"] = invocation.record["resolvedInputs"][name]
            symbol = invocation.parameter_symbols[name]
            if (
                any(candidate is symbol for candidate in invocation.symbols.values())
                and symbol.cso["valueTree"]["nodes"][0]["mode"] == "LITERAL"
            ):
                symbol.cso["valueTree"]["nodes"][0]["literal"]["value"] = (
                    invocation.record["resolvedInputs"][name]
                )
        token = ACTIVE.set((self, invocation, iter(invocation.calls.values())))
        try:
            module = invocation.module
            namespace = self.load_module(module)
            for name in invocation.parameters:
                if name not in invocation.signature_inputs:
                    continue
                self.observe(name, resolved[name])
            result = namespace[invocation.function.name](**resolved)
            if type(result) is not dict or list(result) != list(invocation.outputs):
                raise SourceError(
                    "INVALID_RETURN_KEYS",
                    "Returned keys differ from public output declarations",
                    stage="execution",
                    location=span(module.id, invocation.function),
                )
            observed = {o["symbolId"] for o in self.observations}
            if any(
                symbol.cso["id"] not in observed
                for symbol in invocation.symbols.values()
            ):
                raise SourceError(
                    "MISSING_OBSERVATION",
                    "An annotated assignment was not observed",
                    stage="execution",
                )
            for output in invocation.output_records:
                output["value"] = _declared_number(
                    result[output["name"]],
                    definition.outputs[output["name"]].annotation.numeric_type,
                    location=output["location"],
                    code="OUTPUT_TYPE_MISMATCH",
                    subject=f"Output {output['name']!r}",
                )
            return result
        except SourceError:
            raise
        except Exception as error:
            raise SourceError(
                "EXECUTION_FAILED",
                f"{type(error).__name__}: {error}",
                stage="execution",
                location=span(invocation.module.id, invocation.function),
                invocationId=invocation.id,
            ) from error
        finally:
            ACTIVE.reset(token)

    def response(self) -> Json:
        self.run(self.root, self.root.record["resolvedInputs"])
        root = self.root
        capture = self.planner.capture
        manifest = capture.manifest()
        source_hash = next(
            m["sha256"] for m in manifest if m["moduleId"] == root.module.id
        )
        return {
            "protocolVersion": "2",
            "ok": True,
            "diagnostics": [],
            "execution": {
                "authoring": {
                    "version": "2",
                    "parameters": [
                        p for inv in self.planner.invocations for p in inv.parameters_v2
                    ],
                    "uses": [
                        use for inv in self.planner.invocations for use in inv.uses
                    ],
                    "outputDeclarations": [
                        {k: v for k, v in output.items() if k != "value"}
                        for inv in self.planner.invocations
                        for output in inv.output_records
                    ],
                    "outputs": [
                        output
                        for inv in self.planner.invocations
                        for output in inv.output_records
                    ],
                },
                "cso": {
                    "schemaVersion": "1.0.0",
                    "title": root.calculation["title"],
                    "source": {
                        "id": root.calculation["id"],
                        "metadata": root.calculation.get("metadata", {}),
                    },
                    "rootSectionIds": [root.section["id"]],
                    "sections": self.planner.sections,
                },
                "entry": {
                    "moduleId": root.module.id,
                    "sourceHash": source_hash,
                    "function": root.function.name,
                    "invocationId": "root",
                    "resolvedInputs": root.record["resolvedInputs"],
                },
                "sourceManifest": manifest,
                "sourceClosureHash": capture.closure_hash(),
                "invocations": [inv.record for inv in self.planner.invocations],
                "observations": self.observations,
                "assets": list(self.planner.assets.values()),
                "versions": versions(),
            },
        }


def versions() -> Json:
    from importlib.metadata import version

    return {
        "pythonPackage": version("cso-python"),
        "pythonInterpreter": sys.executable,
        "pythonVersion": platform.python_version(),
    }


def execute(source: Path, function: str, inputs: Json) -> Json:
    execution = Execution.__new__(Execution)
    try:
        execution.__init__(source, function, inputs)
        return execution.response()
    except (SourceError, OSError, ValueError, UnicodeError, RuntimeError) as error:
        diagnostic = (
            error.diagnostic
            if isinstance(error, SourceError)
            else {
                "code": "SOURCE_READ_FAILED",
                "message": str(error),
                "stage": "source",
            }
        )
        provenance: Json = {"versions": versions()}
        if function.isidentifier():
            provenance["function"] = function
        if hasattr(execution, "planner") and execution.planner.capture.modules:
            provenance.update(
                sourceManifest=execution.planner.capture.manifest(),
            )
            entry = execution.planner.capture.modules.get(
                execution.planner.capture.entry
            )
            if entry:
                record = next(
                    m for m in provenance["sourceManifest"] if m["moduleId"] == entry.id
                )
                provenance.update(
                    entryModuleId=entry.id, entrySourceHash=record["sha256"]
                )
            if hasattr(execution, "root"):
                provenance["sourceClosureHash"] = (
                    execution.planner.capture.closure_hash()
                )
                provenance["resolvedInputs"] = execution.root.record["resolvedInputs"]
        return {
            "protocolVersion": "2",
            "ok": False,
            "diagnostics": [diagnostic],
            "provenance": provenance,
        }


def calculation_call(path: str, *, function: str, inputs: Json) -> Json:
    return invoke(path, function=function, inputs=inputs, frame=sys._getframe(1))


def invoke(path: str, *, function: str, inputs: Json, frame: Any) -> Json:
    active = ACTIVE.get()
    if active is None:
        # Direct Python authoring: preflight the containing calculation closure,
        # then execute this child only. Never replay the caller function.
        source = Path(frame.f_code.co_filename)
        planner = Planner(source)
        module = planner.capture.load(planner.capture.entry)
        fn = module.functions.get(frame.f_code.co_name)
        if fn is None:
            raise SourceError(
                "INVALID_CALL", "calculation_call must be inside a calculation"
            )
        names = [a.arg for a in [*fn.args.args, *fn.args.kwonlyargs]]
        engine = Execution(
            source, fn.name, {name: frame.f_locals[name] for name in names}
        )
        children = [
            c
            for c in engine.root.calls.values()
            if c.call_node.lineno <= frame.f_lineno <= c.call_node.end_lineno
        ]
        if len(children) != 1:
            raise SourceError(
                "INVALID_CALL", "Cannot identify a unique static call site"
            )
        return engine.run(children[0], inputs)
    engine, parent, children = active
    child = next(children, None)
    if (
        child is None
        or child.function.name != function
        or (parent.module.path.parent / path).resolve() != child.module.path
    ):
        raise SourceError(
            "INVALID_CALL",
            "Runtime call differs from preflighted call",
            stage="execution",
        )
    return engine.run(child, inputs)


class ExecuteParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        print(
            json.dumps(
                {
                    "protocolVersion": "2",
                    "ok": False,
                    "diagnostics": [
                        {"code": "INVALID_USAGE", "message": message, "stage": "usage"}
                    ],
                }
            )
        )
        self.exit(2)


def strict_object(pairs: list[tuple[str, Any]]) -> Json:
    result = {}
    for key, value in pairs:
        if key in result:
            raise SourceError(
                "DUPLICATE_INPUT", f"Duplicate JSON key {key!r}", stage="usage"
            )
        result[key] = value
    return result


def execute_from_argv(argv: list[str]) -> int:
    parser = ExecuteParser(
        prog="python -m cso_python execute",
        description="Capture constrained source and return execution evidence; core performs numerical verification.",
    )
    parser.add_argument("source", type=Path)
    parser.add_argument("--function", required=True, action="append")
    parser.add_argument("--inputs-json", action="append", default=[])
    parser.add_argument("--input", action="append", default=[])
    args = parser.parse_args(argv)
    try:
        if len(args.function) != 1 or len(args.inputs_json) > 1:
            raise SourceError(
                "DUPLICATE_OPTION",
                "Duplicate --function or --inputs-json",
                stage="usage",
            )
        if not args.function[0].isidentifier():
            raise SourceError(
                "INVALID_USAGE", "Function must be an identifier", stage="usage"
            )
        inputs = (
            json.loads(args.inputs_json[0], object_pairs_hook=strict_object)
            if args.inputs_json
            else {}
        )
        if not isinstance(inputs, dict):
            raise SourceError(
                "INVALID_INPUTS", "--inputs-json must be an object", stage="usage"
            )
        for assignment in args.input:
            name, sep, value = assignment.partition("=")
            if not sep or not name.isidentifier() or name in inputs:
                raise SourceError(
                    "INVALID_INPUTS",
                    f"Duplicate or invalid input {name!r}",
                    stage="usage",
                )
            inputs[name] = json.loads(value)
        for name, value in inputs.items():
            if not name.isidentifier():
                raise SourceError(
                    "INVALID_INPUTS", f"Invalid parameter {name!r}", stage="usage"
                )
            number(value, stage="usage")
        with authored_output_to_stderr():
            response = execute(args.source, args.function[0], inputs)
    except (SourceError, ValueError) as error:
        diagnostic = (
            error.diagnostic
            if isinstance(error, SourceError)
            else {"code": "INVALID_INPUTS", "message": str(error), "stage": "usage"}
        )
        response = {"protocolVersion": "2", "ok": False, "diagnostics": [diagnostic]}
    print(json.dumps(response, ensure_ascii=False, allow_nan=False))
    return (
        0
        if response["ok"]
        else 2
        if any(d["stage"] == "usage" for d in response["diagnostics"])
        else 1
    )
