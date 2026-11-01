"""Shared quantities for adaptive quadrature."""

from typing import Annotated, TypeAlias

from cso_python import symbol

UpperLimit: TypeAlias = Annotated[
    float, symbol(glyph="b", description="Upper integration limit", unit="")
]
AbsoluteTolerance: TypeAlias = Annotated[
    float,
    symbol(
        glyph="epsilon_{abs}", description="Absolute integration tolerance", unit=""
    ),
]
RelativeTolerance: TypeAlias = Annotated[
    float,
    symbol(
        glyph="epsilon_{rel}", description="Relative integration tolerance", unit=""
    ),
]
IntegralValue: TypeAlias = Annotated[
    float, symbol(glyph="I", description="Adaptive integral estimate", unit="")
]
EstimatedError: TypeAlias = Annotated[
    float,
    symbol(
        glyph="e_{est}",
        description="Estimated absolute error",
        unit="",
        comment="SciPy's estimate is not a guaranteed error bound or an independently checked result.",
    ),
]
DoubledIntegral: TypeAlias = Annotated[
    float, symbol(glyph="J", description="Twice the integral estimate", unit="")
]
