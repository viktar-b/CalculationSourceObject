"""Dependency-free numerical adapter. Numerical failures raise, never fabricate results."""

import math


def solve_equilibrium(*, force, linear_stiffness, cubic_coefficient):
    if force < 0 or linear_stiffness <= 0 or cubic_coefficient < 0:
        raise ValueError(
            "Require force >= 0, linear_stiffness > 0 and cubic_coefficient >= 0"
        )
    lower, upper = 0.0, force / linear_stiffness
    for iterations in range(1, 201):
        displacement = (lower + upper) / 2.0
        restoring = (
            linear_stiffness * displacement + cubic_coefficient * displacement**3
        )
        if not math.isfinite(restoring):
            raise ArithmeticError("Nonfinite restoring force")
        if restoring < force:
            lower = displacement
        else:
            upper = displacement
        if upper - lower <= 1e-12:
            displacement = (lower + upper) / 2.0
            return {
                "displacement": float(displacement),
                "residual": float(
                    linear_stiffness * displacement
                    + cubic_coefficient * displacement**3
                    - force
                ),
                "iterations": iterations,
            }
    raise ArithmeticError("Equilibrium did not converge within 200 bisections")
