"""Static interface for the optional SciPy adapter."""

from cso_python import external_function
from quantities import (
    AbsoluteTolerance,
    EstimatedError,
    IntegralValue,
    RelativeTolerance,
    UpperLimit,
)

integrate_square = external_function(
    path="helpers/integration.py",
    function="integrate_square",
    inputs={
        "upper_limit": UpperLimit,
        "epsabs": AbsoluteTolerance,
        "epsrel": RelativeTolerance,
    },
    outputs={"value": IntegralValue, "absolute_error": EstimatedError},
    defaults={"epsabs": 1e-8, "epsrel": 1e-8},
    description="Integrate x squared from zero to the supplied limit using SciPy adaptive quadrature. The second output is the estimated absolute error.",
)
