"""Shared quantities for the dependency-free midpoint example."""

from typing import Annotated, TypeAlias

from cso_python import symbol

UpperLimit: TypeAlias = Annotated[
    float, symbol(glyph="b", description="Upper integration limit", unit="")
]
IntervalCount: TypeAlias = Annotated[
    int, symbol(glyph="n", description="Number of equal intervals", unit="")
]
MidpointIntegral: TypeAlias = Annotated[
    float, symbol(glyph="I_{mid}", description="Midpoint integral estimate", unit="")
]
IntervalWidth: TypeAlias = Annotated[
    float,
    symbol(
        glyph="h",
        description="Interval width",
        unit="",
        comment="Retained even when no later formula uses it.",
    ),
]
DoubledIntegral: TypeAlias = Annotated[
    float, symbol(glyph="J", description="Twice the integral estimate", unit="")
]
