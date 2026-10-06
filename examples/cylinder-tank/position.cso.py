"""Plan position of the tank centre."""

import math
from typing import Annotated

from cso_python import CalculationResults, calculation, section, symbol, text
from quantities import BearingDegrees, PlanRadius


@calculation(id="plan-offset", title="Plan position")
@section(id="position", title="Plan position")
def plan_offset(
    plan_radius: PlanRadius = 5.0,
    bearing_degrees: BearingDegrees = 0.0,
) -> CalculationResults:
    text(
        id="scopes",
        content="The centre offset uses one glyph, c_off. The x-axis scope is the easting and the y-axis scope is the northing. Bearings start at the east axis and turn toward north. rad = radians; rec = recovered.",
    )
    bearing_radians: Annotated[
        float,
        symbol(
            glyph=r"\theta_{rad}",
            description="Plan bearing converted to radians",
            unit="rad",
        ),
    ] = math.radians(bearing_degrees)
    east_offset: Annotated[
        float,
        symbol(
            glyph=r"c_{off}",
            description="East component of the tank centre. The x-axis scope is the easting.",
            unit="m",
            notation_scope="x-axis",
        ),
    ] = plan_radius * math.cos(bearing_radians)
    north_offset: Annotated[
        float,
        symbol(
            glyph=r"c_{off}",
            description="North component of the tank centre. The y-axis scope is the northing.",
            unit="m",
            notation_scope="y-axis",
        ),
    ] = plan_radius * math.sin(bearing_radians)
    radial_offset: Annotated[
        float,
        symbol(
            glyph=r"r_{off}",
            description="Radial offset of the tank centre",
            unit="m",
        ),
    ] = math.hypot(east_offset, north_offset)
    recovered_bearing: Annotated[
        float,
        symbol(
            glyph=r"\theta_{rec}",
            description="Bearing recovered from the east and north components",
            unit="deg",
        ),
    ] = math.degrees(math.atan2(north_offset, east_offset))
    return {
        "east_offset": east_offset,
        "north_offset": north_offset,
        "radial_offset": radial_offset,
        "recovered_bearing": recovered_bearing,
    }
