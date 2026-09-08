from typing import Annotated, TypeAlias

from cso_python import symbol

Amount: TypeAlias = Annotated[float, symbol(glyph="Q", description="Amount", unit="m")]
Increment: TypeAlias = Annotated[
    float, symbol(glyph="D", description="Increment", unit="m")
]
