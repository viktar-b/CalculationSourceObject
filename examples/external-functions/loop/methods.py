"""Static declarations; importing this module does not import its adapter."""

from cso_python import external_function
from quantities import IntervalCount, IntervalWidth, MidpointIntegral, UpperLimit

midpoint_square = external_function(
    path="helpers/midpoint.py",
    function="midpoint_square",
    inputs={"upper_limit": UpperLimit, "intervals": IntervalCount},
    outputs={"value": MidpointIntegral, "interval_width": IntervalWidth},
    defaults={"intervals": 4},
    description="Sum x squared at each interval midpoint and multiply by the interval width.",
)
