"""Cylindrical tank estimate: shell steel, liquid contents, and plan position."""

from _cso_bindings.contents import contents
from _cso_bindings.position import plan_offset
from _cso_bindings.shell import shell
from cso_python import CalculationResults, calculation, figure, section, text
from quantities import (
    BearingDegrees,
    BoltsPerCourse,
    CourseCount,
    FillRatio,
    LiquidDensity,
    PlanRadius,
    SteelDensity,
    TankDiameter,
    TankHeight,
    WallThicknessMillimetres,
)


@calculation(id="cylinder-tank", title="Cylindrical tank estimate")
@section(id="summary", title="Inputs and totals", root=True)
def estimate(
    diameter: TankDiameter = 2.0,
    height: TankHeight = 6.0,
    thickness_mm: WallThicknessMillimetres = 8.0,
    density: SteelDensity = 7850.0,
    course_count: CourseCount = 4,
    bolts_per_course: BoltsPerCourse = 12,
    fill_ratio: FillRatio = 0.5,
    liquid_density: LiquidDensity = 1000.0,
    plan_radius: PlanRadius = 5.0,
    bearing_degrees: BearingDegrees = 0.0,
) -> CalculationResults:
    text(
        id="assumptions",
        content="Open vertical cylinder with a uniform wall. Roof and floor plates, openings, corrosion allowance, and waste are excluded. Liquid volume uses the inside base area and the liquid height. This is a material and contents estimate, not a structural capacity calculation.",
    )
    text(
        id="notation",
        content="Subscripts: tank = tank; circ = circle; wall = wall; mm = millimetres; stl = steel; liq = liquid; crs = course; bolt = bolt; req = required; short = shortfall; free = freeboard; plan = plan; bear = bearing; rad = radians; off = offset; rec = recovered; dev = developed; shl = shell. The centre offset c_off is shared: x-axis is easting and y-axis is northing. Circle formulas follow https://en.wikipedia.org/wiki/Circle with these qualified glyphs.",
    )
    figure(
        id="tank",
        path="tank.svg",
        media_type="image/svg+xml",
        caption="Vertical cylindrical tank with inside diameter D_tank, shell height h_tank, and wall thickness t_wall,mm.",
        alt="Vertical cylinder marked with inside diameter D_tank, shell height h_tank, and wall thickness t_wall,mm.",
    )

    shell_quantities = shell(
        diameter=diameter,
        height=height,
        thickness_mm=thickness_mm,
        density=density,
        course_count=course_count,
        bolts_per_course=bolts_per_course,
    )
    liquid = contents(
        base_area=shell_quantities["area"],
        height=height,
        fill_ratio=fill_ratio,
        liquid_density=liquid_density,
    )
    centre = plan_offset(plan_radius=plan_radius, bearing_degrees=bearing_degrees)

    return {
        "area": shell_quantities["area"],
        "shell_mass": shell_quantities["shell_mass"],
        "liquid_mass": liquid["liquid_mass"],
        "bolt_count": shell_quantities["bolt_count"],
        "radial_offset": centre["radial_offset"],
    }
