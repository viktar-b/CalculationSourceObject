"""Describe a calculation's public interface without executing authored code."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .annotations import Annotation
from .definitions import Definitions, ParameterDefinition
from .source import Capture, Json, SourceError, span


def _quantity(
    name: str, annotation: Annotation, *, location: Json, role: str
) -> Json:
    metadata = annotation.metadata
    if metadata is None:
        raise SourceError(
            "MISSING_METADATA",
            f"Definition manifest requires symbol metadata for {role} {name!r}",
            location=location,
        )
    return {
        "name": name,
        "numericType": annotation.numeric_type,
        "glyph": metadata["glyph"],
        "description": metadata["description"],
        "unit": metadata["unit"],
    }


def _input(name: str, parameter: ParameterDefinition, module_id: str) -> Json:
    item = _quantity(
        name,
        parameter.documented,
        location=span(module_id, parameter.node),
        role="input",
    )
    item["numericType"] = parameter.declared.numeric_type
    if parameter.default is not None:
        if (
            parameter.declared.numeric_type == "int"
            and type(parameter.default_value) is not int
        ):
            raise SourceError(
                "DEFAULT_TYPE_MISMATCH",
                f"Default for int input {name!r} requires a Python int",
                location=span(module_id, parameter.default),
            )
        item["default"] = parameter.default_value
    return item


def describe(source: Path, function: str) -> Json:
    try:
        if not function.isidentifier():
            raise SourceError(
                "INVALID_USAGE", "Function must be an identifier", stage="usage"
            )
        capture = Capture(source)
        definition = Definitions(capture).get(capture.entry, function)
        manifest = capture.manifest()
        entry = next(
            item for item in manifest if item["moduleId"] == definition.module.id
        )
        return {
            "ok": True,
            "definition": {
                "version": "1",
                "function": function,
                "fingerprint": definition.fingerprint,
                "entryModuleId": definition.module.id,
                "entrySourceHash": entry["sha256"],
                "sourceManifest": manifest,
                "sourceClosureHash": capture.closure_hash(),
                "inputs": [
                    _input(name, parameter, definition.module.id)
                    for name, parameter in definition.parameters.items()
                ],
                "outputs": [
                    _quantity(
                        name,
                        output.annotation,
                        location=span(definition.module.id, output.selection),
                        role="output",
                    )
                    for name, output in definition.outputs.items()
                ],
            },
            "diagnostics": [],
        }
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


class DescribeParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        print(
            json.dumps(
                {
                    "ok": False,
                    "diagnostics": [
                        {"code": "INVALID_USAGE", "message": message, "stage": "usage"}
                    ],
                }
            )
        )
        self.exit(2)


def describe_from_argv(argv: list[str]) -> int:
    parser = DescribeParser(
        prog="python -m cso_python describe",
        description="Describe a calculation interface without executing authored code.",
    )
    parser.add_argument("source", type=Path)
    parser.add_argument("--function", required=True, action="append")
    args = parser.parse_args(argv)
    if len(args.function) != 1:
        response = {
            "ok": False,
            "diagnostics": [
                {
                    "code": "DUPLICATE_OPTION",
                    "message": "Duplicate --function",
                    "stage": "usage",
                }
            ],
        }
    else:
        response = describe(args.source, args.function[0])
    print(json.dumps(response, ensure_ascii=False, allow_nan=False))
    return (
        0
        if response["ok"]
        else 2
        if any(item["stage"] == "usage" for item in response["diagnostics"])
        else 1
    )
