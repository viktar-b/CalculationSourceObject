"""File-backed calculation handles with source-derived signatures."""

from __future__ import annotations

import inspect
import sys
import threading
from pathlib import Path

from .authoring import CalculationResults
from .definitions import Definition, Definitions
from .source import Capture, SourceError


class CalculationHandle:
    def __init__(self, path: Path, function: str, fingerprint: str | None):
        self.path = path
        self.function = function
        self.fingerprint = fingerprint
        self._execution = None
        self._input_names: frozenset[str] | None = None
        self._lock = threading.Lock()

    def _definition(self) -> Definition:
        capture = Capture(self.path)
        definition = Definitions(capture).get(self.path, self.function)
        if self.fingerprint is not None and definition.fingerprint != self.fingerprint:
            raise SourceError(
                "STALE_BINDINGS",
                "Run cso bindings to refresh the changed public interface",
            )
        return definition

    @property
    def __signature__(self) -> inspect.Signature:
        definition = self._definition()
        return inspect.Signature(
            [
                inspect.Parameter(
                    name,
                    inspect.Parameter.KEYWORD_ONLY,
                    default=spec.default_value
                    if spec.default is not None
                    else inspect.Parameter.empty,
                    annotation=int if spec.documented.numeric_type == "int" else float,
                )
                for name, spec in definition.parameters.items()
            ],
            return_annotation=CalculationResults,
        )

    def __call__(self, **inputs: float) -> CalculationResults:
        from .execution import ACTIVE, Execution, invoke

        frame = sys._getframe(1)
        if ACTIVE.get() is not None or frame.f_code.co_filename.endswith(".cso.py"):
            return invoke(
                str(self.path), function=self.function, inputs=inputs, frame=frame
            )
        input_names = frozenset(inputs)
        with self._lock:
            engine = self._execution
            if (
                engine is None
                or input_names != self._input_names
                or not engine.unchanged()
            ):
                self._execution = None
                self._input_names = None
                engine = Execution(self.path, self.function, inputs)
                definition = engine.planner.definitions.get(self.path, self.function)
                if (
                    self.fingerprint is not None
                    and definition.fingerprint != self.fingerprint
                ):
                    raise SourceError(
                        "STALE_BINDINGS",
                        "Run cso bindings to refresh the changed public interface",
                    )
                self._execution = engine
                self._input_names = input_names
            try:
                return engine.run_root(inputs)
            except BaseException:
                self._execution = None
                self._input_names = None
                raise


def load_calculation(
    path: str, *, function: str, fingerprint: str | None = None
) -> CalculationHandle:
    """Bind a local calculation; loading does not execute its authored function."""
    if (
        Path(path).is_absolute()
        or not path.endswith(".cso.py")
        or not function.isidentifier()
    ):
        raise SourceError(
            "INVALID_CALL", "Use a relative .cso.py path and named function"
        )
    caller = Path(sys._getframe(1).f_code.co_filename).resolve()
    return CalculationHandle((caller.parent / path).absolute(), function, fingerprint)
