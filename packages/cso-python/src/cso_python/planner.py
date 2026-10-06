"""Preflight the entire invocation tree and lower independently parsed formulas."""

from __future__ import annotations

import ast
import hashlib
from pathlib import Path
from typing import Any

from .annotations import Annotation, symbol_annotation
from .definitions import Definitions
from .exporter import derived_section_id
from .notation import parse_notation
from .source_plan import compile_source_plan
from .source import (
    Capture,
    Invocation,
    Json,
    SourceError,
    Symbol,
    authoring_name,
    identity,
    kwargs,
    literal,
    number,
    numeric_literal,
    numeric_kind,
    span,
)

class Planner:
    def __init__(self, entry: Path):
        self.capture = Capture(entry)
        self.definitions = Definitions(self.capture)
        self.invocations: list[Invocation] = []
        self.sections: list[Json] = []
        self.assets: dict[str, Json] = {}
        self.asset_files: dict[Path, tuple[Path, bytes]] = {}
        self.source_plans = {}
        self.compiled_plan_keys: list[tuple[str, str, str]] = []

    def unchanged(self) -> bool:
        if not self.capture.unchanged():
            return False
        try:
            return all(
                requested.resolve(strict=True) == resolved
                and resolved.read_bytes() == data
                for requested, (resolved, data) in self.asset_files.items()
            )
        except (OSError, RuntimeError):
            return False

    def error(
        self, inv: Invocation, node: ast.AST, code: str, message: str, **details: Any
    ) -> None:
        chain = []
        current = inv
        while current.parent is not None:
            chain.insert(0, span(current.parent.module.id, current.call_node))
            current = current.parent
        raise SourceError(
            code,
            message,
            location=span(inv.module.id, node),
            callChain=chain,
            **details,
        )

    def metadata(
        self, inv: Invocation, local: str, node: ast.AST, extra: Json | None = None
    ) -> Json:
        return {
            **(extra or {}),
            "localId": local,
            "invocationId": inv.id,
            "location": span(inv.module.id, node),
        }

    def validate_symbol_notation(
        self, inv: Invocation, node: ast.AST, symbol_id: str, spec: Json
    ) -> None:
        for field in ("glyph", "unit"):
            source = spec[field]
            if field == "unit" and source == "":
                continue
            parsed = parse_notation(source)
            if not parsed.ok:
                diagnostic = parsed.diagnostic
                self.error(
                    inv,
                    node,
                    "INVALID_NOTATION",
                    f"Invalid {field} notation ({diagnostic.code}) at offset "
                    f"{diagnostic.offset}: {diagnostic.message}",
                    symbolId=symbol_id,
                )

    def plan(
        self,
        path: Path,
        function: str,
        invocation_id: str = "root",
        *,
        parent: Invocation | None = None,
        call_node: ast.Assign | None = None,
        binding: str | None = None,
        arguments: dict[str, ast.expr] | None = None,
        supplied: Json | None = None,
    ) -> Invocation:
        try:
            return self._plan(
                path,
                function,
                invocation_id,
                parent=parent,
                call_node=call_node,
                binding=binding,
                arguments=arguments,
                supplied=supplied,
            )
        except SourceError as error:
            if parent is not None:
                chain = [span(parent.module.id, call_node)]
                current = parent
                while current.parent is not None:
                    chain.insert(0, span(current.parent.module.id, current.call_node))
                    current = current.parent
                if len(error.diagnostic.get("callChain", [])) < len(chain):
                    error.diagnostic["callChain"] = chain
                if error.diagnostic["code"] in {
                    "INVALID_CALL_INPUTS",
                    "MISSING_REFERENCE",
                    "UNSUPPORTED_SYNTAX",
                }:
                    module = self.capture.modules.get(path.resolve())
                    fn = module.functions.get(function) if module else None
                    if fn and not error.diagnostic.get("relatedLocations"):
                        error.diagnostic["relatedLocations"] = [span(module.id, fn)]
            raise

    def _plan(
        self,
        path: Path,
        function: str,
        invocation_id: str = "root",
        *,
        parent: Invocation | None = None,
        call_node: ast.Assign | None = None,
        binding: str | None = None,
        arguments: dict[str, ast.expr] | None = None,
        supplied: Json | None = None,
    ) -> Invocation:
        location = span(parent.module.id, call_node) if parent else None
        module = self.capture.load(path, location)
        fn = module.functions.get(function)
        if fn is None:
            raise SourceError(
                "MISSING_FUNCTION",
                f"{module.id}: missing function {function}",
                location=location,
            )
        current = parent
        while current:
            if current.module.path == module.path and current.function.name == function:
                self.error(
                    parent,
                    call_node,
                    "DEPENDENCY_CYCLE",
                    f"Recursive dependency: {module.id}:{function}",
                    related=[span(module.id, fn)],
                )
            current = current.parent
        definition = self.definitions.get(path, function)
        parameters = {name: p.node for name, p in definition.parameters.items()}
        defaults = {
            name: p.default
            for name, p in definition.parameters.items()
            if p.default is not None
        }
        decorators = {}
        for dec in fn.decorator_list:
            name = authoring_name(dec.func)
            if name in decorators:
                raise SourceError(
                    "DUPLICATE_IDENTITY",
                    "Duplicate calculation/section decorator",
                    location=span(module.id, dec),
                )
            decorators[name] = dec
        if set(decorators) != {"calculation", "section"}:
            raise SourceError(
                "MISSING_METADATA",
                "Selected calculations require @calculation and @section",
                location=span(module.id, fn),
            )
        calculation = kwargs(
            decorators["calculation"],
            module.id,
            {"id", "title", "schema_version", "metadata"},
            {"id", "title"},
        )
        if calculation.get("schema_version", "1.0.0") != "1.0.0":
            raise SourceError(
                "INVALID_METADATA",
                "Only CSO 1.0.0 is supported",
                location=span(module.id, decorators["calculation"]),
            )
        section = kwargs(
            decorators["section"],
            module.id,
            {"id", "title", "root", "metadata"},
            {"title"},
        )
        section_local = section.get(
            "id", derived_section_id(calculation["id"], fn.name, section["title"])
        )
        section_obj = {
            "id": identity("section", invocation_id, section_local),
            "title": section["title"],
            "items": [],
        }
        record = {
            "id": invocation_id,
            "moduleId": module.id,
            "function": function,
            "resolvedInputs": {},
            "inputBindings": [],
            "symbols": [],
        }
        if parent:
            record.update(
                parentInvocationId=parent.id, callBindingName=binding, callSite=location
            )
        inv = Invocation(
            module,
            fn,
            invocation_id,
            calculation,
            parameters,
            defaults,
            record,
            section_obj,
            call_node=call_node,
            parent=parent,
        )
        section_obj["metadata"] = self.metadata(
            inv, section_local, decorators["section"], section.get("metadata")
        )
        provided = arguments if parent else supplied or {}
        provided = provided or {}
        unknown = provided.keys() - parameters.keys()
        missing = parameters.keys() - provided.keys() - defaults.keys()
        if unknown or missing:
            raise SourceError(
                "INVALID_CALL_INPUTS" if parent else "INVALID_INPUTS",
                f"{module.id}:{function}: unknown inputs {sorted(unknown)}; missing inputs {sorted(missing)}",
                location=location or span(module.id, fn),
                related=[span(module.id, fn)],
                stage="source" if parent else "usage",
            )
        for name, param in parameters.items():
            rec = {"parameterName": name, "parameterLocation": span(module.id, param)}
            if name not in provided:
                value = definition.parameters[name].default_value
                rec.update(
                    kind="parsedDefault",
                    value=value,
                    defaultLocation=span(module.id, defaults[name]),
                )
                if not parent:
                    record["resolvedInputs"][name] = value
            elif parent:
                arg = provided[name]
                if numeric_literal(arg):
                    rec.update(
                        kind="callerLiteral",
                        value=number(
                            literal(arg, parent.module.id), span(parent.module.id, arg)
                        ),
                        callerLocation=span(parent.module.id, arg),
                    )
                else:
                    source = self.reference(parent, arg)
                    rec.update(
                        kind="callerSymbol",
                        source={
                            "symbolId": source.cso["id"],
                            "nodeKey": source.cso["valueTree"]["rootKey"],
                        },
                        callerLocation=span(parent.module.id, arg),
                    )
            else:
                value = number(provided[name], stage="usage")
                rec.update(kind="entrySupplied", value=value)
                record["resolvedInputs"][name] = value
            if "value" in rec:
                rec["numericKind"] = numeric_kind(rec["value"])
            record["inputBindings"].append(rec)
        record["resolvedInputKinds"] = {
            name: numeric_kind(value) for name, value in record["resolvedInputs"].items()
        }
        self.invocations.append(inv)
        self.sections.append(section_obj)
        for name, param in parameters.items():
            declared = definition.parameters[name].declared
            spec = declared.metadata
            if name in definition.given_parameters:
                continue
            binding_record = next(
                b for b in record["inputBindings"] if b["parameterName"] == name
            )
            if spec is not None:
                self.validate_symbol_notation(
                    inv, param, identity("symbol", inv.id, name), spec
                )
            if binding_record["kind"] == "callerSymbol":
                inherited = self.reference(parent, provided[name])
                if spec is not None and spec["unit"] != inherited.cso["unit"]:
                    self.error(
                        inv,
                        param,
                        "INPUT_UNIT_MISMATCH",
                        f"Expected {spec['unit']!r}, received {inherited.cso['unit']!r}",
                    )
                inv.parameter_symbols[name] = inherited
            elif spec is not None:
                self.signature_input(inv, name, declared, binding_record)
        plan = self.ensure_plan(inv, module, function)
        inv.source_plan = plan
        self.body(
            inv,
            section_obj,
            {symbol.cso["id"] for symbol in inv.symbols.values()},
            False,
            plan.steps,
        )
        documented_parameters = {
            symbol.definition["givenSource"]["parameterName"]
            for symbol in inv.symbols.values()
            if symbol.definition["kind"] == "input"
            and symbol.definition["givenSource"]["kind"] == "parameter"
        }
        missing_inputs = (
            parameters.keys() - documented_parameters - inv.parameter_symbols.keys()
        )
        if missing_inputs:
            self.error(
                inv,
                fn,
                "UNDOCUMENTED_INPUT",
                f"Parameters need given(parameter) input symbols: {sorted(missing_inputs)}",
                related=[
                    span(module.id, parameters[name]) for name in sorted(missing_inputs)
                ],
            )
        for name, param in parameters.items():
            candidates = [
                symbol
                for symbol in inv.symbols.values()
                if symbol.definition["kind"] == "input"
                and symbol.definition["givenSource"]
                == {"kind": "parameter", "parameterName": name}
            ]
            symbol = inv.parameter_symbols.get(name) or candidates[0]
            inv.parameter_symbols[name] = symbol
            binding_record = next(
                b for b in record["inputBindings"] if b["parameterName"] == name
            )
            origin = {"kind": "local"}
            if symbol not in candidates:
                origin = self.origin(parent, provided[name])
            elif binding_record["kind"] == "callerSymbol":
                inherited = self.reference(parent, provided[name])
                if inherited.cso["unit"] != symbol.cso["unit"]:
                    self.error(
                        inv,
                        param,
                        "INPUT_UNIT_MISMATCH",
                        "Caller and callee input units differ",
                    )
            inv.parameters_v2.append(
                {
                    "invocationId": inv.id,
                    "parameterName": name,
                    "symbolId": symbol.cso["id"],
                    "numericType": definition.parameters[name].declared.numeric_type,
                    "unit": symbol.cso["unit"],
                    "location": span(module.id, param),
                    "origin": origin,
                }
            )
        return inv

    def signature_input(
        self, inv: Invocation, name: str, declared: Annotation, binding: Json
    ) -> None:
        spec = declared.metadata
        if {"id", "root_key"} & spec.keys():
            self.error(
                inv,
                inv.parameters[name],
                "AMBIGUOUS_METADATA",
                "Signature input identity comes from its parameter name",
            )
        param = inv.parameters[name]
        sid = identity("symbol", inv.id, name)
        definition = {
            "symbolId": sid,
            "localId": name,
            "variableName": name,
            "definitionLocation": span(inv.module.id, param),
            "kind": "input",
            "givenSource": {"kind": "parameter", "parameterName": name},
        }
        cso = {
            "id": sid,
            **(
                {"notationScope": spec["notation_scope"]}
                if "notation_scope" in spec
                else {}
            ),
            "glyph": spec["glyph"],
            "glyphPlaintext": spec["glyph"],
            "description": spec["description"],
            "unit": spec["unit"],
            "comment": spec.get("comment", ""),
            "valueTree": {
                "rootKey": "n1",
                "nodes": [
                    {
                        "key": "n1",
                        "mode": "LITERAL",
                        "literal": {
                            "kind": "number",
                            "value": binding["value"],
                            "numericKind": binding["numericKind"],
                        },
                    }
                ],
            },
            "metadata": self.metadata(inv, name, param),
        }
        symbol = Symbol(name, spec, param, definition, cso, declared.numeric_type)
        inv.symbols[name] = symbol
        inv.parameter_symbols[name] = symbol
        inv.signature_inputs.add(name)
        inv.record["symbols"].append(definition)
        inv.section["items"].append({"kind": "symbol", "symbol": cso})

    def origin(self, inv: Invocation, expr: ast.expr) -> Json:
        if isinstance(expr, ast.Name) and expr.id in inv.parameters:
            return {
                "kind": "parameter",
                "invocationId": inv.id,
                "parameterName": expr.id,
            }
        if isinstance(expr, ast.Subscript) and isinstance(expr.value, ast.Name):
            return {
                "kind": "output",
                "invocationId": inv.calls[expr.value.id].id,
                "outputName": expr.slice.value,
            }
        return {"kind": "symbol", "symbolId": self.reference(inv, expr).cso["id"]}

    def reference(self, inv: Invocation, expr: ast.expr) -> Symbol:
        if isinstance(expr, ast.Name) and expr.id in inv.symbols:
            return inv.symbols[expr.id]
        if isinstance(expr, ast.Name) and expr.id in inv.parameter_symbols:
            return inv.parameter_symbols[expr.id]
        if (
            isinstance(expr, ast.Subscript)
            and isinstance(expr.value, ast.Name)
            and expr.value.id in inv.calls
            and isinstance(expr.slice, ast.Constant)
            and isinstance(expr.slice.value, str)
        ):
            child = inv.calls[expr.value.id]
            if expr.slice.value in child.outputs:
                return child.outputs[expr.slice.value]
            self.error(
                inv,
                expr,
                "MISSING_OUTPUT",
                f"{expr.value.id} has no output {expr.slice.value!r}",
                related=[span(child.module.id, child.function)],
            )
        self.error(
            inv,
            expr,
            "MISSING_REFERENCE",
            "Expected an earlier symbol or literal-key child result",
        )

    def ensure_plan(self, inv: Invocation, module, function: str):
        digest = hashlib.sha256(module.data).hexdigest()
        key = (module.id, function, digest)
        plan = self.source_plans.get(key)
        if plan is None:
            try:
                plan = compile_source_plan(self.definitions, module, function)
            except SourceError as error:
                if "callChain" not in error.diagnostic:
                    chain = []
                    current = inv
                    while current.parent is not None:
                        chain.insert(
                            0, span(current.parent.module.id, current.call_node)
                        )
                        current = current.parent
                    error.diagnostic["callChain"] = chain
                raise
            self.source_plans[key] = plan
            self.compiled_plan_keys.append(key)
        return plan

    def expression(
        self, inv: Invocation, expr: ast.expr, *, given: bool = False
    ) -> list[Json]:
        del given
        plan = inv.source_plan
        symbolic = plan.expressions[id(expr)]
        return self.bind_expression(inv, symbolic)

    def bind_expression(self, inv: Invocation, symbolic: list[Json]) -> list[Json]:
        bound: list[Json] = []
        for source in symbolic:
            item: Json = {
                "key": source["key"],
                "metadata": {
                    "invocationId": inv.id,
                    "location": source["location"],
                },
            }
            if "parameterName" in source:
                item["metadata"]["parameterName"] = source["parameterName"]
            mode = source["mode"]
            if mode == "GIVEN_PARAMETER":
                binding = next(
                    record
                    for record in inv.record["inputBindings"]
                    if record["parameterName"] == source["parameter"]
                )
                if binding["kind"] == "callerSymbol":
                    item.update(
                        mode="SYMBOL", symbol={"id": binding["source"]["symbolId"]}
                    )
                else:
                    item.update(
                        mode="LITERAL",
                        literal={
                            "kind": "number",
                            "value": binding["value"],
                            "numericKind": binding["numericKind"],
                        },
                    )
            elif mode == "SYMBOL":
                symbol = self.reference(inv, source["_ast"])
                item.update(mode="SYMBOL", symbol={"id": symbol.cso["id"]})
                ref = source["ref"]
                if ref["kind"] == "output":
                    item["metadata"].update(
                        outputInvocationId=inv.calls[ref["call"]].id,
                        outputName=ref["output"],
                    )
            elif mode == "LITERAL":
                literal_node = {
                    "kind": "number",
                    "numericKind": source["literal"]["numericKind"],
                    "value": source["literal"]["value"],
                }
                if "draft" in source:
                    item.update(mode="LITERAL", draft=source["draft"], literal=literal_node)
                else:
                    item.update(mode="LITERAL", literal=literal_node)
            elif mode == "FUNCTION":
                item.update(
                    mode="FUNCTION",
                    funcSpec={"id": source["funcSpec"]["id"]},
                    funcArgs=[{"key": arg["key"]} for arg in source["funcArgs"]],
                )
            else:
                raise SourceError(
                    "UNSUPPORTED_SYNTAX",
                    f"Unsupported planned expression {mode}",
                    location=source["location"],
                )
            bound.append(item)
        return bound

    def body(
        self,
        inv: Invocation,
        section: Json,
        ids: set[str],
        grouped: bool,
        steps: list,
    ) -> None:
        for step in steps:
            node = step.node
            if isinstance(node, ast.AnnAssign):
                if (
                    not isinstance(node.target, ast.Name)
                    or node.value is None
                    or node.target.id in inv.symbols
                    or node.target.id in inv.calls
                    or node.target.id in inv.parameter_symbols
                    or node.target.id in inv.module.imported
                    or node.target.id.startswith("__cso_")
                ):
                    self.error(
                        inv,
                        node,
                        "DUPLICATE_IDENTITY",
                        "Symbols need unique simple names distinct from imports",
                    )
                declared = symbol_annotation(node, inv.module.id, inv.module.aliases)
                spec = declared.metadata
                name = node.target.id
                local = spec.get("id", name)
                sid = identity("symbol", inv.id, local)
                self.validate_symbol_notation(inv, node, sid, spec)
                if sid in ids:
                    self.error(
                        inv, node, "DUPLICATE_IDENTITY", f"Duplicate symbol ID {local}"
                    )
                ids.add(sid)
                nodes = self.expression(inv, node.value, given=True)
                root_key = spec.get("root_key", "n1")
                if root_key != "n1":
                    if any(n["key"] == root_key for n in nodes[1:]):
                        self.error(
                            inv,
                            node,
                            "DUPLICATE_IDENTITY",
                            "Root key collides with a formula node",
                        )
                    nodes[0]["key"] = root_key
                for operand in nodes:
                    if "parameterName" in operand.get("metadata", {}):
                        inv.uses.append(
                            {
                                "invocationId": inv.id,
                                "parameterName": operand["metadata"]["parameterName"],
                                "address": {"symbolId": sid, "nodeKey": operand["key"]},
                                "location": operand["metadata"]["location"],
                            }
                        )
                definition = {
                    "symbolId": sid,
                    "localId": local,
                    "variableName": name,
                    "definitionLocation": span(inv.module.id, node),
                }
                expr = node.value
                if isinstance(expr, ast.Call) and authoring_name(expr.func) == "given":
                    arg = expr.args[0]
                    source = (
                        {"kind": "parameter", "parameterName": arg.id}
                        if isinstance(arg, ast.Name)
                        else {
                            "kind": "literal",
                            "value": literal(arg, inv.module.id),
                            "numericKind": numeric_kind(literal(arg, inv.module.id)),
                            "location": span(inv.module.id, arg),
                        }
                    )
                    definition.update(kind="input", givenSource=source)
                elif numeric_literal(expr):
                    definition.update(
                        kind="constant",
                        literal={
                            "value": literal(expr, inv.module.id),
                            "numericKind": numeric_kind(literal(expr, inv.module.id)),
                            "location": span(inv.module.id, expr),
                        },
                    )
                elif (
                    isinstance(expr, ast.Call)
                    and authoring_name(expr.func) == "documented_result"
                ):
                    definition.update(
                        kind="unsupported", reason="documented_result escape hatch"
                    )
                else:
                    definition.update(
                        kind="formula", address={"symbolId": sid, "nodeKey": root_key}
                    )
                symbol = {
                    "id": sid,
                    **(
                        {"notationScope": spec["notation_scope"]}
                        if "notation_scope" in spec
                        else {}
                    ),
                    "glyph": spec["glyph"],
                    "glyphPlaintext": spec["glyph"],
                    "description": spec["description"],
                    "unit": spec["unit"],
                    "comment": spec.get("comment", ""),
                    "valueTree": {"rootKey": root_key, "nodes": nodes},
                    "metadata": self.metadata(inv, local, node),
                }
                inv.symbols[name] = Symbol(
                    name, spec, node, definition, symbol, declared.numeric_type
                )
                inv.record["symbols"].append(definition)
                section["items"].append({"kind": "symbol", "symbol": symbol})
            elif isinstance(node, ast.Assign) and not grouped:
                if not (
                    len(node.targets) == 1
                    and isinstance(node.targets[0], ast.Name)
                    and isinstance(node.value, ast.Call)
                    and authoring_name(node.value.func) == "calculation_call"
                    and (
                        "calculation_call" in inv.module.imported or inv.module.handles
                    )
                ):
                    self.error(
                        inv,
                        node,
                        "UNSUPPORTED_SYNTAX",
                        "Only calculation_call permits unannotated assignment",
                    )
                overlapping = [
                    child.call_node
                    for child in inv.calls.values()
                    if child.call_node.lineno <= node.end_lineno
                    and node.lineno <= child.call_node.end_lineno
                ]
                if overlapping:
                    self.error(
                        inv,
                        node,
                        "AMBIGUOUS_CALL_SITE",
                        "Dependency call statements must occupy separate source lines",
                        related=[
                            span(inv.module.id, previous) for previous in overlapping
                        ],
                    )
                binding = node.targets[0].id
                if (
                    binding in inv.symbols
                    or binding in inv.calls
                    or binding in inv.parameters
                    or binding in inv.module.imported
                ):
                    self.error(
                        inv,
                        node,
                        "DUPLICATE_IDENTITY",
                        f"Duplicate call binding {binding}",
                    )
                call = node.value
                if (
                    len(call.args) != 1
                    or len(call.keywords) != 2
                    or {kw.arg for kw in call.keywords} != {"function", "inputs"}
                ):
                    self.error(
                        inv,
                        call,
                        "INVALID_CALL",
                        "calculation_call requires path, function and inputs",
                    )
                path = literal(call.args[0], inv.module.id)
                kw = {k.arg: k.value for k in call.keywords}
                function = literal(kw["function"], inv.module.id)
                if (
                    not isinstance(path, str)
                    or not path
                    or Path(path).is_absolute()
                    or "\\" in path
                    or ":" in path
                    or not isinstance(function, str)
                    or not function.isidentifier()
                ):
                    self.error(
                        inv,
                        call,
                        "INVALID_CALL",
                        "Use a static relative path and function name",
                    )
                mapping = kw["inputs"]
                if not isinstance(mapping, ast.Dict):
                    self.error(
                        inv,
                        mapping,
                        "INVALID_CALL_INPUTS",
                        "Call inputs must be a literal-key mapping",
                    )
                arguments = {}
                for key, value in zip(mapping.keys, mapping.values):
                    if (
                        not isinstance(key, ast.Constant)
                        or not isinstance(key.value, str)
                        or key.value in arguments
                    ):
                        # Parse callee before rejecting, retaining both locations.
                        child = self.capture.load(
                            inv.module.path.parent / path, span(inv.module.id, call)
                        )
                        callee = child.functions.get(function)
                        self.error(
                            inv,
                            mapping,
                            "INVALID_CALL_INPUTS",
                            "Duplicate call input or nonliteral key",
                            related=[span(child.id, callee)] if callee else [],
                        )
                    arguments[key.value] = value
                child = self.plan(
                    inv.module.path.parent / path,
                    function,
                    inv.id + "/" + binding,
                    parent=inv,
                    call_node=node,
                    binding=binding,
                    arguments=arguments,
                )
                inv.calls[binding] = child
                section["items"].append(
                    {
                        "kind": "section",
                        "id": child.section["id"],
                        "metadata": {
                            "invocationId": inv.id,
                            "location": span(inv.module.id, node),
                        },
                    }
                )
            elif isinstance(node, ast.With) and not grouped:
                if (
                    len(node.items) != 1
                    or node.items[0].optional_vars is not None
                    or not isinstance(node.items[0].context_expr, ast.Call)
                    or authoring_name(node.items[0].context_expr.func)
                    != "document_section"
                    or "document_section" not in inv.module.imported
                ):
                    self.error(
                        inv,
                        node,
                        "UNSUPPORTED_SYNTAX",
                        "Only one unaliased document_section group is supported",
                    )
                config = kwargs(
                    node.items[0].context_expr,
                    inv.module.id,
                    {"id", "title", "metadata"},
                    {"id", "title"},
                )
                sid = identity("section", inv.id, config["id"])
                if sid == inv.section["id"] or sid in ids:
                    self.error(
                        inv, node, "DUPLICATE_IDENTITY", "Duplicate section identity"
                    )
                ids.add(sid)
                child = {
                    "id": sid,
                    "title": config["title"],
                    "metadata": self.metadata(
                        inv, config["id"], node, config.get("metadata")
                    ),
                    "items": [],
                }
                self.sections.append(child)
                section["items"].append(
                    {
                        "kind": "section",
                        "id": sid,
                        "metadata": self.metadata(inv, config["id"], node),
                    }
                )
                self.body(inv, child, ids, True, step.child_steps or [])
            elif (
                isinstance(node, ast.Expr)
                and isinstance(node.value, ast.Call)
                and authoring_name(node.value.func) in {"text", "figure"}
            ):
                self.content(inv, node, section, ids)
            elif isinstance(node, ast.Return) and not grouped:
                definition = self.definitions.get(inv.module.path, inv.function.name)
                for key, output in definition.outputs.items():
                    value = output.selection
                    self.expression(inv, value)
                    symbol = (
                        inv.symbols[key]
                        if definition.legacy_return
                        else self.reference(inv, value)
                    )
                    source = (
                        {"kind": "symbol", "symbolId": symbol.cso["id"]}
                        if definition.legacy_return
                        else self.origin(inv, value)
                    )
                    inv.outputs[key] = symbol
                    inv.output_records.append(
                        {
                            "invocationId": inv.id,
                            "name": key,
                            "symbolId": symbol.cso["id"],
                            "source": source,
                            "location": span(inv.module.id, value),
                        }
                    )
            else:
                self.error(
                    inv,
                    node,
                    "UNSUPPORTED_SYNTAX",
                    f"Unsupported statement {type(node).__name__}",
                )

    def content(
        self, inv: Invocation, node: ast.Expr, section: Json, ids: set[str]
    ) -> None:
        import hashlib

        kind = authoring_name(node.value.func)
        if kind not in inv.module.imported:
            self.error(inv, node, "UNSUPPORTED_SYNTAX", f"Unimported helper {kind}")
        fields = (
            {"id", "content"}
            if kind == "text"
            else {"id", "path", "media_type", "caption", "alt"}
        )
        data = kwargs(node.value, inv.module.id, fields, fields)
        item_id = identity(kind, inv.id, data["id"])
        if item_id in ids:
            self.error(inv, node, "DUPLICATE_IDENTITY", "Duplicate content ID")
        ids.add(item_id)
        item = {
            "kind": kind,
            "id": item_id,
            "metadata": self.metadata(inv, data["id"], node),
        }
        if kind == "text":
            item["text"] = {"content": data["content"]}
        else:
            path = data["path"]
            if Path(path).is_absolute() or "\\" in path or ":" in path or "\0" in path:
                self.error(
                    inv,
                    node,
                    "INVALID_ASSET_PATH",
                    "Figure needs a module-relative local path",
                )
            try:
                requested_asset = inv.module.path.parent / path
                asset_path = requested_asset.resolve(strict=True)
                asset_path.relative_to(self.capture.root)
                asset_bytes = asset_path.read_bytes()
            except (OSError, ValueError, RuntimeError) as error:
                self.error(
                    inv,
                    node,
                    "INVALID_ASSET_PATH",
                    f"Missing or escaping asset: {path}: {error}",
                )
            self.asset_files[requested_asset.absolute()] = (asset_path, asset_bytes)
            if data["media_type"] not in {"image/png", "image/jpeg", "image/svg+xml"}:
                self.error(
                    inv, node, "UNSUPPORTED_ASSET", "Unsupported figure media type"
                )
            asset_id = identity("figure", inv.id, data["id"])
            self.assets[asset_id] = {
                "id": asset_id,
                "moduleId": inv.module.id,
                "path": path,
                "mediaType": data["media_type"],
                "sha256": hashlib.sha256(asset_bytes).hexdigest(),
            }
            item["figure"] = {
                "assetId": asset_id,
                "caption": data["caption"],
                "alt": data["alt"],
            }
        section["items"].append(item)
