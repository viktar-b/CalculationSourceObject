"""Shared presentation metadata for the cylindrical tank estimate."""

from typing import Annotated, TypeAlias

from cso_python import symbol

TankDiameter: TypeAlias = Annotated[
    float,
    symbol(glyph=r"D_{tank}", description="Tank inside diameter", unit="m"),
]
TankHeight: TypeAlias = Annotated[
    float,
    symbol(glyph=r"h_{tank}", description="Tank shell height", unit="m"),
]
WallThicknessMillimetres: TypeAlias = Annotated[
    float,
    symbol(
        glyph=r"t_{wall,mm}",
        description="Shell wall thickness",
        unit="mm",
    ),
]
WallThicknessMetres: TypeAlias = Annotated[
    float,
    symbol(glyph=r"t_{wall}", description="Shell wall thickness", unit="m"),
]
SteelDensity: TypeAlias = Annotated[
    float,
    symbol(glyph=r"\rho_{stl}", description="Steel density", unit="kg/m^3"),
]
CircleArea: TypeAlias = Annotated[
    float,
    symbol(glyph=r"A_{circ}", description="Inside base area", unit="m^2"),
]
CircleCircumference: TypeAlias = Annotated[
    float,
    symbol(glyph=r"C_{circ}", description="Inside circumference", unit="m"),
]
CourseCount: TypeAlias = Annotated[
    int,
    symbol(glyph=r"n_{crs}", description="Number of shell courses", unit=""),
]
BoltsPerCourse: TypeAlias = Annotated[
    int,
    symbol(glyph=r"n_{bolt,crs}", description="Bolts in one course", unit=""),
]
MaximumCourseHeight: TypeAlias = Annotated[
    float,
    symbol(
        glyph=r"h_{crs,max}",
        description="Maximum height of one shell course",
        unit="m",
    ),
]
FillRatio: TypeAlias = Annotated[
    float,
    symbol(glyph=r"r_{fill}", description="Liquid fill ratio", unit=""),
]
LiquidDensity: TypeAlias = Annotated[
    float,
    symbol(glyph=r"\rho_{liq}", description="Liquid density", unit="kg/m^3"),
]
PlanRadius: TypeAlias = Annotated[
    float,
    symbol(glyph=r"r_{plan}", description="Plan distance from the origin", unit="m"),
]
BearingDegrees: TypeAlias = Annotated[
    float,
    symbol(
        glyph=r"\theta_{bear}",
        description="Plan bearing from the east axis toward north",
        unit="deg",
    ),
]
BaselineDiameter: TypeAlias = Annotated[
    float,
    symbol(glyph=r"D_{base}", description="Baseline tank diameter", unit="m"),
]
CandidateDiameter: TypeAlias = Annotated[
    float,
    symbol(glyph=r"D_{cand}", description="Candidate tank diameter", unit="m"),
]
