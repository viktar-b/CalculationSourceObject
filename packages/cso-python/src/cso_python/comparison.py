"""Declare one symbolic method and bind comparison tables to captured cases."""

from __future__ import annotations

import ast
import builtins
import math

from .function_calls import FUNCTION_CALLS
import hashlib
from pathlib import Path

from .annotations import symbol_annotation
from .source import Json, SourceError, authoring_name, identity, kwargs, span
from .source_plan import _describe_call, lower_expression

_NUMERIC_CALLS = {call.function_id: getattr(math if call.module == "math" else builtins, call.name) for call in FUNCTION_CALLS}

_OPERATORS = {
    "fg.add": "+",
    "fg.subtract": "-",
    "fg.multiply": "*",
    "fg.divide": "/",
    "fg.pow": "^",
}
_COMPARISONS = {
    "fg.lt": "<",
    "fg.le": "<=",
    "fg.gt": ">",
    "fg.ge": ">=",
    "fg.eq": "==",
    "fg.ne": "!=",
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
    content, helpers, checks, applicability = _method_content(
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
        "metadata": _section_metadata(target, definition.function),
        "content": content,
        "helpers": _unique_helpers(helpers, set()),
        "location": span(inv.module.id, call),
    }
    if checks:
        record["checks"] = checks
    if applicability:
        record["applicability"] = applicability
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


def _unique_helpers(helpers: list[Json], seen: set[str]) -> list[Json]:
    """Keep one definition when distinct call paths share a dependency."""
    unique = []
    for helper in helpers:
        if helper["id"] in seen:
            continue
        seen.add(helper["id"])
        unique.append({**helper, "helpers": _unique_helpers(helper["helpers"], seen)})
    return unique


def _section_metadata(module, function: ast.FunctionDef) -> Json:
    for decorator in function.decorator_list:
        if isinstance(decorator, ast.Call) and authoring_name(decorator.func) == "section":
            config = kwargs(decorator, module.id, {"id", "title", "root", "metadata"}, {"title"})
            return config.get("metadata", {})
    return {}


def _reject_deferred_content(planner, inv, module, function_name: str, at: ast.AST) -> None:
    function = module.functions[function_name]
    for node in ast.walk(ast.Module(body=function.body, type_ignores=[])):
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
        assignment = _declared_assignment(plan.steps, variable)
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
    # A public return can forward a parameter or a child output without a
    # local assignment. Describe that selection, but keep the table bound to
    # the original captured symbol through child.outputs.
    represented = {item["selectionName"] for item in quantities if item["role"] == "output"}
    occupied = {item["variableName"] for item in quantities}
    for index, (name, output) in enumerate(definition.outputs.items()):
        if name in represented:
            continue
        variable = f"__return_{index}"
        while variable in occupied:
            variable += "_"
        occupied.add(variable)
        nodes = [
            {key: value for key, value in node.items() if key != "_ast"}
            for node in lower_expression(
                module, definition.function, set(definition.parameters), output.selection, given=False,
            )
        ]
        metadata = output.annotation.metadata
        if metadata is None:
            planner.error(inv, at, "INVALID_METHOD", f"Output {name!r} needs symbol metadata")
        quantities.append(_quantity(variable, name, "formula", "output", metadata, nodes, glyphs))
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


def _formula_text(nodes: list[Json], glyphs: dict[str, str], key: str | None = None) -> str:
    if not nodes:
        return ""
    by_key = {node["key"]: node for node in nodes}

    def walk(node_key: str) -> str:
        node = by_key[node_key]
        mode = node["mode"]
        if mode == "LITERAL":
            return str(node.get("draft", node["literal"]["value"]))
        if mode == "SYMBOL":
            ref = node.get("ref") or {}
            if ref.get("kind") == "output":
                return f"{ref['call']}.{ref['output']}"
            name = ref.get("name") or ref.get("output")
            return glyphs.get(name, name or node_key)
        if mode == "GIVEN_PARAMETER":
            return glyphs.get(node["parameter"], node["parameter"])
        if mode == "FUNCTION":
            arguments = [argument["key"] for argument in node["funcArgs"]]
            function_id = node["funcSpec"]["id"]
            if function_id == "fg.cnd":
                return f"({walk(arguments[1])} if {walk(arguments[0])} else {walk(arguments[2])})"
            if function_id in {"fg.and", "fg.or"}:
                joiner = " and " if function_id == "fg.and" else " or "
                return f"({joiner.join(walk(argument) for argument in arguments)})"
            comparison = _COMPARISONS.get(function_id)
            if comparison and len(arguments) == 2:
                return f"{walk(arguments[0])} {comparison} {walk(arguments[1])}"
            rendered = [walk(argument) for argument in arguments]
            operator = _OPERATORS.get(function_id)
            if function_id == "fg.uminus":
                return f"-{rendered[0]}"
            if operator and len(rendered) == 2:
                return f"({rendered[0]} {operator} {rendered[1]})"
            return f"{function_id}({', '.join(rendered)})"
        return ""

    return walk(key or nodes[0]["key"])


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
) -> tuple[list[Json], list[Json], list[Json], list[Json]]:
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
    checks: list[Json] = []
    applicability: list[Json] = []
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
        checks,
        applicability,
        {item["variableName"] for item in quantities},
    )
    seen = _content_variables(content)
    # Forwarded returns have no assignment placement in the source plan.
    content.extend(
        {"kind": "quantity", "variableName": item["variableName"]}
        for item in quantities
        if item["role"] == "output" and item["variableName"] not in seen
    )
    seen = _content_variables(content)
    if any(item["variableName"] not in seen for item in quantities):
        planner.error(
            inv,
            at,
            "UNSUPPORTED_METHOD_CONTENT",
            "Method content must include every explained quantity",
        )
    return content, helpers, checks, applicability


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
    checks: list[Json],
    applicability: list[Json],
    names: set[str],
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
                checks,
                applicability,
                names,
            )
            content.append(
                {
                    "kind": "section",
                    "localId": config["id"],
                    "title": config["title"],
                    "metadata": config.get("metadata", {}),
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
            if name in {"check", "applicable"}:
                declared = _check_declaration(
                    planner,
                    inv,
                    module,
                    definition,
                    glyphs,
                    node.value,
                    names,
                    checks if name == "check" else applicability,
                )
                if name == "check":
                    checks.append(declared)
                    content.append({"kind": "check", "localId": declared["id"]})
                else:
                    applicability.append(declared)
                    content.append({"kind": "applicability", "localId": declared["id"]})
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
        nodes = [
            {item_key: item_value for item_key, item_value in item.items() if item_key != "_ast"}
            for item in lower_expression(
                module,
                definition.function,
                set(definition.parameters),
                value,
                given=False,
            )
        ]
        formulas.append(
            {
                "name": key.value,
                "formulaText": _formula_text(nodes, glyphs),
                "nodes": nodes,
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
    content, nested, helper_checks, helper_applicability = _method_content(
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
        "metadata": _section_metadata(loaded, definition.function),
        "content": content,
        "helpers": nested,
    }
    if helper_checks:
        record["checks"] = helper_checks
    if helper_applicability:
        record["applicability"] = helper_applicability
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


def _declared_assignment(steps, variable: str) -> ast.AnnAssign | None:
    for step in steps:
        node = step.node
        if (
            isinstance(node, ast.AnnAssign)
            and isinstance(node.target, ast.Name)
            and node.target.id == variable
        ):
            return node
        found = _declared_assignment(step.child_steps or [], variable)
        if found is not None:
            return found
    return None


def _place_table(planner, inv, call: ast.Call, section: Json, ids: set[str]) -> None:
    found = _keywords(planner, inv, call)
    _require(
        planner,
        inv,
        found,
        {"id", "method", "title", "cases", "inputs", "outputs", "cases_axis", "column_cap"},
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
    if "column_cap" in found:
        record["columnCap"] = _column_cap(planner, inv, found["column_cap"])
    ids.add(table_id)
    planner.tables.append(record)
    section["items"].append(
        {
            "kind": "table",
            "id": table_id,
            "metadata": planner.metadata(inv, local_id, call),
        }
    )


def _column_cap(planner, inv, keyword: ast.keyword) -> int:
    value = keyword.value
    if (
        not isinstance(value, ast.Constant)
        or isinstance(value.value, bool)
        or not isinstance(value.value, int)
        or value.value < 1
    ):
        planner.error(inv, keyword, "INVALID_METHOD", "column_cap must be a positive integer")
    return value.value


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


def _check_declaration(planner, inv, module, definition, glyphs, call: ast.Call, names: set[str], checks: list[Json]) -> Json:
    found = _keywords(planner, inv, call)
    _require(
        planner,
        inv,
        found,
        {"id", "targets", "explanation", "predicate"},
        {"id", "targets", "explanation", "predicate"},
    )
    local_id = _text(planner, inv, found["id"])
    if any(item["id"] == local_id for item in checks):
        planner.error(inv, found["id"], "DUPLICATE_IDENTITY", "Duplicate check identity")
    targets = _string_tuple(planner, inv, found["targets"])
    unknown = [name for name in targets if name not in names]
    if unknown or len(targets) != len(set(targets)):
        planner.error(inv, found["targets"], "UNKNOWN_QUANTITY", "Check targets must name known quantities")
    explanation = _text(planner, inv, found["explanation"])
    nodes = [
        {key: value for key, value in node.items() if key != "_ast"}
        for node in lower_expression(
            module,
            definition.function,
            set(definition.parameters),
            found["predicate"].value,
            given=False,
            condition=True,
        )
    ]
    return {
        "id": local_id,
        "targets": targets,
        "explanation": explanation,
        "predicateText": _formula_text(nodes, glyphs),
        "nodes": nodes,
    }


def _string_tuple(planner, inv, keyword: ast.keyword) -> list[str]:
    value = keyword.value
    if not isinstance(value, ast.Tuple) or not value.elts:
        planner.error(inv, keyword, "INVALID_METHOD", "targets must be a nonempty tuple of quantity names")
    names: list[str] = []
    for item in value.elts:
        if not isinstance(item, ast.Constant) or not isinstance(item.value, str) or not item.value:
            planner.error(inv, item, "INVALID_METHOD", "targets must be a nonempty tuple of quantity names")
        names.append(item.value)
    return names


def collect_applicability_outcomes(planner) -> list[Json]:
    return _collect_condition_outcomes(planner, "applicability", "applicabilityId")


def collect_check_outcomes(planner) -> list[Json]:
    return _collect_condition_outcomes(planner, "checks", "checkId")


def _collect_condition_outcomes(planner, field: str, identity_field: str) -> list[Json]:
    """Record declared predicates using the single captured execution."""
    outcomes: list[Json] = []

    def walk(plan: Json) -> None:
        for condition in plan.get(field) or []:
            for invocation in planner.invocations:
                if invocation.function.name != plan["function"] or invocation.module.id != plan["moduleId"]:
                    continue
                value, used = _check_value(condition["nodes"], _named_values(invocation))
                outcomes.append({
                    "methodId": plan["id"],
                    "invocationId": invocation.id,
                    identity_field: condition["id"],
                    "value": value,
                    "usedKeys": sorted(used),
                })
        for helper in plan.get("helpers") or []:
            walk(helper)

    for method in planner.methods:
        walk(method)
    return outcomes


def _named_values(invocation) -> dict[str, int | float]:
    values: dict[str, int | float] = {}
    for name, symbol in (*invocation.parameter_symbols.items(), *invocation.symbols.items()):
        result = symbol.cso["valueTree"].get("result")
        if isinstance(result, dict) and isinstance(result.get("value"), (int, float)):
            values[name] = result["value"]
    return values


def _check_value(nodes: list[Json], values: dict[str, int | float]) -> tuple[bool, set[str]]:
    by_key = {node["key"]: node for node in nodes}
    used: set[str] = set()

    def predicate(key: str) -> bool:
        node = by_key[key]
        used.add(key)
        function_id = node["funcSpec"]["id"]
        arguments = [argument["key"] for argument in node["funcArgs"]]
        if function_id == "fg.and":
            for argument in arguments:
                if not predicate(argument):
                    return False
            return True
        if function_id == "fg.or":
            for argument in arguments:
                if predicate(argument):
                    return True
            return False
        left = number(arguments[0])
        right = number(arguments[1])
        return {
            "fg.lt": left < right,
            "fg.le": left <= right,
            "fg.gt": left > right,
            "fg.ge": left >= right,
            "fg.eq": left == right,
            "fg.ne": left != right,
        }[function_id]

    def number(key: str) -> int | float:
        node = by_key[key]
        used.add(key)
        if node["mode"] == "LITERAL":
            return node["literal"]["value"]
        if node["mode"] == "SYMBOL":
            name = (node.get("ref") or {}).get("name")
            if name not in values:
                raise SourceError("INVALID_CHECK", "Check evidence is missing a captured operand")
            return values[name]
        function_id = node["funcSpec"]["id"]
        arguments = [argument["key"] for argument in node["funcArgs"]]
        if function_id == "fg.uminus":
            return -number(arguments[0])
        if function_id in _NUMERIC_CALLS:
            return _NUMERIC_CALLS[function_id](*(number(key) for key in arguments))
        left = number(arguments[0])
        right = number(arguments[1])
        if function_id == "fg.add":
            return left + right
        if function_id == "fg.subtract":
            return left - right
        if function_id == "fg.multiply":
            return left * right
        if function_id == "fg.divide":
            return left / right
        if function_id == "fg.pow":
            return left**right
        raise SourceError("INVALID_CHECK", "Check evidence uses an unsupported operand")

    return predicate(nodes[0]["key"]), used


def collect_branch_outcomes(planner) -> list[Json]:
    """Record predicate results from the single captured execution."""
    invocations = {invocation.id: invocation for invocation in planner.invocations}
    values = _symbol_values(planner)
    outcomes: list[Json] = []
    def calls(content):
        for item in content:
            if item["kind"] == "call":
                yield item
            elif item["kind"] == "section":
                yield from calls(item["content"])

    def helpers(plan):
        yield plan
        for helper in plan["helpers"]:
            yield from helpers(helper)

    def visit(plan, child, plans):
        glyphs = {quantity["variableName"]: quantity["glyph"] for quantity in plan["quantities"]}
        for quantity in plan["quantities"]:
            glyphs.setdefault(quantity["selectionName"], quantity["glyph"])
        for quantity in plan["quantities"]:
            if quantity["role"] == "input":
                continue
            symbol = child.symbols.get(quantity["variableName"])
            if symbol is None:
                continue
            nodes = {node["key"]: node for node in symbol.cso["valueTree"]["nodes"]}
            _visit_formula(child, quantity, glyphs, nodes, values, symbol.cso["valueTree"]["rootKey"], outcomes)
        for call in calls(plan["content"]):
            visit(plans[call["helperId"]], child.calls[call["binding"]], plans)

    for table in planner.tables:
        method = next(item for item in planner.methods if item["id"] == table["methodId"])
        plans = {plan["id"]: plan for plan in helpers(method)}
        for case in table["cases"]:
            visit(method, invocations[case["invocationId"]], plans)
    return outcomes


def _symbol_values(planner) -> dict[str, int | float]:
    values: dict[str, int | float] = {}
    for invocation in planner.invocations:
        symbols = [
            *invocation.symbols.values(),
            *invocation.parameter_symbols.values(),
        ]
        for symbol in symbols:
            result = symbol.cso["valueTree"].get("result")
            if isinstance(result, dict) and "value" in result:
                values[symbol.cso["id"]] = result["value"]
    return values


def _visit_formula(invocation, quantity, glyphs, nodes, values, key: str, outcomes: list[Json]) -> None:
    node = nodes[key]
    if node.get("mode") != "FUNCTION":
        return
    function_id = node.get("funcSpec", {}).get("id")
    arguments = [argument["key"] for argument in node.get("funcArgs") or []]
    if function_id == "fg.cnd":
        _record_conditional(invocation, quantity, glyphs, nodes, values, key, outcomes)
        return
    for argument in arguments:
        _visit_formula(invocation, quantity, glyphs, nodes, values, argument, outcomes)


def _record_conditional(invocation, quantity, glyphs, nodes, values, key: str, outcomes: list[Json]) -> set[str]:
    node = nodes[key]
    arguments = [argument["key"] for argument in node["funcArgs"]]
    used: set[str] = set()
    selected = _predicate_value(nodes, values, arguments[0], used)
    chosen = arguments[1] if selected else arguments[2]
    used.update(_evaluated_keys(invocation, quantity, glyphs, nodes, values, chosen, outcomes))
    used.add(key)
    outcomes.append(
        {
            "invocationId": invocation.id,
            "symbolId": invocation.symbols[quantity["variableName"]].cso["id"],
            "nodeKey": key,
            "value": selected,
            "usedKeys": sorted(used),
            "label": _formula_text(quantity["nodes"], glyphs, chosen),
        }
    )
    return used


def _evaluated_keys(invocation, quantity, glyphs, nodes, values, key: str, outcomes: list[Json]) -> set[str]:
    node = nodes[key]
    if node.get("mode") == "FUNCTION" and node.get("funcSpec", {}).get("id") == "fg.cnd":
        return _record_conditional(invocation, quantity, glyphs, nodes, values, key, outcomes)
    used = {key}
    for argument in node.get("funcArgs") or []:
        used.update(
            _evaluated_keys(
                invocation, quantity, glyphs, nodes, values, argument["key"], outcomes
            )
        )
    return used


def _predicate_value(nodes, values, key: str, used: set[str]) -> bool:
    node = nodes[key]
    used.add(key)
    function_id = node["funcSpec"]["id"]
    arguments = [argument["key"] for argument in node["funcArgs"]]
    if function_id == "fg.and":
        for argument in arguments:
            if not _predicate_value(nodes, values, argument, used):
                return False
        return True
    if function_id == "fg.or":
        for argument in arguments:
            if _predicate_value(nodes, values, argument, used):
                return True
        return False
    if function_id not in _COMPARISONS:
        raise SourceError(
            "INVALID_CONDITIONAL",
            "A conditional test requires numeric comparisons",
            location=node.get("metadata", {}).get("location"),
        )
    left = _number_value(nodes, values, arguments[0], used)
    right = _number_value(nodes, values, arguments[1], used)
    return {
        "fg.lt": left < right,
        "fg.le": left <= right,
        "fg.gt": left > right,
        "fg.ge": left >= right,
        "fg.eq": left == right,
        "fg.ne": left != right,
    }[function_id]


def _number_value(nodes, values, key: str, used: set[str]) -> int | float:
    node = nodes[key]
    used.add(key)
    mode = node["mode"]
    if mode == "LITERAL":
        return node["literal"]["value"]
    if mode == "SYMBOL":
        symbol_id = node["symbol"]["id"]
        if symbol_id not in values:
            raise SourceError(
                "INVALID_CONDITIONAL",
                "Conditional evidence is missing a captured operand",
                location=node.get("metadata", {}).get("location"),
            )
        return values[symbol_id]
    function_id = node["funcSpec"]["id"]
    arguments = [argument["key"] for argument in node["funcArgs"]]
    if function_id == "fg.cnd":
        selected = _predicate_value(nodes, values, arguments[0], used)
        return _number_value(nodes, values, arguments[1] if selected else arguments[2], used)
    if function_id == "fg.uminus":
        return -_number_value(nodes, values, arguments[0], used)
    if function_id in _NUMERIC_CALLS:
        return _NUMERIC_CALLS[function_id](*(_number_value(nodes, values, key, used) for key in arguments))
    if function_id in _OPERATORS and len(arguments) == 2:
        left = _number_value(nodes, values, arguments[0], used)
        right = _number_value(nodes, values, arguments[1], used)
        if function_id == "fg.add":
            return left + right
        if function_id == "fg.subtract":
            return left - right
        if function_id == "fg.multiply":
            return left * right
        if function_id == "fg.divide":
            return left / right
        return left**right
    raise SourceError(
        "INVALID_CONDITIONAL",
        "Conditional evidence uses an unsupported operand",
        location=node.get("metadata", {}).get("location"),
    )
