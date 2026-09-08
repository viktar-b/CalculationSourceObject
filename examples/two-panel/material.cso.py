"""Uniform material estimate, not structural capacity."""

from typing import Annotated

from cso_python import (
    CalculationResults,
    calculation,
    section,
    symbol,
)
from quantities import Density, Thickness, TotalPanelArea


@calculation(id="material", title="Material estimate")
@section(id="material", title="Material volume and mass")
def material(
    area: TotalPanelArea,
    thickness: Thickness = 0.1,
    density: Density = 500,
) -> CalculationResults:
    volume: Annotated[
        float,
        symbol(glyph=r"V_{mat}", description="Material volume", unit="m^3"),
    ] = area * thickness

    mass: Annotated[
        float,
        symbol(glyph=r"m_{mat}", description="Material mass", unit="kg"),
    ] = volume * density

    return {
        "volume": volume,
        "mass": mass,
    }
