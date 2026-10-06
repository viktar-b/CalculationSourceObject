"""Open cylindrical shell: developed wall, steel quantity, and course schedule."""

from typing import Annotated

from _cso_bindings.courses import shell_courses
from _cso_bindings.geometry.circle import circle
from _cso_bindings.thickness import metres_from_millimetres
from cso_python import (
    CalculationResults,
    calculation,
    document_section,
    section,
    symbol,
    text,
)
from quantities import (
    BoltsPerCourse,
    CourseCount,
    SteelDensity,
    TankDiameter,
    TankHeight,
    WallThicknessMillimetres,
)


@calculation(id="tank-shell", title="Cylindrical shell")
@section(id="shell", title="Cylindrical shell")
def shell(
    diameter: TankDiameter,
    height: TankHeight,
    thickness_mm: WallThicknessMillimetres = 8.0,
    density: SteelDensity = 7850.0,
    course_count: CourseCount = 4,
    bolts_per_course: BoltsPerCourse = 12,
) -> CalculationResults:
    base_circle = circle(diameter=diameter)
    wall_thickness = metres_from_millimetres(thickness_mm=thickness_mm)
    course_bolts = shell_courses(
        course_count=course_count,
        bolts_per_course=bolts_per_course,
        height=height,
    )

    with document_section(id="shell-plate", title="Shell plate"):
        text(
            id="plate",
            content="Open vertical cylinder. The developed wall excludes roof and floor plates. dev = developed plate; shl = shell.",
        )
        developed_area: Annotated[
            float,
            symbol(
                glyph=r"A_{dev}",
                description="Developed shell area",
                unit="m^2",
            ),
        ] = base_circle["circumference"] * height
        shell_volume: Annotated[
            float,
            symbol(glyph=r"V_{shl}", description="Shell steel volume", unit="m^3"),
        ] = developed_area * wall_thickness["thickness_m"]
        shell_mass: Annotated[
            float,
            symbol(glyph=r"m_{shl}", description="Shell steel mass", unit="kg"),
        ] = shell_volume * density

    course_height: Annotated[
        float,
        symbol(glyph=r"h_{crs}", description="Height of one shell course", unit="m"),
    ] = height / course_count

    return {
        "area": base_circle["area"],
        "circumference": base_circle["circumference"],
        "shell_volume": shell_volume,
        "shell_mass": shell_mass,
        "course_height": course_height,
        "bolt_count": course_bolts["bolt_count"],
        "required_course_count": course_bolts["required_course_count"],
        "course_shortfall": course_bolts["course_shortfall"],
    }
