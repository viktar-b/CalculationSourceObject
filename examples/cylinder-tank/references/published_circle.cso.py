"""Glyph-faithful transcription of the elementary circle relations."""

import math
from typing import Annotated

from cso_python import CalculationResults, calculation, section, symbol, text


@calculation(
    id="published-circle",
    title="Published circle relations",
    metadata={
        "referenceUrl": "https://en.wikipedia.org/wiki/Circle",
    },
)
@section(id="published-circle", title="Published circle relations", root=True)
def published_circle(
    diameter: Annotated[
        float,
        symbol(glyph="d", description="Diameter", unit="m"),
    ] = 2.0,
) -> CalculationResults:
    text(
        id="source",
        content="Reproduction of the elementary circle relations: circumference equals pi times diameter, and area equals pi times radius squared. Reference: https://en.wikipedia.org/wiki/Circle. The glyphs d, r, C, and A are that reference notation.",
    )
    radius: Annotated[
        float,
        symbol(glyph="r", description="Radius", unit="m"),
    ] = diameter / 2
    circumference: Annotated[
        float,
        symbol(glyph="C", description="Circumference", unit="m"),
    ] = math.pi * diameter
    area: Annotated[
        float,
        symbol(glyph="A", description="Area", unit="m^2"),
    ] = math.pi * radius**2
    return {"circumference": circumference, "area": area}
