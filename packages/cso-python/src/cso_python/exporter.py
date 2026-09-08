from __future__ import annotations

import argparse
import ast
import hashlib
import importlib.util
import json
import math
import os
import sys
from contextlib import contextmanager, redirect_stdout
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from types import ModuleType
from typing import Any, Iterator


JsonObject = dict[str, Any]


class FidelityLevel(str, Enum):
    STRAIGHT_LINE_FORMULA = "straight_line_formula"
    DOCUMENTED_RESULT_ESCAPE_HATCH = "documented_result_escape_hatch"


CURRENT_FIDELITY_LEVEL = FidelityLevel.STRAIGHT_LINE_FORMULA


@dataclass
class ParsedSection:
    id: str
    title: str
    root: bool
    metadata: JsonObject
    items: list[JsonObject] = field(default_factory=list)


@dataclass(frozen=True)
class ParsedSymbol:
    variable_name: str
    spec: JsonObject
    value_expression: ast.expr
    section_id: str


class ExportError(Exception):
    pass


def literal_from_value(value: object) -> JsonObject:
    if value is None:
        return {"kind": "empty"}

    if isinstance(value, bool):
        return {"kind": "boolean", "value": value}

    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return {"kind": "number", "value": float(value)}

    if isinstance(value, str):
        return {"kind": "string", "value": value}

    raise ExportError(f"Unsupported literal value {value!r}")


def call_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id

    if isinstance(node, ast.Attribute):
        parent = call_name(node.value)
        return f"{parent}.{node.attr}" if parent else node.attr

    return None


def literal_eval(node: ast.AST) -> Any:
    try:
        return ast.literal_eval(node)
    except (SyntaxError, ValueError) as error:
        raise ExportError(f"Expected a literal value at line {node.lineno}") from error


def call_kwargs(call: ast.Call) -> JsonObject:
    values: JsonObject = {}

    for keyword in call.keywords:
        if keyword.arg is None:
            raise ExportError("**kwargs are not supported")

        values[keyword.arg] = literal_eval(keyword.value)

    return values


def annotated_symbol_call(annotation: ast.expr) -> ast.Call | None:
    if not isinstance(annotation, ast.Subscript):
        return None

    if call_name(annotation.value) != "Annotated":
        return None

    annotation_slice = annotation.slice
    elements = (
        list(annotation_slice.elts)
        if isinstance(annotation_slice, ast.Tuple)
        else [annotation_slice]
    )

    for element in elements[1:]:
        if isinstance(element, ast.Call) and call_name(element.func) == "symbol":
            return element

    return None


class ExpressionLowerer:
    def __init__(
        self,
        *,
        variable_symbol_ids: dict[str, str],
        symbol_results: dict[str, object],
        root_result: object,
    ) -> None:
        self.variable_symbol_ids = variable_symbol_ids
        self.symbol_results = symbol_results
        self.root_result = root_result
        self.nodes: list[JsonObject] = []
        self.counter = 0

    def next_key(self) -> str:
        self.counter += 1
        return f"n{self.counter}"

    def add_literal_node(
        self,
        key: str,
        value: object,
        metadata: JsonObject | None = None,
    ) -> str:
        literal = literal_from_value(value)
        node: JsonObject = {
            "key": key,
            "mode": "LITERAL",
            "draft": str(value),
            "literal": literal,
            "result": literal,
        }

        if metadata:
            node["metadata"] = metadata

        self.nodes.append(node)
        return key

    def add_symbol_node(self, key: str, symbol_id: str) -> str:
        node: JsonObject = {
            "key": key,
            "mode": "SYMBOL",
            "symbol": {"id": symbol_id},
        }
        result_value = self.symbol_results.get(symbol_id)

        if result_value is not None:
            node["result"] = literal_from_value(result_value)

        self.nodes.append(node)
        return key

    def add_function_node(
        self,
        key: str,
        function_id: str,
        argument_keys: list[str],
    ) -> str:
        self.nodes.append(
            {
                "key": key,
                "mode": "FUNCTION",
                "funcSpec": {"id": function_id},
                "funcArgs": [{"key": arg_key} for arg_key in argument_keys],
            }
        )
        return key

    def lower(self, expression: ast.expr, desired_key: str | None = None) -> str:
        key = desired_key or self.next_key()

        if isinstance(expression, ast.Call) and call_name(expression.func) == "given":
            if len(expression.args) != 1:
                raise ExportError("given(...) expects exactly one argument")

            return self.add_literal_node(key, self.root_result)

        if (
            isinstance(expression, ast.Call)
            and call_name(expression.func) == "documented_result"
        ):
            if len(expression.args) != 1:
                raise ExportError("documented_result(...) expects exactly one argument")

            return self.add_literal_node(
                key,
                self.root_result,
                metadata={
                    "annotatedPython": {
                        "fidelityLevel": (
                            FidelityLevel.DOCUMENTED_RESULT_ESCAPE_HATCH.value
                        ),
                        "escapeHatch": "documented_result",
                    },
                },
            )

        if isinstance(expression, ast.Constant):
            return self.add_literal_node(key, expression.value)

        if isinstance(expression, ast.Name):
            symbol_id = self.variable_symbol_ids.get(expression.id)

            if not symbol_id:
                raise ExportError(
                    f"Unknown symbol reference '{expression.id}' at line {expression.lineno}"
                )

            return self.add_symbol_node(key, symbol_id)

        if isinstance(expression, ast.UnaryOp) and isinstance(expression.op, ast.USub):
            argument_key = self.lower(expression.operand)
            return self.add_function_node(key, "fg.uminus", [argument_key])

        if isinstance(expression, ast.BinOp):
            function_id = self.function_id_for_binary_operator(expression.op)
            left_key = self.lower(expression.left)
            right_key = self.lower(expression.right)
            return self.add_function_node(key, function_id, [left_key, right_key])

        if isinstance(expression, ast.Call) and call_name(expression.func) in {
            "sqrt",
            "math.sqrt",
        }:
            if len(expression.args) != 1:
                raise ExportError("sqrt(...) expects exactly one argument")

            argument_key = self.lower(expression.args[0])
            return self.add_function_node(key, "fg.sqrt", [argument_key])

        if isinstance(
            expression,
            (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp),
        ):
            raise ExportError(
                f"Unsupported Python construct at line {expression.lineno}: "
                f"comprehensions are not supported by fidelity level "
                f"'{CURRENT_FIDELITY_LEVEL.value}'"
            )

        if isinstance(expression, ast.Call):
            function_name = call_name(expression.func) or expression.func.__class__.__name__
            raise ExportError(
                f"Unsupported function call '{function_name}(...)' at line "
                f"{expression.lineno}; fidelity level "
                f"'{CURRENT_FIDELITY_LEVEL.value}' supports given(...), "
                "sqrt(...), and documented_result(...)"
            )

        raise ExportError(
            f"Unsupported expression {expression.__class__.__name__} at line {expression.lineno}"
        )

    @staticmethod
    def function_id_for_binary_operator(operator: ast.operator) -> str:
        if isinstance(operator, ast.Add):
            return "fg.add"

        if isinstance(operator, ast.Sub):
            return "fg.subtract"

        if isinstance(operator, ast.Mult):
            return "fg.multiply"

        if isinstance(operator, ast.Div):
            return "fg.divide"

        if isinstance(operator, ast.Pow):
            return "fg.pow"

        raise ExportError(f"Unsupported binary operator {operator.__class__.__name__}")


def parse_calculation_decorator(function: ast.FunctionDef) -> JsonObject:
    for decorator in function.decorator_list:
        if isinstance(decorator, ast.Call) and call_name(decorator.func) == "calculation":
            values = call_kwargs(decorator)
            source_id = str(values["id"])
            metadata = dict(values.get("metadata") or {})
            annotated_python_metadata = metadata.get("annotatedPython")

            if annotated_python_metadata is not None and not isinstance(
                annotated_python_metadata,
                dict,
            ):
                raise ExportError("source metadata.annotatedPython must be an object")

            metadata["annotatedPython"] = {
                **(annotated_python_metadata or {}),
                "fidelityLevel": CURRENT_FIDELITY_LEVEL.value,
            }

            return {
                "schemaVersion": str(values.get("schema_version", "1.0.0")),
                "title": str(values["title"]),
                "source": {
                    "id": source_id,
                    "metadata": metadata,
                },
            }

    raise ExportError(f"Function '{function.name}' is missing @calculation(...)")


def derived_section_id(source_id: str, function_name: str, title: str) -> str:
    digest = hashlib.sha1(
        f"{source_id}:{function_name}:{title}".encode("utf-8")
    ).hexdigest()
    return f"wss{digest[:10]}"


def derived_symbol_id(
    source_id: str,
    function_name: str,
    variable_name: str,
    glyph: str,
) -> str:
    digest = hashlib.sha1(
        f"{source_id}:{function_name}:{variable_name}:{glyph}".encode("utf-8")
    ).hexdigest()
    return f"wsy{digest[:10]}"


def derived_root_key(
    source_id: str,
    function_name: str,
    variable_name: str,
) -> str:
    digest = hashlib.sha1(
        f"{source_id}:{function_name}:{variable_name}:root".encode("utf-8")
    ).hexdigest()
    return f"root{digest[:8]}"


def symbol_id_for(
    parsed_symbol: ParsedSymbol,
    *,
    source_id: str,
    function_name: str,
) -> str:
    authored_id = parsed_symbol.spec.get("id")

    if authored_id:
        return str(authored_id)

    return derived_symbol_id(
        source_id,
        function_name,
        parsed_symbol.variable_name,
        str(parsed_symbol.spec["glyph"]),
    )


def root_key_for(
    parsed_symbol: ParsedSymbol,
    *,
    source_id: str,
    function_name: str,
) -> str:
    authored_root_key = parsed_symbol.spec.get("root_key")

    if authored_root_key:
        return str(authored_root_key)

    return derived_root_key(source_id, function_name, parsed_symbol.variable_name)


def parse_symbol(statement: ast.AnnAssign, section_id: str) -> ParsedSymbol:
    if not isinstance(statement.target, ast.Name):
        raise ExportError("Only simple annotated assignments are supported")

    if statement.value is None:
        raise ExportError(f"Symbol '{statement.target.id}' is missing a value")

    symbol_call = annotated_symbol_call(statement.annotation)

    if symbol_call is None:
        raise ExportError(f"Symbol '{statement.target.id}' is missing symbol(...)")

    spec = call_kwargs(symbol_call)

    for required_key in ("glyph", "description", "unit"):
        if required_key not in spec:
            raise ExportError(
                f"Symbol '{statement.target.id}' is missing {required_key}"
            )

    return ParsedSymbol(
        variable_name=statement.target.id,
        spec=spec,
        value_expression=statement.value,
        section_id=section_id,
    )


def parse_section_decorator(function: ast.FunctionDef, source_id: str) -> ParsedSection:
    section_decorators = [
        decorator
        for decorator in function.decorator_list
        if isinstance(decorator, ast.Call) and call_name(decorator.func) == "section"
    ]

    if not section_decorators:
        raise ExportError(f"Function '{function.name}' is missing @section(...)")

    if len(section_decorators) > 1:
        raise ExportError("Only one @section(...) decorator is supported")

    section_values = call_kwargs(section_decorators[0])
    title = str(section_values["title"])

    return ParsedSection(
        id=str(
            section_values.get("id")
            or derived_section_id(source_id, function.name, title)
        ),
        title=title,
        root=bool(section_values.get("root", False)),
        metadata=section_values.get("metadata") or {},
    )


def unsupported_statement_reason(statement: ast.stmt) -> str | None:
    if isinstance(statement, ast.If):
        return "if statements are not supported"

    if isinstance(statement, (ast.For, ast.AsyncFor, ast.While)):
        return "loops are not supported"

    if isinstance(statement, ast.Match):
        return "match statements are not supported"

    if isinstance(statement, ast.Try):
        return "try statements are not supported"

    if isinstance(statement, ast.With):
        return "with statements are not supported"

    if isinstance(statement, ast.AsyncWith):
        return "async with statements are not supported"

    if isinstance(statement, (ast.Assign, ast.AugAssign)):
        return "unannotated assignments are not supported"

    if isinstance(statement, (ast.Delete, ast.Global, ast.Nonlocal)):
        return f"{statement.__class__.__name__} statements are not supported"

    if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        return "nested definitions are not supported"

    return None


def reject_unsupported_statement(statement: ast.stmt) -> None:
    reason = unsupported_statement_reason(statement)

    if reason is None:
        return

    raise ExportError(
        f"Unsupported Python construct at line {statement.lineno}: {reason} "
        f"by fidelity level '{CURRENT_FIDELITY_LEVEL.value}'"
    )


def parse_sections(
    function: ast.FunctionDef,
    *,
    source_id: str,
) -> tuple[list[ParsedSection], list[ParsedSymbol]]:
    section = parse_section_decorator(function, source_id)
    symbols: list[ParsedSymbol] = []

    for statement in function.body:
        if isinstance(statement, ast.Return):
            continue

        reject_unsupported_statement(statement)

        if isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Call):
            if call_name(statement.value.func) == "figure":
                raise ExportError("figure(...) items are not supported")

        if not isinstance(statement, ast.AnnAssign):
            continue

        parsed_symbol = parse_symbol(statement, section.id)
        symbols.append(parsed_symbol)
        section.items.append(
            {
                "kind": "symbol",
                "symbol": {
                    "__variableName": parsed_symbol.variable_name,
                },
            }
        )

    return [section], symbols


def find_function(module_ast: ast.Module, function_name: str) -> ast.FunctionDef:
    for statement in module_ast.body:
        if isinstance(statement, ast.FunctionDef) and statement.name == function_name:
            return statement

    raise ExportError(f"Function '{function_name}' does not exist")


def load_module(path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location("annotated_source", path)

    if spec is None or spec.loader is None:
        raise ExportError(f"Could not load {path}")

    source_directory = str(path.resolve().parent)

    if source_directory not in sys.path:
        sys.path.insert(0, source_directory)

    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def execute_calculation(
    path: Path,
    function_name: str,
    inputs: dict[str, object],
) -> dict[str, object]:
    module = load_module(path)
    calculation = getattr(module, function_name, None)

    if not callable(calculation):
        raise ExportError(f"Function '{function_name}' is not callable")

    try:
        result = calculation(**inputs)
    except TypeError as error:
        raise ExportError(str(error)) from error

    if not isinstance(result, dict):
        raise ExportError(f"Function '{function_name}' did not return a dictionary")

    return {str(key): value for key, value in result.items()}


def validate_runtime_result_keys(
    *,
    parsed_symbols: list[ParsedSymbol],
    runtime_results: dict[str, object],
) -> None:
    expected_names = [symbol.variable_name for symbol in parsed_symbols]
    actual_names = list(runtime_results)

    if actual_names == expected_names:
        return

    expected_set = set(expected_names)
    actual_set = set(actual_names)
    missing_names = [name for name in expected_names if name not in actual_set]
    extra_names = [name for name in actual_names if name not in expected_set]
    details: list[str] = []

    if missing_names:
        details.append(f"missing: {', '.join(missing_names)}")

    if extra_names:
        details.append(f"extra: {', '.join(extra_names)}")

    if not missing_names and not extra_names:
        details.append("order differs")

    raise ExportError(
        "Return dictionary keys must match annotated symbol assignments exactly "
        f"and in order; expected {expected_names!r}, got {actual_names!r} "
        f"({'; '.join(details)})"
    )


def build_symbol(
    parsed_symbol: ParsedSymbol,
    *,
    source_id: str,
    function_name: str,
    variable_symbol_ids: dict[str, str],
    symbol_results_by_id: dict[str, object],
    result_value: object,
) -> JsonObject:
    symbol_id = symbol_id_for(
        parsed_symbol,
        source_id=source_id,
        function_name=function_name,
    )
    lowerer = ExpressionLowerer(
        variable_symbol_ids=variable_symbol_ids,
        symbol_results=symbol_results_by_id,
        root_result=result_value,
    )
    root_key = root_key_for(
        parsed_symbol,
        source_id=source_id,
        function_name=function_name,
    )
    lowerer.lower(parsed_symbol.value_expression, desired_key=root_key)

    if lowerer.nodes:
        lowerer.nodes[-1]["result"] = literal_from_value(result_value)

    description = str(parsed_symbol.spec.get("description", ""))
    unit = str(parsed_symbol.spec.get("unit", ""))
    metadata = dict(parsed_symbol.spec.get("metadata") or {})

    if description:
        metadata.setdefault("symbolDescription", description)

    if unit:
        metadata.setdefault("symbolUnit", unit)

    return {
        "id": symbol_id,
        "glyph": str(parsed_symbol.spec["glyph"]),
        "glyphPlaintext": str(parsed_symbol.spec.get("glyph_plaintext", "")),
        "description": description,
        "unit": unit,
        "comment": str(parsed_symbol.spec.get("comment", "")),
        "metadata": metadata,
        "valueTree": {
            "rootKey": root_key,
            "result": literal_from_value(result_value),
            "nodes": lowerer.nodes,
        },
    }


def fill_symbol_items(
    sections: list[ParsedSection],
    symbols_by_variable_name: dict[str, JsonObject],
) -> list[JsonObject]:
    section_documents: list[JsonObject] = []
    non_root_section_refs = [
        {"kind": "section", "id": section.id} for section in sections if not section.root
    ]

    for section in sections:
        items: list[JsonObject] = []

        if section.root:
            items.extend(non_root_section_refs)

        for item in section.items:
            if item.get("kind") != "symbol":
                items.append(item)
                continue

            placeholder = item["symbol"]
            variable_name = placeholder["__variableName"]
            items.append(
                {
                    "kind": "symbol",
                    "symbol": symbols_by_variable_name[variable_name],
                }
            )

        section_documents.append(
            {
                "id": section.id,
                "title": section.title,
                "metadata": section.metadata,
                "items": items,
            }
        )

    return section_documents


def runtime_result_for_symbol(
    parsed_symbol: ParsedSymbol,
    *,
    runtime_results: dict[str, object],
) -> object:
    if parsed_symbol.variable_name in runtime_results:
        return runtime_results[parsed_symbol.variable_name]

    raise ExportError(
        f"Runtime result for symbol '{parsed_symbol.variable_name}' is missing"
    )


def convert_annotated_python(
    path: Path,
    *,
    function_name: str,
    inputs: dict[str, object],
) -> JsonObject:
    source_text = path.read_text(encoding="utf-8")
    module_ast = ast.parse(source_text, filename=str(path))
    function = find_function(module_ast, function_name)
    execution_helpers = {"calculation_call", "load_calculation", "text", "figure", "document_section"}
    legacy_authoring_imports = {
        "CalculationFunction", "CalculationResults", "CalculationSpec",
        "SectionSpec", "SymbolSpec", "calculation", "section", "symbol",
        "given", "documented_result",
    }
    imports_execution_helpers = any(
        isinstance(node, ast.ImportFrom)
        and (
            (node.module or "").startswith("cso_python.")
            or node.module == "cso_python"
            and any(
                alias.name not in legacy_authoring_imports or alias.asname is not None
                for alias in node.names
            )
        )
        or isinstance(node, ast.Import)
        and any(
            alias.name == "cso_python" or alias.name.startswith("cso_python.")
            for alias in node.names
        )
        for node in ast.walk(module_ast)
    )
    new_authoring = any(
        isinstance(node, ast.ImportFrom)
        and (node.module or "").startswith("_cso_bindings.")
        for node in module_ast.body
    ) or any(
        argument.annotation is not None
        and not (isinstance(argument.annotation, ast.Name)
                 and argument.annotation.id in {"float", "int"})
        for argument in [*function.args.args, *function.args.kwonlyargs]
    ) or any(isinstance(node, ast.AnnAssign) for node in module_ast.body)
    if new_authoring or imports_execution_helpers or any(
        isinstance(node, ast.Call)
        and call_name(node.func) in execution_helpers
        for node in ast.walk(function)
    ):
        from .execution import execute

        response = execute(path, function_name, inputs)
        if not response["ok"]:
            raise ExportError(response["diagnostics"][0]["message"])
        return response["execution"]["cso"]
    document = parse_calculation_decorator(function)
    source_id = str(document["source"]["id"])
    sections, parsed_symbols = parse_sections(
        function,
        source_id=source_id,
    )
    runtime_results = execute_calculation(path, function_name, inputs)
    validate_runtime_result_keys(
        parsed_symbols=parsed_symbols,
        runtime_results=runtime_results,
    )
    variable_symbol_ids = {
        parsed_symbol.variable_name: symbol_id_for(
            parsed_symbol,
            source_id=source_id,
            function_name=function_name,
        )
        for parsed_symbol in parsed_symbols
    }
    symbol_results_by_id = {
        variable_symbol_ids[parsed_symbol.variable_name]: runtime_result_for_symbol(
            parsed_symbol,
            runtime_results=runtime_results,
        )
        for parsed_symbol in parsed_symbols
    }
    symbols_by_variable_name = {
        parsed_symbol.variable_name: build_symbol(
            parsed_symbol,
            source_id=source_id,
            function_name=function_name,
            variable_symbol_ids=variable_symbol_ids,
            symbol_results_by_id=symbol_results_by_id,
            result_value=symbol_results_by_id[
                variable_symbol_ids[parsed_symbol.variable_name]
            ],
        )
        for parsed_symbol in parsed_symbols
    }
    root_section_ids = [section.id for section in sections if section.root]

    document["rootSectionIds"] = root_section_ids or [sections[0].id]
    document["sections"] = fill_symbol_items(sections, symbols_by_variable_name)

    return document


def parse_input_value(value: str) -> object:
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def parse_input_assignment(value: str) -> tuple[str, object]:
    name, separator, raw_value = value.partition("=")

    if not separator or not name:
        raise argparse.ArgumentTypeError("must use name=value format")

    if not name.isidentifier():
        raise argparse.ArgumentTypeError(f"{name!r} is not a valid Python parameter")

    parsed_value = parse_input_value(raw_value)

    if isinstance(parsed_value, float) and not math.isfinite(parsed_value):
        raise argparse.ArgumentTypeError("numeric input values must be finite")

    return name, parsed_value


def input_object(value: str) -> dict[str, object]:
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as error:
        raise argparse.ArgumentTypeError("must be a JSON object") from error

    if not isinstance(parsed, dict):
        raise argparse.ArgumentTypeError("must be a JSON object")

    for name, input_value in parsed.items():
        if not isinstance(name, str) or not name.isidentifier():
            raise argparse.ArgumentTypeError(
                f"{name!r} is not a valid Python parameter"
            )

        if isinstance(input_value, float) and not math.isfinite(input_value):
            raise argparse.ArgumentTypeError("numeric input values must be finite")

    return parsed


def add_export_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("source", type=Path)
    parser.add_argument("--function", required=True)
    parser.add_argument(
        "--input",
        action="append",
        default=[],
        metavar="name=value",
        type=parse_input_assignment,
    )
    parser.add_argument("--inputs-json", type=input_object, default={})


def calculation_inputs(args: argparse.Namespace) -> dict[str, object]:
    inputs = dict(args.inputs_json)

    for name, value in args.input:
        if name in inputs:
            raise ExportError(f"Input '{name}' was provided more than once")

        inputs[name] = value

    return inputs


@contextmanager
def authored_output_to_stderr() -> Iterator[None]:
    original_stdout = sys.stdout
    original_stdout.flush()
    saved_stdout = os.dup(1)
    try:
        os.dup2(2, 1)
        with redirect_stdout(sys.stderr):
            try:
                yield
            finally:
                original_stdout.flush()
    finally:
        try:
            os.dup2(saved_stdout, 1)
        finally:
            os.close(saved_stdout)


def export_from_args(args: argparse.Namespace) -> int:
    try:
        with authored_output_to_stderr():
            document = convert_annotated_python(
                args.source,
                function_name=args.function,
                inputs=calculation_inputs(args),
            )
    except (ExportError, OSError, SyntaxError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    json.dump(document, sys.stdout, indent=2)
    sys.stdout.write("\n")

    return 0
