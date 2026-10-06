"""Lower a calculation's formulas and content before any case supplies values."""

from __future__ import annotations

import ast
import copy
import hashlib
import os
from dataclasses import dataclass, field
from pathlib import Path

from .annotations import symbol_annotation
from .definitions import Definitions
from .function_calls import BUILTIN_FUNCTION_NAMES, CALLS
from .source import (
    Capture,
    CapturedModule,
    Json,
    SourceError,
    authoring_name,
    compact,
    literal,
    number,
    numeric_kind,
    numeric_literal,
    span,
)

OPS = {
    ast.Add: "fg.add",
    ast.Sub: "fg.subtract",
    ast.Mult: "fg.multiply",
    ast.Div: "fg.divide",
    ast.Pow: "fg.pow",
}

COMPARISONS = {
    ast.Lt: "fg.lt",
    ast.LtE: "fg.le",
    ast.Gt: "fg.gt",
    ast.GtE: "fg.ge",
    ast.Eq: "fg.eq",
    ast.NotEq: "fg.ne",
}


@dataclass
class PlanStep:
    node: ast.stmt
    child_steps: list[PlanStep] | None = None


@dataclass
class SourcePlan:
    function: str
    module_id: str
    source_hash: str
    fingerprint: str
    revision: str
    steps: list[PlanStep]
    expressions: dict[int, list[Json]]
    quantities: list[Json]
    calls: list[Json]
    content: list[Json] = field(default_factory=list)

    def public(self) -> Json:
        return {
            "function": self.function,
            "moduleId": self.module_id,
            "sourceHash": self.source_hash,
            "interfaceFingerprint": self.fingerprint,
            "revision": self.revision,
            "quantities": self.quantities,
            "calls": self.calls,
            "content": self.content,
        }


def symbolic_plan(source: Path, function: str) -> Json:
    """Return one symbolic plan. Parsing source does not execute it."""
    try:
        if not function.isidentifier():
            raise SourceError(
                "INVALID_USAGE", "Function must be an identifier", stage="usage"
            )
        capture = Capture(source)
        module = capture.load(capture.entry)
        plan = compile_source_plan(Definitions(capture), module, function)
        return {"ok": True, "plan": plan.public(), "diagnostics": []}
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
        return {"ok": False, "diagnostics": [diagnostic]}


def compile_source_plan(
    definitions: Definitions,
    module: CapturedModule,
    function: str,
) -> SourcePlan:
    definition = definitions.get(module.path, function)
    parameter_names = set(definition.parameters)
    expressions: dict[int, list[Json]] = {}

    def register(expr: ast.expr, *, given: bool) -> None:
        expressions[id(expr)] = lower_expression(
            module, definition.function, parameter_names, expr, given=given
        )

    steps = _statements(module, definition.function.body, False, register)
    for output in definition.outputs.values():
        register(output.selection, given=False)
    quantities: list[Json] = []
    calls: list[Json] = []
    content: list[Json] = []
    _collect(module, steps, expressions, quantities, calls, content)
    payload = {"quantities": quantities, "calls": calls, "content": content}
    return SourcePlan(
        function=function,
        module_id=module.id,
        source_hash=hashlib.sha256(module.data).hexdigest(),
        fingerprint=definition.fingerprint,
        revision=hashlib.sha256(compact(payload).encode()).hexdigest(),
        steps=steps,
        expressions=expressions,
        quantities=quantities,
        calls=calls,
        content=content,
    )


def _statements(
    module: CapturedModule,
    statements: list[ast.stmt],
    grouped: bool,
    register,
) -> list[PlanStep]:
    steps: list[PlanStep] = []
    for index, original in enumerate(statements):
        if (
            not grouped
            and index == 0
            and isinstance(original, ast.Expr)
            and isinstance(original.value, ast.Constant)
            and isinstance(original.value.value, str)
        ):
            continue
        node = _prepare_statement(module, original)
        child_steps = None
        if isinstance(node, ast.With):
            child_steps = _statements(module, node.body, True, register)
        if isinstance(node, ast.AnnAssign) and node.value is not None:
            register(node.value, given=True)
        steps.append(PlanStep(node, child_steps))
    return steps


def _prepare_statement(module: CapturedModule, node: ast.stmt) -> ast.stmt:
    if not (
        isinstance(node, ast.Assign)
        and isinstance(node.value, ast.Call)
        and authoring_name(node.value.func) in module.handles
    ):
        return node
    if node.value.args or any(keyword.arg is None for keyword in node.value.keywords):
        raise SourceError(
            "INVALID_CALL_INPUTS",
            "Calculation handles use explicit named arguments",
            location=span(module.id, node),
        )
    original = node.value
    handle = module.handles[authoring_name(original.func)]
    rewritten = copy.deepcopy(node)
    rewritten.value = ast.copy_location(
        ast.Call(
            func=ast.Name(id="calculation_call", ctx=ast.Load()),
            args=[
                ast.copy_location(
                    ast.Constant(
                        os.path.relpath(handle["path"], module.path.parent)
                    ),
                    original,
                )
            ],
            keywords=[
                ast.keyword(
                    arg="function",
                    value=ast.copy_location(
                        ast.Constant(handle["function"]),
                        original,
                    ),
                ),
                ast.keyword(
                    arg="inputs",
                    value=ast.copy_location(
                        ast.Dict(
                            keys=[
                                ast.copy_location(ast.Constant(keyword.arg), keyword.value)
                                for keyword in original.keywords
                            ],
                            values=[keyword.value for keyword in original.keywords],
                        ),
                        original,
                    ),
                ),
            ],
        ),
        original,
    )
    return rewritten


def _collect(
    module: CapturedModule,
    steps: list[PlanStep],
    expressions: dict[int, list[Json]],
    quantities: list[Json],
    calls: list[Json],
    content: list[Json],
) -> None:
    for step in steps:
        node = step.node
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            declared = symbol_annotation(node, module.id, module.aliases)
            spec = declared.metadata
            assert spec is not None
            name = node.target.id
            quantities.append(
                {
                    "variableName": name,
                    "localId": spec.get("id", name),
                    "kind": _quantity_kind(node.value),
                    "nodes": _project(expressions[id(node.value)]),
                }
            )
        else:
            described = _describe_call(node)
            if described is not None:
                calls.append(described)
            elif (
                isinstance(node, ast.Expr)
                and isinstance(node.value, ast.Call)
                and authoring_name(node.value.func) in {"text", "figure"}
            ):
                content.append({"kind": authoring_name(node.value.func)})
        if step.child_steps:
            _collect(module, step.child_steps, expressions, quantities, calls, content)


def _describe_call(node: ast.stmt) -> Json | None:
    if not (
        isinstance(node, ast.Assign)
        and len(node.targets) == 1
        and isinstance(node.targets[0], ast.Name)
        and isinstance(node.value, ast.Call)
        and authoring_name(node.value.func) == "calculation_call"
        and len(node.value.args) == 1
        and isinstance(node.value.args[0], ast.Constant)
        and isinstance(node.value.args[0].value, str)
    ):
        return None
    keywords = {keyword.arg: keyword.value for keyword in node.value.keywords}
    function = keywords.get("function")
    inputs = keywords.get("inputs")
    if not (
        isinstance(function, ast.Constant)
        and isinstance(function.value, str)
        and isinstance(inputs, ast.Dict)
    ):
        return None
    names = [
        key.value
        for key in inputs.keys
        if isinstance(key, ast.Constant) and isinstance(key.value, str)
    ]
    return {
        "binding": node.targets[0].id,
        "path": node.value.args[0].value,
        "function": function.value,
        "inputNames": names,
    }


def _quantity_kind(expr: ast.expr | None) -> str:
    if isinstance(expr, ast.Call) and authoring_name(expr.func) == "given":
        return "input"
    if expr is not None and numeric_literal(expr):
        return "constant"
    if isinstance(expr, ast.Call) and authoring_name(expr.func) == "documented_result":
        return "unsupported"
    return "formula"


def _project(nodes: list[Json]) -> list[Json]:
    return [{key: value for key, value in node.items() if key != "_ast"} for node in nodes]


def lower_expression(
    module: CapturedModule,
    function: ast.FunctionDef,
    parameters: set[str],
    expr: ast.expr,
    *,
    given: bool,
    condition: bool = False,
) -> list[Json]:
    nodes: list[Json] = []

    def fail(node: ast.AST, code: str, message: str, **details: object) -> None:
        raise SourceError(code, message, location=span(module.id, node), **details)

    def lower(node: ast.expr, *, condition: bool = False) -> str:
        key = f"n{len(nodes) + 1}"
        item: Json = {"key": key, "location": span(module.id, node)}
        nodes.append(item)
        if condition and not isinstance(node, (ast.Compare, ast.BoolOp)):
            fail(
                node,
                "UNSUPPORTED_SYNTAX",
                "A conditional test requires numeric comparisons joined by and/or",
            )
        if numeric_literal(node):
            value = literal(node, module.id)
            item.update(
                mode="LITERAL",
                draft=str(value),
                literal={
                    "kind": "number",
                    "numericKind": numeric_kind(value),
                    "value": number(value, span(module.id, node)),
                },
            )
        elif authoring_name(node) == "math.pi" or (
            authoring_name(node) == "pi" and "pi" in module.imported
        ):
            imported = "math" if authoring_name(node) == "math.pi" else "pi"
            if imported not in module.imported:
                fail(node, "UNSUPPORTED_SYNTAX", "Unimported math constant")
            item.update(mode="FUNCTION", funcSpec={"id": "fg.pi"}, funcArgs=[])
        elif isinstance(node, ast.IfExp):
            item.update(
                mode="FUNCTION",
                funcSpec={"id": "fg.cnd"},
                funcArgs=[
                    {"key": lower(node.test, condition=True)},
                    {"key": lower(node.body)},
                    {"key": lower(node.orelse)},
                ],
            )
        elif isinstance(node, ast.BoolOp):
            if not condition:
                fail(
                    node,
                    "UNSUPPORTED_SYNTAX",
                    "Logical operators are supported only in conditional tests",
                )
            item.update(
                mode="FUNCTION",
                funcSpec={"id": "fg.and" if isinstance(node.op, ast.And) else "fg.or"},
                funcArgs=[
                    {"key": lower(value, condition=condition)} for value in node.values
                ],
            )
        elif isinstance(node, ast.Compare):
            if not condition or any(type(op) not in COMPARISONS for op in node.ops):
                fail(
                    node,
                    "UNSUPPORTED_SYNTAX",
                    "Numeric comparisons are supported only in conditional tests",
                )
            operand_keys = [
                lower(node.left),
                *(lower(value) for value in node.comparators),
            ]
            if len(node.ops) == 1:
                item.update(
                    mode="FUNCTION",
                    funcSpec={"id": COMPARISONS[type(node.ops[0])]},
                    funcArgs=[{"key": value} for value in operand_keys],
                )
            else:
                comparisons = []
                for index, op in enumerate(node.ops):
                    comparison_key = f"n{len(nodes) + 1}"
                    nodes.append(
                        {
                            "key": comparison_key,
                            "location": dict(item["location"]),
                            "mode": "FUNCTION",
                            "funcSpec": {"id": COMPARISONS[type(op)]},
                            "funcArgs": [
                                {"key": operand_keys[index]},
                                {"key": operand_keys[index + 1]},
                            ],
                        }
                    )
                    comparisons.append({"key": comparison_key})
                item.update(
                    mode="FUNCTION", funcSpec={"id": "fg.and"}, funcArgs=comparisons
                )
        elif isinstance(node, (ast.Name, ast.Subscript)):
            item["_ast"] = node
            if isinstance(node, ast.Name):
                item.update(
                    mode="SYMBOL", ref={"kind": "name", "name": node.id}
                )
                if node.id in parameters:
                    item["parameterName"] = node.id
            else:
                item.update(
                    mode="SYMBOL",
                    ref={
                        "kind": "output",
                        "call": node.value.id,
                        "output": node.slice.value,
                    },
                )
        elif isinstance(node, ast.BinOp) and type(node.op) in OPS:
            item.update(
                mode="FUNCTION",
                funcSpec={"id": OPS[type(node.op)]},
                funcArgs=[{"key": lower(node.left)}, {"key": lower(node.right)}],
            )
        elif isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
            item.update(
                mode="FUNCTION",
                funcSpec={"id": "fg.uminus"},
                funcArgs=[{"key": lower(node.operand)}],
            )
        elif isinstance(node, ast.Call):
            name = authoring_name(node.func)
            if (
                name not in {"given", "documented_result", *CALLS}
                or node.keywords
                or (
                    not CALLS[name].accepts_arity(len(node.args))
                    if name in CALLS
                    else len(node.args) != 1
                )
            ):
                fail(node, "UNSUPPORTED_SYNTAX", "Unsupported formula call or arity")
            if name in BUILTIN_FUNCTION_NAMES and (
                name in parameters
                or name in module.imported
                or name in module.functions
                or name in module.aliases
                or name in module.handles
                or any(
                    isinstance(bound, ast.Name)
                    and isinstance(bound.ctx, ast.Store)
                    and bound.id == name
                    for bound in ast.walk(function)
                )
            ):
                fail(
                    node,
                    "SHADOWED_HELPER",
                    f"Formula helper {name} is shadowed by a Python binding",
                )
            imported = "math" if name.startswith("math.") else name
            if (
                imported not in BUILTIN_FUNCTION_NAMES
                and imported not in module.imported
            ):
                fail(node, "UNSUPPORTED_SYNTAX", f"Unimported helper {name}")
            if name == "given":
                arg = node.args[0]
                if not given or node is not expr:
                    fail(
                        node,
                        "UNSUPPORTED_SYNTAX",
                        "given must be the complete symbol assignment",
                    )
                if isinstance(arg, ast.Name) and arg.id in parameters:
                    item.update(mode="GIVEN_PARAMETER", parameter=arg.id)
                elif numeric_literal(arg):
                    value = literal(arg, module.id)
                    item.update(
                        mode="LITERAL",
                        literal={
                            "kind": "number",
                            "numericKind": numeric_kind(value),
                            "value": number(value, span(module.id, arg)),
                        },
                    )
                else:
                    fail(arg, "INVALID_GIVEN", "given accepts a parameter or finite literal")
            elif name == "documented_result":
                if node is not expr:
                    fail(
                        node,
                        "UNSUPPORTED_SYNTAX",
                        "documented_result must be the complete assignment",
                    )
                nodes.pop()
                return lower(node.args[0])
            else:
                item.update(
                    mode="FUNCTION",
                    funcSpec={"id": CALLS[name].function_id},
                    funcArgs=[{"key": lower(argument)} for argument in node.args],
                )
        else:
            fail(
                node,
                "UNSUPPORTED_SYNTAX",
                f"Unsupported expression {type(node).__name__}",
            )
        return key

    lower(expr, condition=condition)
    return nodes
