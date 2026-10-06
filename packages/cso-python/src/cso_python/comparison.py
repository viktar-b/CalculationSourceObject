"""Declare one symbolic method and bind comparison tables to captured cases."""

from __future__ import annotations

import ast
import hashlib

from .annotations import symbol_annotation
from .source import Json, authoring_name, identity, span

_OPERATORS = {
    "fg.add": "+",
    "fg.subtract": "-",
    "fg.multiply": "*",
    "fg.divide": "/",
    "fg.pow": "^",
}
_DEFERRED_CALLS = {"method", "table", "text", "figure", "document_section"}


def place_comparison(planner, inv, statement: ast.Expr, section: Json, ids: set[str]) -> None:
    call = statement.value
    if not isinstance(call, ast.Call):
        return
    name = authoring_name(call.func)
    if name not in {"method", "table"}:
        return
    if name not in inv.module.imported:
        planner.error(inv, call, "UNSUPPORTED_SYNTAX", "Unimported authoring helper")
    if name == "method":
        _place_method(planner, inv, call, section, ids)
    else:
        _place_table(planner, inv, call, section, ids)


def _keywords(planner, inv, call: ast.Call) -> dict[str, ast.keyword]:
    if call.args or any(keyword.arg is None for keyword in call.keywords):
        planner.error(
            inv,
            call,
            "INVALID_METHOD",
            "Method and table declarations use explicit named arguments",
        )
    found: dict[str, ast.keyword] = {}
    for keyword in call.keywords:
        if keyword.arg in found:
            planner.error(
                inv,
                keyword,
                "INVALID_METHOD",
                f"Duplicate keyword {keyword.arg!r}",
            )
        found[keyword.arg] = keyword
    return found


def _require(planner, inv, found: dict[str, ast.keyword], allowed: set[str], required: set[str]) -> None:
    unknown = found.keys() - allowed
    missing = required - found.keys()
    if unknown or missing:
        planner.error(
            inv,
            next(iter(found.values()), inv.function),
            "INVALID_METHOD",
            f"Unknown keywords {sorted(unknown)}; missing keywords {sorted(missing)}",
        )


def _text(planner, inv, keyword: ast.keyword) -> str:
    value = keyword.value
    if not isinstance(value, ast.Constant) or not isinstance(value.value, str) or not value.value:
        planner.error(inv, keyword, "INVALID_METHOD", f"{keyword.arg} must be a nonempty literal string")
    return value.value


def _place_method(planner, inv, call: ast.Call, section: Json, ids: set[str]) -> None:
    found = _keywords(planner, inv, call)
    _require(planner, inv, found, {"id", "calculation", "title"}, {"id", "calculation", "title"})
    local_id = _text(planner, inv, found["id"])
    title = _text(planner, inv, found["title"])
    method_id = identity("method", inv.id, local_id)
    if method_id in ids or (inv.id, local_id) in planner.method_index:
        planner.error(inv, call, "DUPLICATE_IDENTITY", "Duplicate method or table identity")
    handle_name = found["calculation"].value
    if not isinstance(handle_name, ast.Name) or handle_name.id not in inv.module.handles:
        planner.error(
            inv,
            found["calculation"],
            "INVALID_METHOD",
            "method.calculation must name a calculation handle",
        )
    handle = inv.module.handles[handle_name.id]
    target = planner.capture.load(handle["path"], span(inv.module.id, call))
    function_name = handle["function"]
    if function_name not in target.functions:
        planner.error(inv, call, "MISSING_FUNCTION", f"Missing calculation {function_name}")
    _reject_deferred_content(planner, inv, target, function_name, call)
    definition = planner.definitions.get(target.path, function_name)
    if handle["fingerprint"] is not None and handle["fingerprint"] != definition.fingerprint:
        planner.error(
            inv,
            call,
            "STALE_BINDINGS",
            "Run cso bindings to refresh the changed public interface",
        )
    plan = planner.ensure_plan(inv, target, function_name)
    record = {
        "id": method_id,
        "localId": local_id,
        "invocationId": inv.id,
        "title": title,
        "moduleId": target.id,
        "function": function_name,
        "sourceHash": plan.source_hash,
        "interfaceFingerprint": plan.fingerprint,
        "revision": plan.revision,
        "parameterNames": list(definition.parameters),
        "outputNames": list(definition.outputs),
        "quantities": _quantities(planner, inv, target, definition, plan, call),
        "location": span(inv.module.id, call),
    }
    ids.add(method_id)
    planner.method_index[(inv.id, local_id)] = record
    planner.methods.append(record)
    section["items"].append(
        {
            "kind": "method",
            "id": method_id,
            "metadata": planner.metadata(inv, local_id, call),
        }
    )


def _reject_deferred_content(planner, inv, module, function_name: str, at: ast.AST) -> None:
    function = module.functions[function_name]
    for node in ast.walk(ast.Module(body=function.body, type_ignores=[])):
        if isinstance(node, (ast.IfExp, ast.With)):
            planner.error(
                inv,
                at,
                "UNSUPPORTED_METHOD_CONTENT",
                "Conditional, grouped, or nested method content is not available in this slice",
            )
        if isinstance(node, ast.Call) and authoring_name(node.func) in _DEFERRED_CALLS:
            planner.error(
                inv,
                at,
                "UNSUPPORTED_METHOD_CONTENT",
                "Conditional, grouped, or nested method content is not available in this slice",
            )
        if (
            isinstance(node, ast.Assign)
            and isinstance(node.value, ast.Call)
            and (
                authoring_name(node.value.func) in module.handles
                or authoring_name(node.value.func) == "calculation_call"
            )
        ):
            planner.error(
                inv,
                at,
                "UNSUPPORTED_METHOD_CONTENT",
                "Nested calculation calls stay outside this straight-line method slice",
            )


def _quantities(planner, inv, module, definition, plan, at: ast.AST) -> list[Json]:
    glyphs: dict[str, str] = {}
    quantities: list[Json] = []
    output_variables = {
        output.selection.id: key
        for key, output in definition.outputs.items()
        if isinstance(output.selection, ast.Name)
    }
    planned = {quantity["variableName"]: quantity for quantity in plan.quantities}
    for name, spec in definition.parameters.items():
        if name in definition.given_parameters:
            continue
        metadata = spec.declared.metadata
        if metadata is None:
            planner.error(inv, at, "UNDOCUMENTED_INPUT", f"Parameter {name!r} needs symbol metadata")
        glyphs[name] = metadata["glyph"]
        quantities.append(_quantity(name, name, "input", "input", metadata, [], glyphs))
    for quantity in plan.quantities:
        variable = quantity["variableName"]
        nodes = quantity["nodes"]
        assignment = next(
            (
                step.node
                for step in plan.steps
                if isinstance(step.node, ast.AnnAssign)
                and isinstance(step.node.target, ast.Name)
                and step.node.target.id == variable
            ),
            None,
        )
        if not isinstance(assignment, ast.AnnAssign):
            planner.error(inv, at, "UNSUPPORTED_METHOD_CONTENT", f"Missing declaration for {variable!r}")
        metadata = symbol_annotation(assignment, module.id, module.aliases).metadata
        if metadata is None:
            planner.error(inv, at, "INVALID_METHOD", f"Missing symbol metadata for {variable!r}")
        given = next((node.get("parameter") for node in nodes if node.get("mode") == "GIVEN_PARAMETER"), None)
        if given is not None:
            role = "input"
            selection = given
        elif variable in output_variables:
            role = "output"
            selection = output_variables[variable]
        else:
            role = "intermediate"
            selection = variable
        glyphs[variable] = metadata["glyph"]
        quantities.append(
            _quantity(variable, selection, quantity["kind"], role, metadata, nodes, glyphs)
        )
    del planned
    inputs = {item["selectionName"] for item in quantities if item["role"] == "input"}
    outputs = {item["selectionName"] for item in quantities if item["role"] == "output"}
    if inputs != set(definition.parameters) or outputs != set(definition.outputs):
        planner.error(
            inv,
            at,
            "UNSUPPORTED_METHOD_CONTENT",
            "A straight-line method must explain every public input and output",
        )
    return quantities


def _quantity(variable: str, selection: str, kind: str, role: str, metadata: Json, nodes: list[Json], glyphs: dict[str, str]) -> Json:
    return {
        "variableName": variable,
        "localId": metadata.get("id", variable),
        "kind": kind,
        "role": role,
        "selectionName": selection,
        "glyph": metadata["glyph"],
        "description": metadata["description"],
        "unit": metadata["unit"],
        "formulaText": _formula_text(nodes, glyphs),
        "nodes": nodes,
    }


def _formula_text(nodes: list[Json], glyphs: dict[str, str]) -> str:
    if not nodes:
        return ""
    by_key = {node["key"]: node for node in nodes}

    def walk(key: str) -> str:
        node = by_key[key]
        mode = node["mode"]
        if mode == "LITERAL":
            return str(node.get("draft", node["literal"]["value"]))
        if mode == "SYMBOL":
            name = node["ref"].get("name") or node["ref"].get("output")
            return glyphs.get(name, name)
        if mode == "GIVEN_PARAMETER":
            return glyphs.get(node["parameter"], node["parameter"])
        if mode == "FUNCTION":
            arguments = [walk(argument["key"]) for argument in node["funcArgs"]]
            operator = _OPERATORS.get(node["funcSpec"]["id"])
            if node["funcSpec"]["id"] == "fg.uminus":
                return f"-{arguments[0]}"
            if operator and len(arguments) == 2:
                return f"({arguments[0]} {operator} {arguments[1]})"
            return f"{node['funcSpec']['id']}({', '.join(arguments)})"
        return ""

    return walk(nodes[0]["key"])


def _place_table(planner, inv, call: ast.Call, section: Json, ids: set[str]) -> None:
    found = _keywords(planner, inv, call)
    _require(
        planner,
        inv,
        found,
        {"id", "method", "title", "cases", "inputs", "outputs", "cases_axis"},
        {"id", "method", "title", "cases"},
    )
    local_id = _text(planner, inv, found["id"])
    title = _text(planner, inv, found["title"])
    table_id = identity("table", inv.id, local_id)
    if table_id in ids:
        planner.error(inv, call, "DUPLICATE_IDENTITY", "Duplicate method or table identity")
    method = planner.method_index.get((inv.id, _text(planner, inv, found["method"])))
    if method is None:
        planner.error(inv, found["method"], "UNKNOWN_METHOD", "Table method must be an earlier declaration")
    axis = "columns"
    if "cases_axis" in found:
        axis = _text(planner, inv, found["cases_axis"])
        if axis not in {"columns", "rows"}:
            planner.error(inv, found["cases_axis"], "INVALID_METHOD", "cases_axis must be columns or rows")
        if axis == "rows":
            planner.error(
                inv,
                found["cases_axis"],
                "UNSUPPORTED_TABLE_AXIS",
                "Row orientation is not available in this slice; use cases_axis='columns'",
            )
    inputs = (
        _names(planner, inv, found["inputs"], method["parameterNames"])
        if "inputs" in found
        else list(method["parameterNames"])
    )
    outputs = (
        _names(planner, inv, found["outputs"], method["outputNames"])
        if "outputs" in found
        else list(method["outputNames"])
    )
    cases, cells = _cases(planner, inv, found["cases"].value, method, inputs, outputs)
    record = {
        "id": table_id,
        "localId": local_id,
        "invocationId": inv.id,
        "title": title,
        "methodId": method["id"],
        "casesAxis": axis,
        "inputs": inputs,
        "outputs": outputs,
        "cases": cases,
        "cells": cells,
        "location": span(inv.module.id, call),
    }
    ids.add(table_id)
    planner.tables.append(record)
    section["items"].append(
        {
            "kind": "table",
            "id": table_id,
            "metadata": planner.metadata(inv, local_id, call),
        }
    )


def _names(planner, inv, keyword: ast.keyword, known: list[str]) -> list[str]:
    node = keyword.value
    if not isinstance(node, ast.Tuple):
        planner.error(inv, keyword, "INVALID_METHOD", f"{keyword.arg} must be a literal tuple")
    names: list[str] = []
    for item in node.elts:
        if not isinstance(item, ast.Constant) or not isinstance(item.value, str) or not item.value:
            planner.error(inv, item, "UNKNOWN_QUANTITY", "Quantity selections must be nonempty literal names")
        if item.value in names:
            planner.error(inv, item, "DUPLICATE_QUANTITY", f"Duplicate quantity {item.value!r}")
        if item.value not in known:
            planner.error(inv, item, "UNKNOWN_QUANTITY", f"Unknown quantity {item.value!r}")
        names.append(item.value)
    return names


def _cases(planner, inv, node: ast.AST, method: Json, inputs: list[str], outputs: list[str]) -> tuple[list[Json], list[Json]]:
    if not isinstance(node, ast.Dict):
        planner.error(inv, node, "AMBIGUOUS_CASE_REFERENCE", "Cases must be a literal heading mapping")
    cases: list[Json] = []
    cells: list[Json] = []
    headings: set[str] = set()
    for key, value in zip(node.keys, node.values):
        if not isinstance(key, ast.Constant) or not isinstance(key.value, str) or not key.value:
            planner.error(inv, key or node, "INVALID_METHOD", "Case headings must be nonempty literal strings")
        if key.value in headings:
            planner.error(inv, key, "DUPLICATE_CASE_HEADING", f"Duplicate case heading {key.value!r}")
        headings.add(key.value)
        if not isinstance(value, ast.Name) or value.id not in inv.calls:
            planner.error(
                inv,
                value,
                "AMBIGUOUS_CASE_REFERENCE",
                "Case values must be direct earlier child invocations",
            )
        child = inv.calls[value.id]
        if child.id in planner.grouped_invocations or _overlaps(planner.grouped_invocations, child.id):
            planner.error(inv, value, "OVERLAPPING_TABLE", "A grouped invocation has one table owner")
        if any(
            record["invocationId"] == child.id or record["invocationId"].startswith(child.id + "/")
            for record in [*planner.methods, *planner.tables]
        ):
            planner.error(inv, value, "OVERLAPPING_TABLE", "A grouped invocation has one table owner")
        if (
            child.module.id != method["moduleId"]
            or child.function.name != method["function"]
            or hashlib.sha256(child.module.data).hexdigest() != method["sourceHash"]
        ):
            planner.error(inv, value, "CASE_SOURCE_MISMATCH", "Cases must share the method source revision")
        cases.append(
            {
                "heading": key.value,
                "invocationId": child.id,
                "sectionId": child.section["id"],
            }
        )
        for role, names in (("input", inputs), ("output", outputs)):
            for name in names:
                symbol = child.parameter_symbols[name] if role == "input" else child.outputs[name]
                quantity = next(
                    item
                    for item in method["quantities"]
                    if item["role"] == role and item["selectionName"] == name
                )
                if symbol.cso["unit"] != quantity["unit"]:
                    planner.error(
                        inv,
                        value,
                        "EXACT_UNIT_CONFLICT",
                        f"Quantity {name!r} units differ from the method declaration",
                    )
                cells.append(
                    {
                        "caseInvocationId": child.id,
                        "heading": key.value,
                        "quantity": name,
                        "role": role,
                        "symbolId": symbol.cso["id"],
                        "unit": symbol.cso["unit"],
                    }
                )
        planner.grouped_invocations.add(child.id)
    return cases, cells


def _overlaps(owned: set[str], invocation_id: str) -> bool:
    return any(
        other == invocation_id
        or other.startswith(invocation_id + "/")
        or invocation_id.startswith(other + "/")
        for other in owned
    )
