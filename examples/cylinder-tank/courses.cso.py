"""Integer course and bolt counts for a cylindrical shell."""

import math
from typing import Annotated

from cso_python import CalculationResults, calculation, section, symbol
from quantities import BoltsPerCourse, CourseCount, MaximumCourseHeight, TankHeight


@calculation(id="shell-courses", title="Shell course schedule")
@section(id="courses", title="Shell courses")
def shell_courses(
    course_count: CourseCount,
    bolts_per_course: BoltsPerCourse,
    height: TankHeight,
    maximum_course_height: MaximumCourseHeight = 1.5,
) -> CalculationResults:
    required_course_count: Annotated[
        int,
        symbol(
            glyph=r"n_{req}",
            description="Courses required by the maximum course height",
            unit="",
        ),
    ] = math.ceil(height / maximum_course_height)
    bolt_count: Annotated[
        int,
        symbol(glyph=r"n_{bolt}", description="Bolts in the shell", unit=""),
    ] = course_count * bolts_per_course
    course_shortfall: Annotated[
        int,
        symbol(
            glyph=r"n_{short}",
            description="Extra courses needed to respect the maximum course height",
            unit="",
        ),
    ] = max(required_course_count - course_count, 0)
    return {
        "required_course_count": required_course_count,
        "bolt_count": bolt_count,
        "course_shortfall": course_shortfall,
    }
