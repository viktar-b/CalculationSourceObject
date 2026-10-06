"""Compare two cylindrical shells that share every input except diameter."""

from typing import Annotated

from _cso_bindings.shell import shell
from cso_python import CalculationResults, calculation, section, symbol, text
from quantities import (
    BaselineDiameter,
    BoltsPerCourse,
    CandidateDiameter,
    CourseCount,
    SteelDensity,
    TankHeight,
    WallThicknessMillimetres,
)


@calculation(id="compare-shells", title="Compare cylindrical shells")
@section(id="comparison", title="Shell comparison", root=True)
def compare_shells(
    baseline_diameter: BaselineDiameter = 2.0,
    candidate_diameter: CandidateDiameter = 2.5,
    height: TankHeight = 6.0,
    thickness_mm: WallThicknessMillimetres = 8.0,
    density: SteelDensity = 7850.0,
    course_count: CourseCount = 4,
    bolts_per_course: BoltsPerCourse = 12,
) -> CalculationResults:
    text(
        id="scope",
        content="Both shells use the same height, wall thickness, density, and course schedule. Only the inside diameter changes. The mass ratio describes that geometry. It does not establish capacity or compliance. Baseline diameter, height, thickness, and density must be positive.",
    )
    text(
        id="notation",
        content="Subscripts base and cand identify the input diameters. Result qualifiers bs and cs identify baseline_shell and candidate_shell. Nested qualifiers bc, wt, and cb identify base_circle, wall_thickness, and course_bolts.",
    )
    baseline_shell = shell(
        diameter=baseline_diameter,
        height=height,
        thickness_mm=thickness_mm,
        density=density,
        course_count=course_count,
        bolts_per_course=bolts_per_course,
    )
    candidate_shell = shell(
        diameter=candidate_diameter,
        height=height,
        thickness_mm=thickness_mm,
        density=density,
        course_count=course_count,
        bolts_per_course=bolts_per_course,
    )
    mass_ratio: Annotated[
        float,
        symbol(
            glyph=r"R_{mass}",
            description="Candidate-to-baseline shell mass ratio",
            unit="",
        ),
    ] = candidate_shell["shell_mass"] / baseline_shell["shell_mass"]
    return {
        "baseline_mass": baseline_shell["shell_mass"],
        "candidate_mass": candidate_shell["shell_mass"],
        "mass_ratio": mass_ratio,
    }
