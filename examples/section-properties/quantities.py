"""Metadata for the comparison inputs; section outputs keep their own metadata."""

from typing import Annotated, TypeAlias

from cso_python import symbol

BaselineDepth: TypeAlias = Annotated[
    float, symbol(glyph="h_{base}", description="Baseline section depth", unit="mm")
]
CandidateDepth: TypeAlias = Annotated[
    float, symbol(glyph="h_{cand}", description="Candidate section depth", unit="mm")
]
BaselineArea: TypeAlias = Annotated[
    float, symbol(glyph="A_{base}", description="Baseline section area", unit="mm^2")
]
CandidateArea: TypeAlias = Annotated[
    float, symbol(glyph="A_{cand}", description="Candidate section area", unit="mm^2")
]
BaselineInertia: TypeAlias = Annotated[
    float, symbol(glyph="I_{base}", description="Baseline centroidal second moment", unit="mm^4")
]
CandidateInertia: TypeAlias = Annotated[
    float, symbol(glyph="I_{cand}", description="Candidate centroidal second moment", unit="mm^4")
]
