"""Two reports using the same nonlinear equilibrium and response calculations."""

from cso_python import calculation, figure, method, section, table, text
from quantities import (
    Force,
    Mass,
    Damping,
    Motion,
    Stiffness,
    Cubic,
    Allowance,
    Allowed,
)
from _cso_bindings.design import design
from _cso_bindings.response import harmonic_response as response
from _cso_bindings._external.methods import equilibrium


@calculation(
    id="isolator-comparison",
    title="Nonlinear vibration isolation: three design candidates",
)
@section(title="Design study", root=True)
def compare(
    force: Force = 400.0,
    mass: Mass = 50.0,
    allowance: Allowance = 0.009,
    target: Allowed = 0.3,
):
    text(
        id="brief",
        content="An educational model study of three spring-damper candidates under a prescribed static force and harmonic excitation. Material strength, fatigue, stability of a real installation and code compliance are not assessed. SI units are explicit; no automatic unit conversion is implied.",
    )
    figure(
        id="system",
        path="isolator.svg",
        media_type="image/svg+xml",
        caption="A mass supported by a nonlinear spring and viscous damper. The static force sets equilibrium; harmonic forcing tests the local response.",
        alt="Mass m_iso with downward static force F_app and equilibrium motion x_eq, supported by a cubic spring and a parallel viscous damper c_vis.",
    )
    text(
        id="notation",
        content="lin = linear spring; cub = cubic term; eq = static equilibrium; tan = tangent stiffness; nat = natural frequency; exc = excitation; vis = viscous; lim = specified limit. The qualifiers ls, bp and hm identify the three candidates; se identifies static equilibrium and hr identifies harmonic response.",
    )
    method(
        id="design-method",
        calculation=design,
        title="Candidate calculation",
    )
    linear_soft = design(
        force=force,
        linear_stiffness=40000.0,
        cubic_coefficient=0.0,
        mass=mass,
        damping=120.0,
        frequency=20.0,
        motion=0.0005,
        allowance=allowance,
        target=target,
    )
    balanced_peak = design(
        force=force,
        linear_stiffness=20000.0,
        cubic_coefficient=200000000.0,
        mass=mass,
        damping=200.0,
        frequency=8.0,
        motion=0.0005,
        allowance=allowance,
        target=target,
    )
    hardening_motion = design(
        force=force,
        linear_stiffness=10000.0,
        cubic_coefficient=625000000.0,
        mass=mass,
        damping=220.0,
        frequency=20.0,
        motion=0.002,
        allowance=allowance,
        target=target,
    )
    table(
        id="candidates",
        method="design-method",
        title="Candidate comparison",
        cases={
            "Linear / 20 Hz": linear_soft,
            "Hardening / 8 Hz": balanced_peak,
            "Large motion / 20 Hz": hardening_motion,
        },
        inputs=(
            "force",
            "mass",
            "linear_stiffness",
            "cubic_coefficient",
            "damping",
            "frequency",
            "motion",
            "allowance",
            "target",
        ),
        outputs=(
            "displacement",
            "stored_energy",
            "natural_frequency",
            "transmissibility",
            "screened_transmissibility",
        ),
        cases_axis="columns",
        column_cap=3,
    )
    return {
        "linear_transmissibility": linear_soft["transmissibility"],
        "near_resonance_transmissibility": balanced_peak["transmissibility"],
        "large_motion_transmissibility": hardening_motion["transmissibility"],
    }


@calculation(
    id="frequency-sweep", title="Frequency sweep of a nonlinear vibration isolator"
)
@section(title="Excitation study", root=True)
def sweep(
    force: Force = 400.0,
    linear_stiffness: Stiffness = 20000.0,
    cubic_coefficient: Cubic = 200000000.0,
    mass: Mass = 50.0,
    damping: Damping = 200.0,
    motion: Motion = 0.0005,
    target: Allowed = 0.3,
):
    text(
        id="scope",
        content="Solve equilibrium once and reuse the equilibrium displacement in five response cases. Harmonic force transmissibility is not a transient response or a nonlinear dynamic solution.",
    )
    static_equilibrium = equilibrium(
        force=force,
        linear_stiffness=linear_stiffness,
        cubic_coefficient=cubic_coefficient,
    )
    method(
        id="response-method",
        calculation=response,
        title="Linearized vibration response",
    )
    low_frequency = response(
        linear_stiffness=linear_stiffness,
        cubic_coefficient=cubic_coefficient,
        displacement=static_equilibrium["displacement"],
        mass=mass,
        damping=damping,
        frequency=3.0,
        motion=motion,
        target=target,
    )
    rising_frequency = response(
        linear_stiffness=linear_stiffness,
        cubic_coefficient=cubic_coefficient,
        displacement=static_equilibrium["displacement"],
        mass=mass,
        damping=damping,
        frequency=5.0,
        motion=motion,
        target=target,
    )
    near_peak = response(
        linear_stiffness=linear_stiffness,
        cubic_coefficient=cubic_coefficient,
        displacement=static_equilibrium["displacement"],
        mass=mass,
        damping=damping,
        frequency=6.4,
        motion=motion,
        target=target,
    )
    falling_frequency = response(
        linear_stiffness=linear_stiffness,
        cubic_coefficient=cubic_coefficient,
        displacement=static_equilibrium["displacement"],
        mass=mass,
        damping=damping,
        frequency=12.0,
        motion=motion,
        target=target,
    )
    isolated_frequency = response(
        linear_stiffness=linear_stiffness,
        cubic_coefficient=cubic_coefficient,
        displacement=static_equilibrium["displacement"],
        mass=mass,
        damping=damping,
        frequency=20.0,
        motion=motion,
        target=target,
    )
    table(
        id="sweep",
        method="response-method",
        title="Frequency response: resonance and isolation",
        cases={
            "3 Hz": low_frequency,
            "5 Hz": rising_frequency,
            "6.4 Hz": near_peak,
            "12 Hz": falling_frequency,
            "20 Hz": isolated_frequency,
        },
        inputs=("frequency",),
        outputs=("frequency_ratio", "transmissibility"),
        cases_axis="rows",
        column_cap=3,
    )
    return {
        "near_peak_transmissibility": near_peak["transmissibility"],
        "isolated_transmissibility": isolated_frequency["transmissibility"],
    }
