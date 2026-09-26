"""Supported formula calls; execution still uses Python's native functions."""

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class FunctionCall:
    name: str
    function_id: str
    arity: int
    module: Literal["math", "builtins"] = "math"

    @property
    def spellings(self) -> tuple[str, ...]:
        if self.module == "math":
            return (self.name, f"math.{self.name}")
        return (self.name,)


FUNCTION_CALLS = (
    FunctionCall("sqrt", "fg.sqrt", 1),
    FunctionCall("ceil", "fg.ceil", 1),
    FunctionCall("round", "fg.round", 1, "builtins"),
    FunctionCall("max", "fg.max", 2, "builtins"),
    FunctionCall("radians", "fg.rad", 1),
    FunctionCall("degrees", "fg.deg", 1),
    FunctionCall("sin", "fg.sin", 1),
    FunctionCall("cos", "fg.cos", 1),
    FunctionCall("tan", "fg.tan", 1),
    FunctionCall("asin", "fg.asin", 1),
    FunctionCall("acos", "fg.acos", 1),
    FunctionCall("atan", "fg.atan", 1),
    FunctionCall("sinh", "fg.sinh", 1),
    FunctionCall("cosh", "fg.cosh", 1),
    FunctionCall("tanh", "fg.tanh", 1),
)

CALLS = {spelling: call for call in FUNCTION_CALLS for spelling in call.spellings}
MATH_FUNCTION_NAMES = frozenset(
    call.name for call in FUNCTION_CALLS if call.module == "math"
)
BUILTIN_FUNCTION_NAMES = frozenset(
    call.name for call in FUNCTION_CALLS if call.module == "builtins"
)
