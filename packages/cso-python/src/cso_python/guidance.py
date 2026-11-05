"""Read authoring guidance from the installed distribution, without a checkout."""
from __future__ import annotations

import argparse
from importlib.metadata import version
from importlib.resources import files
from pathlib import Path
import sys


def authoring_from_argv(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m cso_python authoring",
        description="Read the authoring contract matching this installed cs-object version.",
    )
    parser.add_argument("--out", type=Path, help="Write UTF-8/LF Markdown instead of stdout.")
    args = parser.parse_args(argv)
    content = (
        f"<!-- Generated from cs-object {version('cs-object')}; do not edit this copy. -->\n\n"
        + files("cso_python").joinpath("authoring.md").read_text(encoding="utf-8")
    )
    if args.out is None:
        sys.stdout.write(content)
    else:
        try:
            args.out.write_text(content, encoding="utf-8", newline="\n")
        except OSError as error:
            parser.exit(1, f"error: {error}\n")
    return 0
