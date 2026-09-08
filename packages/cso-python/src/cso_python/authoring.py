from __future__ import annotations

from collections.abc import Callable
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, TypeAlias, TypeVar

CalculationResults: TypeAlias = dict[str, float]
CalculationFunction: TypeAlias = Callable[..., CalculationResults]
_Function = TypeVar("_Function", bound=CalculationFunction)


@dataclass(frozen=True)
class CalculationSpec:
    id: str
    title: str
    schema_version: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class SectionSpec:
    title: str
    id: str | None = None
    root: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class SymbolSpec:
    glyph: str
    description: str
    unit: str
    comment: str = ""
    id: str | None = None
    root_key: str | None = None


def calculation(
    *,
    id: str,
    title: str,
    schema_version: str = "1.0.0",
    metadata: dict[str, Any] | None = None,
) -> Callable[[_Function], _Function]:
    """Attach CalculationSourceObject document metadata to a calculation function."""

    def decorate(fn: _Function) -> _Function:
        fn.__calculation_source__ = CalculationSpec(
            id=id,
            title=title,
            schema_version=schema_version,
            metadata=metadata or {},
        )
        return fn

    return decorate


def section(
    *,
    title: str,
    id: str | None = None,
    root: bool = False,
    metadata: dict[str, Any] | None = None,
) -> Callable[[_Function], _Function]:
    """Attach CalculationSourceObject section metadata to a calculation function."""

    def decorate(fn: _Function) -> _Function:
        fn.__calculation_section__ = SectionSpec(
            id=id,
            title=title,
            root=root,
            metadata=metadata or {},
        )
        return fn

    return decorate


def symbol(
    *,
    glyph: str,
    description: str,
    unit: str,
    comment: str = "",
    id: str | None = None,
    root_key: str | None = None,
) -> SymbolSpec:
    """Declare CalculationSourceObject symbol metadata for source parsing."""

    return SymbolSpec(
        glyph=glyph,
        description=description,
        unit=unit,
        comment=comment,
        id=id,
        root_key=root_key,
    )


def given(value: float) -> float:
    """Mark a literal input value while preserving normal Python execution."""

    return value


def documented_result(value: Any) -> Any:
    """Mark a calculated value as an intentional FormulaSheet escape hatch."""

    return value


def text(*, id: str, content: str) -> None:
    """Place literal review prose; the source parser retains its order."""


def figure(*, id: str, path: str, media_type: str, caption: str, alt: str) -> None:
    """Place a local figure; the source parser captures its asset identity."""


@contextmanager
def document_section(*, id: str, title: str, metadata: dict[str, Any] | None = None):
    """Group one child level of calculation document content."""
    yield
