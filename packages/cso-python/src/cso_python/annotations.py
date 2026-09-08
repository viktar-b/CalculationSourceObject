"""Resolve numeric annotation metadata from syntax, without evaluating authored code."""

from __future__ import annotations

import ast
from dataclasses import dataclass

from .source import Json, SourceError, authoring_name, kwargs, span


@dataclass(frozen=True)
class Annotation:
    numeric_type: str
    metadata: Json | None = None


def annotation(
    node: ast.expr, module: str, aliases: dict[str, Annotation]
) -> Annotation:
    if isinstance(node, ast.Name):
        if node.id in ("float", "int"):
            return Annotation(node.id)
        if node.id in aliases:
            return aliases[node.id]
    if (
        isinstance(node, ast.Subscript)
        and authoring_name(node.value) == "Annotated"
        and isinstance(node.slice, ast.Tuple)
        and len(node.slice.elts) == 2
        and isinstance(node.slice.elts[1], ast.Call)
        and authoring_name(node.slice.elts[1].func) == "symbol"
    ):
        base = annotation(node.slice.elts[0], module, aliases)
        if base.metadata is not None:
            raise SourceError(
                "AMBIGUOUS_METADATA",
                "Only one symbol metadata declaration is allowed",
                location=span(module, node),
            )
        spec = kwargs(
            node.slice.elts[1],
            module,
            {"id", "root_key", "glyph", "description", "unit", "comment"},
            {"glyph", "description", "unit"},
        )
        return Annotation(base.numeric_type, spec)
    raise SourceError(
        "UNSUPPORTED_SIGNATURE",
        "Expected float, int or an Annotated numeric alias",
        location=span(module, node),
    )


def symbol_annotation(
    node: ast.AnnAssign, module: str, aliases: dict[str, Annotation]
) -> Annotation:
    try:
        declared = annotation(node.annotation, module, aliases)
    except SourceError as error:
        if error.diagnostic["code"] != "UNSUPPORTED_SIGNATURE":
            raise
        raise SourceError(
            "MISSING_METADATA",
            "Use Annotated numeric symbol metadata",
            location=span(module, node),
        ) from error
    if declared.metadata is None:
        raise SourceError(
            "MISSING_METADATA",
            "Annotated calculations require symbol metadata",
            location=span(module, node),
        )
    return declared
