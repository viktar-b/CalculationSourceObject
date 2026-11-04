from cso_python import external_function
from quantities import Force, Stiffness, Cubic, Deflection, Residual, Iterations

equilibrium = external_function(
    path="helpers/equilibrium.py",
    function="solve_equilibrium",
    inputs={"force": Force, "linear_stiffness": Stiffness, "cubic_coefficient": Cubic},
    outputs={
        "displacement": Deflection,
        "residual": Residual,
        "iterations": Iterations,
    },
    description="""Solve F = k x + a x³ by bisection on [0, F/k] to an interval width of 1e-12 m. Positive k and nonnegative a give a unique nonnegative root. Return displacement, force residual and iteration count. The residual and count are diagnostics, not independent accuracy certificates.""",
)
