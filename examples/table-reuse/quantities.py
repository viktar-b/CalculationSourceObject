"""Shared quantities for the printed table reuse example."""
from typing import Annotated, TypeAlias
from cso_python import symbol

AppliedForce: TypeAlias = Annotated[float, symbol(glyph=r"F_{ax}", description="Applied axial force", unit="N")]
AxialStiffness: TypeAlias = Annotated[float, symbol(glyph=r"k_{ax}", description="Axial stiffness", unit="N/m")]
GaugeLength: TypeAlias = Annotated[float, symbol(glyph=r"L_{ax}", description="Gauge length", unit="m")]
Extension: TypeAlias = Annotated[float, symbol(glyph=r"u_{ax}", description="Axial extension", unit="m")]
Strain: TypeAlias = Annotated[float, symbol(glyph=r"epsilon_{ax}", description="Axial strain", unit="")]
Energy: TypeAlias = Annotated[float, symbol(glyph=r"U_{el}", description="Elastic strain energy", unit="J")]

