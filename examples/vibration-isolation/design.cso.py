"""Compose a numerical equilibrium with documented response and energy calculations."""

from cso_python import boolean, calculation, check, section
from quantities import (
    Force,
    Stiffness,
    Cubic,
    Mass,
    Damping,
    Frequency,
    Motion,
    Energy,
    Deflection,
    Allowance,
    Allowed,
)
from _cso_bindings._external.methods import equilibrium
from _cso_bindings.response import harmonic_response as response


@calculation(id="isolator-design", title="Nonlinear isolator design case")
@section(title="Equilibrium and response", root=True)
def design(
    force: Force,
    linear_stiffness: Stiffness,
    cubic_coefficient: Cubic,
    mass: Mass,
    damping: Damping,
    frequency: Frequency,
    motion: Motion,
    allowance: Allowance = 0.009,
    target: Allowed = 0.3,
):
    static_equilibrium = equilibrium(
        force=force,
        linear_stiffness=linear_stiffness,
        cubic_coefficient=cubic_coefficient,
    )
    # Keep a named review quantity because the travel criterion targets it.
    displacement: Deflection = static_equilibrium["displacement"]
    stored_energy: Energy = (
        0.5 * linear_stiffness * displacement ** 2
        + 0.25 * cubic_coefficient * displacement ** 4
    )
    boolean(id="cubic-spring", description="Cubic spring included", predicate=cubic_coefficient > 0)
    check(
        id="travel-limit",
        targets=("displacement",),
        explanation="Static equilibrium displacement must not exceed the allowed travel.",
        predicate=displacement <= allowance,
    )
    harmonic_response = response(
        linear_stiffness=linear_stiffness,
        cubic_coefficient=cubic_coefficient,
        displacement=displacement,
        mass=mass,
        damping=damping,
        frequency=frequency,
        motion=motion,
        target=target,
    )
    return {
        "screened_transmissibility": harmonic_response["screened_transmissibility"],
        "displacement": displacement,
        "stored_energy": stored_energy,
        "natural_frequency": harmonic_response["natural_frequency"],
        "transmissibility": harmonic_response["transmissibility"],
    }
