"""Inside circle of a vertical cylindrical tank."""

import math
from typing import Annotated

from cso_python import CalculationResults, calculation, section, symbol
from quantities import CircleArea, CircleCircumference, TankDiameter


@calculation(
    id="tank-circle",
    title="Tank base circle",
    metadata={
        "formulaSource": "https://en.wikipedia.org/wiki/Circle",
        "notation": "Qualified glyphs for a new calculation. circ means circle.",
    },
)
@section(id="circle", title="Base circle")
def circle(diameter: TankDiameter) -> CalculationResults:
    radius: Annotated[
        float,
        symbol(glyph=r"r_{circ}", description="Inside radius", unit="m"),
    ] = diameter / 2
    area: CircleArea = math.pi * radius**2
    circumference: CircleCircumference = math.pi * diameter
    return {"area": area, "circumference": circumference}
