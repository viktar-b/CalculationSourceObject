"""Local harmonic response about a nonlinear spring's static equilibrium."""

import math
from cso_python import applicable, boolean, calculation, check, document_section, section, text
from quantities import (
    Stiffness,
    Cubic,
    Mass,
    Damping,
    Frequency,
    Motion,
    Deflection,
    Tangent,
    Natural,
    DampingRatio,
    Ratio,
    Transmission,
    Allowed,
    MotionLimit,
    Screened,
)


@calculation(id="linearized-response", title="Harmonic response about equilibrium")
@section(title="Local response", root=True)
def harmonic_response(
    linear_stiffness: Stiffness,
    cubic_coefficient: Cubic,
    displacement: Deflection,
    mass: Mass,
    damping: Damping,
    frequency: Frequency,
    motion: Motion,
    target: Allowed = 0.3,
):
    text(
        id="linearization",
        content="Differentiate the cubic restoring force at equilibrium. Treat the resulting tangent stiffness and viscous damper as a single-degree-of-freedom oscillator. The dynamic displacement is prescribed only to qualify this local linearization.",
    )
    tangent_stiffness: Tangent = (
        linear_stiffness + 3.0 * cubic_coefficient * displacement**2
    )
    natural_frequency: Natural = math.sqrt(tangent_stiffness / mass) / (2.0 * math.pi)
    damping_ratio: DampingRatio = damping / (2.0 * math.sqrt(tangent_stiffness * mass))
    frequency_ratio: Ratio = frequency / natural_frequency
    boolean(id="below-natural", description="Excitation below the natural frequency", predicate=frequency < natural_frequency)
    with document_section(id="transmission", title="Force isolation and validity"):
        transmissibility: Transmission = math.sqrt(
            (1.0 + (2.0 * damping_ratio * frequency_ratio) ** 2)
            / (
                (1.0 - frequency_ratio**2) ** 2
                + (2.0 * damping_ratio * frequency_ratio) ** 2
            )
        )
    motion_limit: MotionLimit = 0.1 * displacement
    applicable(
        id="small-motion",
        targets=("transmissibility",),
        explanation="Dynamic displacement must not exceed ten percent of the static displacement for this chosen local-model limit.",
        predicate=motion <= motion_limit,
    )
    check(
        id="isolation-target",
        targets=("transmissibility",),
        explanation="Force transmissibility must be at most the stated target.",
        predicate=transmissibility <= target,
    )
    screened_transmissibility: Screened = (
        transmissibility if motion <= motion_limit else 1.0
    )
    return {
        "screened_transmissibility": screened_transmissibility,
        "natural_frequency": natural_frequency,
        "damping_ratio": damping_ratio,
        "frequency_ratio": frequency_ratio,
        "transmissibility": transmissibility,
    }
