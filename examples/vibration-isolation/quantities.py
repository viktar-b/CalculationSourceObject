from typing import Annotated, TypeAlias
from cso_python import symbol

Force: TypeAlias = Annotated[
    float, symbol(glyph="F_{app}", description="Applied static force", unit="N")
]
Stiffness: TypeAlias = Annotated[
    float, symbol(glyph="k_{lin}", description="Linear spring stiffness", unit="N/m")
]
Cubic: TypeAlias = Annotated[
    float, symbol(glyph="a_{cub}", description="Cubic spring coefficient", unit="N/m^3")
]
Mass: TypeAlias = Annotated[
    float, symbol(glyph="m_{iso}", description="Supported mass", unit="kg")
]
Damping: TypeAlias = Annotated[
    float,
    symbol(glyph="c_{vis}", description="Viscous damping coefficient", unit="N*s/m"),
]
Frequency: TypeAlias = Annotated[
    float, symbol(glyph="f_{exc}", description="Excitation frequency", unit="Hz")
]
Motion: TypeAlias = Annotated[
    float,
    symbol(glyph="x_{dyn}", description="Dynamic displacement amplitude", unit="m"),
]
Deflection: TypeAlias = Annotated[
    float, symbol(glyph="x_{eq}", description="Equilibrium displacement", unit="m")
]
Residual: TypeAlias = Annotated[
    float,
    symbol(
        glyph="R_{eq}",
        description="Force equilibrium residual",
        unit="N",
        comment="Retained solver diagnostic; not an independent accuracy certificate.",
    ),
]
Iterations: TypeAlias = Annotated[
    int,
    symbol(
        glyph="n_{bis}",
        description="Bisection iterations",
        unit="",
        comment="Retained solver diagnostic; not an independent accuracy certificate.",
    ),
]
Tangent: TypeAlias = Annotated[
    float,
    symbol(glyph="k_{tan}", description="Tangent stiffness at equilibrium", unit="N/m"),
]
Natural: TypeAlias = Annotated[
    float,
    symbol(glyph="f_{nat}", description="Linearized natural frequency", unit="Hz"),
]
DampingRatio: TypeAlias = Annotated[
    float, symbol(glyph="z_{vis}", description="Viscous damping ratio", unit="")
]
Ratio: TypeAlias = Annotated[
    float,
    symbol(
        glyph="r_{freq}", description="Excitation to natural frequency ratio", unit=""
    ),
]
Transmission: TypeAlias = Annotated[
    float,
    symbol(glyph="T_{force}", description="Harmonic force transmissibility", unit=""),
]
Energy: TypeAlias = Annotated[
    float, symbol(glyph="U_{spr}", description="Stored spring energy", unit="N*m")
]
Allowed: TypeAlias = Annotated[
    float,
    symbol(glyph="T_{lim}", description="Maximum desired transmissibility", unit=""),
]
Allowance: TypeAlias = Annotated[
    float,
    symbol(
        glyph="x_{lim}", description="Maximum allowed static displacement", unit="m"
    ),
]

MotionLimit: TypeAlias = Annotated[
    float, symbol(glyph="x_{small}", description="Chosen small-motion limit", unit="m")
]

Screened: TypeAlias = Annotated[
    float,
    symbol(
        glyph="T_{screen}",
        description="Screening transmissibility",
        unit="",
        comment="Use unity, meaning no isolation credit, when the chosen small-motion limit is exceeded.",
    ),
]
