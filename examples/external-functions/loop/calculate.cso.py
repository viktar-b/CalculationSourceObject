"""A loop supplies captured quantities to a documented downstream formula."""

from cso_python import calculation, section, text
from quantities import DoubledIntegral, UpperLimit
from _cso_bindings._external.methods import midpoint_square


@calculation(id="midpoint-example", title="Midpoint integration with an external loop")
@section(title="Integrate a square", root=True)
def calculate(upper_limit: UpperLimit = 4.0):
    text(
        id="basis",
        content="Integrate the square of a dimensionless coordinate from zero to the upper limit. Four midpoint intervals give an approximation, not an exact integral.",
    )
    integration = midpoint_square(upper_limit=upper_limit)
    doubled: DoubledIntegral = 2.0 * integration["value"]
    return {"integral": integration["value"], "doubled": doubled}
