"""Static declarations and run-scoped execution of captured single-file adapters."""

from __future__ import annotations

import ast
import hashlib
from keyword import iskeyword
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from .annotations import Annotation, annotation
from .source import (
    Capture,
    Json,
    SourceError,
    compact,
    literal,
    number,
    numeric_kind,
    span,
)


@dataclass(frozen=True)
class ExternalDeclaration:
    name: str
    node: ast.Assign
    path: Path
    function: str
    inputs: dict[str, Annotation]
    outputs: dict[str, Annotation]
    input_nodes: dict[str, ast.expr]
    output_nodes: dict[str, ast.expr]
    defaults: dict[str, ast.expr]
    description: str
    interface: Json
    fingerprint: str


def read_declaration(
    capture: Capture, path: Path, node: ast.Assign, aliases
) -> ExternalDeclaration:
    module = path.relative_to(capture.root).as_posix()
    call = node.value

    def fail(message):
        raise SourceError(
            "INVALID_EXTERNAL_DECLARATION", message, location=span(module, node)
        )

    if len(node.targets) != 1 or not isinstance(node.targets[0], ast.Name) or call.args:
        fail("Bind one external declaration with explicit keyword arguments")
    fields = {}
    for keyword in call.keywords:
        if (
            keyword.arg
            not in {"path", "function", "inputs", "outputs", "defaults", "description"}
            or keyword.arg in fields
        ):
            fail("Unknown, expanded or repeated external declaration keyword")
        fields[keyword.arg] = keyword.value
    if not {"path", "function", "inputs", "outputs", "description"} <= fields.keys():
        fail(
            "External declarations need path, function, inputs, outputs and description"
        )
    target = literal(fields["path"], module)
    function = literal(fields["function"], module)
    if isinstance(function, str):
        function = unicodedata.normalize("NFKC", function)
    description = literal(fields["description"], module)
    if (
        not isinstance(target, str)
        or not target
        or Path(target).is_absolute()
        or "\\" in target
        or ":" in target
    ):
        fail("Use a relative single-file adapter path")
    if (
        not isinstance(function, str)
        or not function.isidentifier()
        or iskeyword(function)
        or not isinstance(description, str)
        or not description.strip()
    ):
        fail("Use a named callable and a nonempty method description")

    def mapping(field):
        value = fields.get(field, ast.Dict(keys=[], values=[]))
        if not isinstance(value, ast.Dict):
            fail(f"{field} must be a literal-key mapping")
        result = {}
        for key, item in zip(value.keys, value.values):
            if not isinstance(key, ast.Constant) or not isinstance(key.value, str):
                fail(f"{field} needs unique nonempty string keys")
            name = (
                key.value
                if field == "outputs"
                else unicodedata.normalize("NFKC", key.value)
            )
            if (
                not name
                or field != "outputs"
                and (
                    not name.isidentifier()
                    or iskeyword(name)
                    or name.startswith("__cso_")
                )
                or name in result
            ):
                fail(
                    f"{field} needs unique nonempty {'string' if field == 'outputs' else 'identifier'} keys"
                )
            result[name] = item
        return result

    input_nodes, output_nodes, defaults = (
        mapping("inputs"),
        mapping("outputs"),
        mapping("defaults"),
    )
    if not output_nodes or not defaults.keys() <= input_nodes.keys():
        fail("Declare at least one output and defaults only for declared inputs")
    inputs = {
        key: annotation(value, module, aliases) for key, value in input_nodes.items()
    }
    outputs = {
        key: annotation(value, module, aliases) for key, value in output_nodes.items()
    }
    for declared in [*inputs.values(), *outputs.values()]:
        if declared.metadata is None or {"id", "root_key"} & declared.metadata.keys():
            fail(
                "External quantities require shared metadata without local identity fields"
            )
    for key, value in defaults.items():
        raw = number(literal(value, module), span(module, value))
        if inputs[key].numeric_type == "int" and type(raw) is not int:
            fail("An int default requires a native int")
    adapter = capture.capture_adapter(path.parent / target, span(module, node))
    interface = {
        "path": adapter.id,
        "function": function,
        "description": description,
        "inputs": [
            [key, value.numeric_type, value.metadata] for key, value in inputs.items()
        ],
        "outputs": [
            [key, value.numeric_type, value.metadata] for key, value in outputs.items()
        ],
        "defaults": [
            {
                "name": key,
                "value": literal(value, module),
                "numericKind": numeric_kind(literal(value, module)),
            }
            for key, value in defaults.items()
        ],
    }
    return ExternalDeclaration(
        node.targets[0].id,
        node,
        adapter.path,
        function,
        inputs,
        outputs,
        input_nodes,
        output_nodes,
        defaults,
        description,
        interface,
        hashlib.sha256(compact(interface).encode()).hexdigest(),
    )


def external_function(**declaration):
    """Declare an adapter. Static tools read its syntax; this does not load it."""
    return declaration


class ExternalHandle:
    def __init__(self, path: Path, function: str, fingerprint: str):
        self.path, self.function, self.fingerprint = path, function, fingerprint

    def __call__(self, /, **inputs):
        from .execution import ACTIVE, invoke

        if ACTIVE.get() is None:
            raise SourceError(
                "EXTERNAL_CONTEXT_REQUIRED",
                "External handles require an active top-level CSO execution",
                stage="execution",
            )
        return invoke(
            str(self.path),
            function=self.function,
            inputs=inputs,
            frame=sys._getframe(1),
        )


def load_external(path: str, *, function: str, fingerprint: str) -> ExternalHandle:
    caller = Path(sys._getframe(1).f_code.co_filename).resolve()
    return ExternalHandle((caller.parent / path).absolute(), function, fingerprint)
