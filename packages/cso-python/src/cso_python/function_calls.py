"""Supported formula calls; execution still uses Python's native functions."""

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class FunctionCall:
    name: str
    function_id: str
    min_arity: int = 1
    max_arity: int | None = 1
    module: Literal["math", "builtins"] = "math"

    def accepts_arity(self, count: int) -> bool:
        return count >= self.min_arity and (
            self.max_arity is None or count <= self.max_arity
        )

    @property
    def spellings(self) -> tuple[str, ...]:
        if self.module == "math":
            return (self.name, f"math.{self.name}")
        return (self.name,)


FUNCTION_CALLS = (
    FunctionCall("abs", "fg.abs", 1, module="builtins"),
    FunctionCall("sqrt", "fg.sqrt", 1),
    FunctionCall("ceil", "fg.ceil", 1),
    FunctionCall("floor", "fg.floor", 1),
    FunctionCall("round", "fg.round", max_arity=2, module="builtins"),
    FunctionCall("max", "fg.max", min_arity=2, max_arity=None, module="builtins"),
    FunctionCall("min", "fg.min", min_arity=2, max_arity=None, module="builtins"),
    FunctionCall("exp", "fg.exp"),
    FunctionCall("log", "fg.log", max_arity=2),
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
