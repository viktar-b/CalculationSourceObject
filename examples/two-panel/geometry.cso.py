"""Rectangle geometry in metres; no openings."""

from typing import Annotated

from cso_python import (
    CalculationResults,
    calculation,
    section,
    symbol,
)
from quantities import PanelHeight, PanelWidth


@calculation(id="rectangle", title="Rectangle geometry")
@section(id="geometry", title="Rectangle geometry")
def rectangle(width: PanelWidth, height: PanelHeight) -> CalculationResults:
    area: Annotated[
        float,
        symbol(glyph=r"A_{rect}", description="Panel area", unit="m^2"),
    ] = width * height

    perimeter: Annotated[
        float,
        symbol(glyph=r"P_{rect}", description="Panel perimeter", unit="m"),
    ] = 2 * (width + height)

    return {
        "area": area,
        "perimeter": perimeter,
    }
