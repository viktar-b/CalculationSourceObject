from typing import Annotated

from _cso_bindings.defaulted_step import adjust
from cso_python import CalculationResults, calculation, section, symbol
from metadata import Amount, Increment


@calculation(id="forward", title="Forward an exported input")
@section(id="forward", title="Forwarding", root=True)
def forward(amount: Amount = 2, increment: Increment = 3) -> CalculationResults:
    first = adjust(amount=amount, increment=increment)
    second = adjust(amount=first["original"], increment=increment)
    total: Annotated[
        float, symbol(glyph="R", description="Combined results", unit="m")
    ] = first["adjusted"] + second["adjusted"]
    return {"total": total}
