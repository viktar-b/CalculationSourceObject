"""Convert shell thickness from millimetres to metres."""

from cso_python import CalculationResults, calculation, section, text
from quantities import WallThicknessMetres, WallThicknessMillimetres


@calculation(id="wall-thickness", title="Wall thickness conversion")
@section(id="thickness", title="Wall thickness")
def metres_from_millimetres(
    thickness_mm: WallThicknessMillimetres,
) -> CalculationResults:
    text(
        id="conversion",
        content="Wall thickness is supplied in millimetres and converted to metres before a metre formula uses it. The qualifier mm marks the millimetre input. There is no automatic unit conversion.",
    )
    thickness_m: WallThicknessMetres = thickness_mm / 1000
    return {"thickness_m": thickness_m}
