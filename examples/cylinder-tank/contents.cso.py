"""Liquid contents of a vertical cylindrical tank."""

from typing import Annotated

from cso_python import CalculationResults, calculation, section, symbol, text
from quantities import CircleArea, FillRatio, LiquidDensity, TankHeight


@calculation(id="tank-contents", title="Tank contents")
@section(id="contents", title="Liquid contents")
def contents(
    base_area: CircleArea,
    height: TankHeight,
    fill_ratio: FillRatio = 0.5,
    liquid_density: LiquidDensity = 1000.0,
) -> CalculationResults:
    text(
        id="fill",
        content="A fill ratio at or below zero is empty, a ratio at or above one is full, and a ratio between them is a partial fill. liq = liquid; free = freeboard.",
    )
    liquid_height: Annotated[
        float,
        symbol(glyph=r"h_{liq}", description="Liquid height", unit="m"),
    ] = (
        height * fill_ratio
        if 0 < fill_ratio < 1
        else height
        if fill_ratio >= 1
        else 0.0
    )
    liquid_volume: Annotated[
        float,
        symbol(glyph=r"V_{liq}", description="Liquid volume", unit="m^3"),
    ] = base_area * liquid_height
    liquid_mass: Annotated[
        float,
        symbol(glyph=r"m_{liq}", description="Liquid mass", unit="kg"),
    ] = liquid_volume * liquid_density
    freeboard: Annotated[
        float,
        symbol(glyph=r"h_{free}", description="Unfilled shell height", unit="m"),
    ] = max(height - liquid_height, 0.0)
    return {
        "liquid_volume": liquid_volume,
        "liquid_mass": liquid_mass,
        "freeboard": freeboard,
    }
