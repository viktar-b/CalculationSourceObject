"""Reuse each reference calculation twice and compare selected public outputs."""

from _cso_bindings.comparison import compare_properties
from _cso_bindings.hot_formed_i_sections.calculate import calculate as hot_formed_section
from _cso_bindings.unequal_tapered_i_beam.calculate import calculate as tapered_section
from cso_python import CalculationResults, calculation, section, text
from quantities import BaselineDepth, CandidateDepth


@calculation(id="compare-hot-formed", title="Compare hot-formed I-section depths")
@section(id="comparison", title="Hot-formed section comparison", root=True)
def compare_hot_formed(
    baseline_depth: BaselineDepth = 1056,
    candidate_depth: CandidateDepth = 1200,
) -> CalculationResults:
    text(
        id="scope",
        content="Compare section depths while retaining the reference's other default dimensions and material inputs. Ratios describe geometry, not structural capacity or design compliance. Baseline area and second moment must be positive.",
    )
    text(
        id="notation",
        content="Subscripts base and cand identify the input depths; bs and cs identify baseline_section and candidate_section results. Each child retains its reference notation. The comparison uses the major-axis centroidal second moment I_yy.",
    )
    baseline_section = hot_formed_section(section_depth=baseline_depth)
    candidate_section = hot_formed_section(section_depth=candidate_depth)
    property_ratios = compare_properties(
        baseline_area=baseline_section["cross_section_area"],
        candidate_area=candidate_section["cross_section_area"],
        baseline_inertia=baseline_section["second_moment_of_area_about_major_axis"],
        candidate_inertia=candidate_section["second_moment_of_area_about_major_axis"],
    )
    return {
        "baseline_area": baseline_section["cross_section_area"],
        "candidate_area": candidate_section["cross_section_area"],
        "area_ratio": property_ratios["area_ratio"],
        "inertia_ratio": property_ratios["inertia_ratio"],
    }


@calculation(id="compare-tapered", title="Compare unequal tapered I-beam depths")
@section(id="comparison", title="Tapered section comparison", root=True)
def compare_tapered(
    baseline_depth: BaselineDepth = 100,
    candidate_depth: CandidateDepth = 120,
) -> CalculationResults:
    text(
        id="scope",
        content="Compare section depths while retaining the reference's other default dimensions and zero lower boundary. Ratios describe geometry, not structural capacity or design compliance. Baseline area and second moment must be positive.",
    )
    text(
        id="notation",
        content="Subscripts base and cand identify the input depths; bs and cs identify baseline_section and candidate_section results. Each child retains its reference notation and x-axis/y-axis scopes. The comparison uses the centroidal second moment I_x.",
    )
    baseline_section = tapered_section(section_depth=baseline_depth)
    candidate_section = tapered_section(section_depth=candidate_depth)
    property_ratios = compare_properties(
        baseline_area=baseline_section["total_area_of_the_section"],
        candidate_area=candidate_section["total_area_of_the_section"],
        baseline_inertia=baseline_section["second_moment_of_area_about_x_axis"],
        candidate_inertia=candidate_section["second_moment_of_area_about_x_axis"],
    )
    return {
        "baseline_area": baseline_section["total_area_of_the_section"],
        "candidate_area": candidate_section["total_area_of_the_section"],
        "area_ratio": property_ratios["area_ratio"],
        "inertia_ratio": property_ratios["inertia_ratio"],
    }
