"""Adaptive quadrature with a separately established analytic expectation."""

from cso_python import calculation, section, text
from quantities import DoubledIntegral, UpperLimit
from _cso_bindings._external.methods import integrate_square


@calculation(
    id="quadrature-example", title="Adaptive quadrature through a scientific adapter"
)
@section(title="Integrate a square", root=True)
def calculate(upper_limit: UpperLimit = 4.0):
    text(
        id="basis",
        content="Integrate the square of a dimensionless coordinate from zero to the supplied limit. The antiderivative is x cubed divided by three, so a limit of four has exact integral 64/3.",
    )
    integration = integrate_square(upper_limit=upper_limit)
    doubled: DoubledIntegral = 2.0 * integration["value"]
    return {"integral": integration["value"], "doubled": doubled}
