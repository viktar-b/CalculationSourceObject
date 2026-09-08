"""Two-panel material estimate with a complete reusable calculation trace."""

from _cso_bindings.geometry import rectangle
from _cso_bindings.material import material as estimate_material
from cso_python import (
    CalculationResults,
    calculation,
    figure,
    section,
    text,
)
from quantities import (
    Density,
    FirstPanelHeight,
    PanelWidth,
    SecondPanelHeight,
    Thickness,
    TotalPanelArea,
)


@calculation(id="two-panel", title="Two-panel material estimate")
@section(id="summary", title="Inputs and totals", root=True)
def estimate(
    width: PanelWidth = 2,
    first_panel_height: FirstPanelHeight = 3,
    second_panel_height: SecondPanelHeight = 4,
    thickness: Thickness = 0.1,
    density: Density = 500,
) -> CalculationResults:
    text(
        id="assumptions",
        content="Rectangular panels; uniform thickness and density; no openings and no waste allowance. This is a material estimate, not a structural capacity calculation.",
    )
    text(
        id="notation",
        content="Symbol subscripts: pan = panel; fp = first panel; sp = second panel; rect = rectangle; tot = total; mat = material.",
    )
    figure(
        id="panels",
        path="panels.svg",
        media_type="image/svg+xml",
        caption="Two rectangular panels with shared width and uniform thickness.",
        alt="Two rectangular panels of shared width w_pan, heights h_fp and h_sp, and uniform thickness t_pan.",
    )

    first_panel = rectangle(width=width, height=first_panel_height)
    second_panel = rectangle(width=width, height=second_panel_height)

    total_area: TotalPanelArea = first_panel["area"] + second_panel["area"]

    material_quantities = estimate_material(
        area=total_area, thickness=thickness, density=density
    )

    return {
        "area": total_area,
        "volume": material_quantities["volume"],
        "mass": material_quantities["mass"],
    }
