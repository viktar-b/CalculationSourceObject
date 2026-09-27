"""Compare properties already calculated for two sections in matching units."""

from typing import Annotated

from cso_python import CalculationResults, calculation, section, symbol
from quantities import BaselineArea, BaselineInertia, CandidateArea, CandidateInertia


@calculation(id="property-ratios", title="Section-property ratios")
@section(id="ratios", title="Candidate relative to baseline")
def compare_properties(
    baseline_area: BaselineArea,
    candidate_area: CandidateArea,
    baseline_inertia: BaselineInertia,
    candidate_inertia: CandidateInertia,
) -> CalculationResults:
    area_ratio: Annotated[
        float, symbol(glyph="R_{area}", description="Candidate-to-baseline area ratio", unit="")
    ] = candidate_area / baseline_area
    inertia_ratio: Annotated[
        float, symbol(glyph="R_{inertia}", description="Candidate-to-baseline second-moment ratio", unit="")
    ] = candidate_inertia / baseline_inertia
    return {"area_ratio": area_ratio, "inertia_ratio": inertia_ratio}
