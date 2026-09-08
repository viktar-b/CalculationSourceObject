from typing import Annotated

from cso_python import CalculationResults, calculation, section, symbol
from metadata import Amount, Increment


@calculation(id="adjust", title="Defaulted addition")
@section(id="adjust", title="Addition", root=True)
def adjust(amount: Amount, increment: Increment = 3) -> CalculationResults:
    adjusted: Annotated[
        float, symbol(glyph="R", description="Adjusted amount", unit="m")
    ] = amount + increment
    return {"adjusted": adjusted, "original": amount}
