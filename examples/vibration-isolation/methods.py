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
    description="""Spring force is linear stiffness times displacement plus cubic stiffness times displacement cubed. Find the nonnegative displacement whose spring force equals the applied force. Positive linear stiffness and nonnegative cubic stiffness give one such displacement. Start between zero and applied force divided by linear stiffness, then halve the interval until its width is at most 10⁻¹² m. Report the midpoint, the remaining force imbalance and the number of halving steps. The last two indicate convergence; they are not independent accuracy checks.""",
)
