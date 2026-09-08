from typing import Annotated

from cso_python import CalculationResults, calculation, section, symbol
from metadata import Amount


@calculation(id="hidden", title="Hidden intermediate")
@section(id="hidden", title="Observation", root=True)
def hidden(amount: Amount = 2) -> CalculationResults:
    intermediate: Annotated[
        float, symbol(glyph="I", description="Hidden intermediate", unit="m")
    ] = amount + 1
    adjusted: Annotated[
        float, symbol(glyph="R", description="Public result", unit="m")
    ] = intermediate * 2
    return {"adjusted": adjusted}
