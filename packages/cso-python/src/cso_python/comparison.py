"""Declare one symbolic method and bind comparison tables to captured cases."""

from __future__ import annotations

import ast
import hashlib
from pathlib import Path

from .annotations import symbol_annotation
from .source import Json, SourceError, authoring_name, identity, kwargs, span
from .source_plan import _describe_call, lower_expression

_OPERATORS = {
    "fg.add": "+",
    "fg.subtract": "-",
    "fg.multiply": "*",
    "fg.divide": "/",
    "fg.pow": "^",
}


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
    quantities = _quantities(planner, inv, target, definition, plan, call)
    content, helpers = _method_content(
        planner,
        inv,
        target,
        definition,
        plan,
        quantities,
        method_id,
        call,
        {(target.id, function_name)},
        {},
    )
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
        "quantities": quantities,
        "content": content,
        "helpers": helpers,
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
        if isinstance(node, ast.IfExp):
            planner.error(
                inv,
                at,
                "UNSUPPORTED_METHOD_CONTENT",
                "Conditional method content is not available in this slice",
            )
        if isinstance(node, ast.With) and not _is_document_section(node):
            planner.error(
                inv,
                at,
                "UNSUPPORTED_METHOD_CONTENT",
                "Only document sections can group method content",
            )


def _is_document_section(node: ast.AST) -> bool:
    return (
        isinstance(node, ast.With)
        and len(node.items) == 1
        and node.items[0].optional_vars is None
        and isinstance(node.items[0].context_expr, ast.Call)
        and authoring_name(node.items[0].context_expr.func) == "document_section"
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
            ref = node["ref"]
            if ref.get("kind") == "output":
                return f"{ref['call']}.{ref['output']}"
            name = ref.get("name") or ref.get("output")
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


def _method_content(
    planner,
    inv,
    module,
    definition,
    plan,
    quantities: list[Json],
    owner_id: str,
    at: ast.AST,
    stack: set[tuple[str, str]],
    cache: dict[tuple[str, str], Json],
) -> tuple[list[Json], list[Json]]:
    glyphs = {
        item["selectionName"] if item["role"] == "input" else item["variableName"]: item["glyph"]
        for item in quantities
    }
    for item in quantities:
        glyphs.setdefault(item["variableName"], item["glyph"])
    content: list[Json] = [
        {"kind": "quantity", "variableName": name}
        for name in definition.parameters
        if name not in definition.given_parameters
    ]
    helpers: list[Json] = []
    _walk_steps(
        planner,
        inv,
        module,
        definition,
        glyphs,
        content,
        helpers,
        owner_id,
        plan.steps,
        stack,
        cache,
        at,
    )
    seen = _content_variables(content)
    if any(item["variableName"] not in seen for item in quantities):
        planner.error(
            inv,
            at,
            "UNSUPPORTED_METHOD_CONTENT",
            "Method content must include every explained quantity",
        )
    return content, helpers


def _walk_steps(
    planner,
    inv,
    module,
    definition,
    glyphs: dict[str, str],
    content: list[Json],
    helpers: list[Json],
    owner_id: str,
    steps,
    stack: set[tuple[str, str]],
    cache: dict[tuple[str, str], Json],
    at: ast.AST,
) -> None:
    for step in steps:
        node = step.node
        if isinstance(node, ast.Return):
            continue
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            content.append({"kind": "quantity", "variableName": node.target.id})
            continue
        if isinstance(node, ast.With):
            if not _is_document_section(node) or "document_section" not in module.imported:
                planner.error(inv, node, "UNSUPPORTED_METHOD_CONTENT", "Only document sections can group method content")
            config = kwargs(
                node.items[0].context_expr,
                module.id,
                {"id", "title", "metadata"},
                {"id", "title"},
            )
            nested: list[Json] = []
            _walk_steps(
                planner,
                inv,
                module,
                definition,
                glyphs,
                nested,
                helpers,
                owner_id,
                step.child_steps or [],
                stack,
                cache,
                at,
            )
            content.append(
                {
                    "kind": "section",
                    "localId": config["id"],
                    "title": config["title"],
                    "content": nested,
                }
            )
            continue
        described = _describe_call(node)
        if described is not None:
            helper = _helper(planner, inv, module, described, owner_id, stack, cache, node)
            if not any(item["id"] == helper["id"] for item in helpers):
                helpers.append(helper)
            content.append(
                {
                    "kind": "call",
                    "binding": described["binding"],
                    "helperId": helper["id"],
                    "inputs": _call_formulas(module, definition, node, glyphs),
                    "outputs": list(helper["outputNames"]),
                }
            )
            continue
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            name = authoring_name(node.value.func)
            if name in {"method", "table"}:
                continue
            if name == "text":
                data = kwargs(node.value, module.id, {"id", "content"}, {"id", "content"})
                content.append({"kind": "text", "localId": data["id"], "content": data["content"]})
                continue
            if name == "figure":
                data = kwargs(
                    node.value,
                    module.id,
                    {"id", "path", "media_type", "caption", "alt"},
                    {"id", "path", "media_type", "caption", "alt"},
                )
                content.append(
                    {
                        "kind": "figure",
                        "localId": data["id"],
                        "assetId": _remember_figure(planner, module, data, owner_id, node),
                        "caption": data["caption"],
                        "alt": data["alt"],
                    }
                )
                continue
        planner.error(
            inv,
            node,
            "UNSUPPORTED_METHOD_CONTENT",
            f"Unsupported method statement {type(node).__name__}",
        )


def _call_formulas(module, definition, node: ast.Assign, glyphs: dict[str, str]) -> list[Json]:
    keywords = {keyword.arg: keyword.value for keyword in node.value.keywords}
    mapping = keywords.get("inputs")
    if not isinstance(mapping, ast.Dict):
        return []
    formulas = []
    for key, value in zip(mapping.keys, mapping.values):
        if not isinstance(key, ast.Constant) or not isinstance(key.value, str):
            continue
        nodes = lower_expression(
            module,
            definition.function,
            set(definition.parameters),
            value,
            given=False,
        )
        formulas.append(
            {
                "name": key.value,
                "formulaText": _formula_text(
                    [{item_key: item_value for item_key, item_value in item.items() if item_key != "_ast"} for item in nodes],
                    glyphs,
                ),
            }
        )
    return formulas


def _helper(planner, inv, module, described: Json, owner_id: str, stack, cache, at: ast.AST) -> Json:
    loaded = planner.capture.load(module.path.parent / described["path"], span(module.id, at))
    function_name = described["function"]
    key = (loaded.id, function_name)
    cached = cache.get(key)
    if cached is not None:
        return cached
    if key in stack:
        planner.error(inv, at, "UNSUPPORTED_METHOD_CONTENT", "Method dependencies must not cycle")
    if function_name not in loaded.functions:
        planner.error(inv, at, "MISSING_FUNCTION", f"Missing calculation {function_name}")
    _reject_deferred_content(planner, inv, loaded, function_name, at)
    definition = planner.definitions.get(loaded.path, function_name)
    plan = planner.ensure_plan(inv, loaded, function_name)
    helper_id = identity("method", owner_id, f"{loaded.id}::{function_name}")
    stack.add(key)
    quantities = _quantities(planner, inv, loaded, definition, plan, at)
    content, nested = _method_content(
        planner,
        inv,
        loaded,
        definition,
        plan,
        quantities,
        helper_id,
        at,
        stack,
        cache,
    )
    record = {
        "id": helper_id,
        "moduleId": loaded.id,
        "function": function_name,
        "sourceHash": plan.source_hash,
        "revision": plan.revision,
        "parameterNames": list(definition.parameters),
        "outputNames": list(definition.outputs),
        "quantities": quantities,
        "content": content,
        "helpers": nested,
    }
    cache[key] = record
    stack.remove(key)
    return record


def _content_variables(content: list[Json]) -> set[str]:
    found: set[str] = set()
    for item in content:
        if item["kind"] == "quantity":
            found.add(item["variableName"])
        elif item["kind"] == "section":
            found.update(_content_variables(item["content"]))
    return found


def _remember_figure(planner, module, data: Json, owner_id: str, node: ast.AST) -> str:
    path = data["path"]
    if Path(path).is_absolute() or "\\" in path or ":" in path or "\0" in path:
        raise SourceError(
            "INVALID_ASSET_PATH",
            "Figure needs a module-relative local path",
            location=span(module.id, node),
        )
    try:
        requested = module.path.parent / path
        asset_path = requested.resolve(strict=True)
        asset_path.relative_to(planner.capture.root)
        asset_bytes = asset_path.read_bytes()
    except (OSError, ValueError, RuntimeError) as error:
        raise SourceError(
            "INVALID_ASSET_PATH",
            f"Missing or escaping asset: {path}: {error}",
            location=span(module.id, node),
        ) from error
    if data["media_type"] not in {"image/png", "image/jpeg", "image/svg+xml"}:
        raise SourceError(
            "UNSUPPORTED_ASSET",
            "Unsupported figure media type",
            location=span(module.id, node),
        )
    asset_id = identity("figure", owner_id, data["id"])
    planner.asset_files[requested.absolute()] = (asset_path, asset_bytes)
    planner.assets[asset_id] = {
        "id": asset_id,
        "moduleId": module.id,
        "path": path,
        "mediaType": data["media_type"],
        "sha256": hashlib.sha256(asset_bytes).hexdigest(),
    }
    return asset_id


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
