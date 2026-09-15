from __future__ import annotations

import argparse
import importlib
import json
import shutil
import sys
import tempfile
from math import isclose
from pathlib import Path
from time import perf_counter

from cso_python.bindings import generate


def matches(actual: dict[str, float], expected: dict[str, float]) -> bool:
    return actual.keys() == expected.keys() and all(
        isclose(actual[name], value) for name, value in expected.items()
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Measure repeated calls through a generated two-panel handle."
    )
    parser.add_argument("--calls", type=int, default=1000)
    parser.add_argument("--limit-seconds", type=float, default=1.0)
    args = parser.parse_args()
    if args.calls <= 0:
        parser.error("--calls must be positive")

    repository = Path(__file__).resolve().parents[2]
    canonical = repository / "examples/two-panel"
    with tempfile.TemporaryDirectory(prefix="cso-handle-benchmark-") as temporary:
        source = Path(temporary) / "two-panel"
        shutil.copytree(
            canonical,
            source,
            ignore=shutil.ignore_patterns(
                "pdfs", "README.md", "reference.json", "_cso_bindings", "__pycache__"
            ),
        )
        generate(source)
        sys.path.insert(0, str(source))
        estimate = importlib.import_module("_cso_bindings.estimate").estimate

        width_one = estimate(width=1)
        width_two = estimate(width=2)
        if not matches(width_one, {"area": 7, "volume": 0.7, "mass": 350}):
            raise SystemExit(f"Unexpected width-1 result: {width_one}")
        if not matches(width_two, {"area": 14, "volume": 1.4, "mass": 700}):
            raise SystemExit(f"Unexpected width-2 result: {width_two}")

        started = perf_counter()
        for index in range(args.calls):
            estimate(width=1 + index % 2)
        elapsed = perf_counter() - started

    result = {
        "calls": args.calls,
        "elapsedSeconds": elapsed,
        "limitSeconds": args.limit_seconds,
        "passed": elapsed < args.limit_seconds,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    if not result["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
