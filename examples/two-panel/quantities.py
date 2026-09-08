"""Reusable presentation metadata for the two-panel calculation."""

from typing import Annotated, TypeAlias

from cso_python import symbol

PanelWidth: TypeAlias = Annotated[
    float,
    symbol(glyph=r"w_{pan}", description="Shared panel width", unit="m"),
]
PanelHeight: TypeAlias = Annotated[
    float,
    symbol(glyph=r"h_{pan}", description="Panel height", unit="m"),
]
FirstPanelHeight: TypeAlias = Annotated[
    float,
    symbol(glyph=r"h_{fp}", description="First panel height", unit="m"),
]
SecondPanelHeight: TypeAlias = Annotated[
    float,
    symbol(glyph=r"h_{sp}", description="Second panel height", unit="m"),
]
Thickness: TypeAlias = Annotated[
    float,
    symbol(glyph=r"t_{pan}", description="Uniform thickness", unit="m"),
]
Density: TypeAlias = Annotated[
    float,
    symbol(glyph=r"\rho_{mat}", description="Uniform density", unit="kg/m^3"),
]
TotalPanelArea: TypeAlias = Annotated[
    float,
    symbol(glyph=r"A_{tot}", description="Total panel area", unit="m^2"),
]
