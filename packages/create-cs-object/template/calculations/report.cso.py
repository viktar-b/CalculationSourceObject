from typing import Annotated
from cso_python import calculation, section, symbol, text


@calculation(id="rectangle-area", title="Rectangle area")
@section(title="Rectangle", root=True)
def calculate(
    width: Annotated[float, symbol(glyph="w_{rect}", description="Rectangle width", unit="m")] = 2.0,
    height: Annotated[float, symbol(glyph="h_{rect}", description="Rectangle height", unit="m")] = 3.0,
):
    text(id="assumptions", content="Assume a flat rectangle with perpendicular sides and positive dimensions. The qualifier rect means rectangle.")
    text(id="reference", content="Reference: the elementary rectangle relation, area equals width multiplied by height. See brief.md for the project scope.")
    area: Annotated[float, symbol(glyph="A_{rect}", description="Rectangle area", unit="m^2")] = width * height
    return {"area": area}
