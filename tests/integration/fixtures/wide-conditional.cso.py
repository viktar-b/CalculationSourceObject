from typing import Annotated
from math import sqrt
from cso_python import calculation, section, symbol


@calculation(id="wide-conditional", title="Wide conditional regression")
@section(title="Synthetic dimensionless expression", root=True)
def calculate(
    effective_operand: Annotated[float, symbol(glyph="A_{eff}", description="First synthetic operand", unit="")] = 1234.56,
    web_operand: Annotated[float, symbol(glyph="b_{web}", description="Second synthetic operand", unit="")] = 78.90,
    partial_factor: Annotated[float, symbol(glyph="gamma_{M0}", description="Synthetic divisor", unit="")] = 1.25,
):
    selected_value: Annotated[float, symbol(glyph="Q_{sel}", description="Selected synthetic value", unit="")] = (
        (effective_operand**2 + web_operand**2) / sqrt(web_operand**2 + partial_factor**2)
        if sqrt(effective_operand**2 + web_operand**2) >= (effective_operand + web_operand) / partial_factor
        and effective_operand**2 + partial_factor**2 < 1234567
        else sqrt(partial_factor / (effective_operand + web_operand))
    )
    return {"selected_value": selected_value}
