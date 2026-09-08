from __future__ import annotations

import argparse
import sys

from .exporter import add_export_arguments, export_from_args


def main(argv: list[str] | None = None) -> int:
    arguments = sys.argv[1:] if argv is None else argv
    if arguments and arguments[0] == "bindings":
        from .bindings import bindings_from_argv
        return bindings_from_argv(arguments[1:])
    if arguments and arguments[0] == "execute":
        from .execution import execute_from_argv

        return execute_from_argv(arguments[1:])
    parser = argparse.ArgumentParser(
        prog="python -m cso_python",
        description="Author and export constrained Python calculations. Export is not numerical verification.",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    export = commands.add_parser(
        "export",
        help="Export CalculationSourceObject JSON without numerical verification.",
        description="Export formulas and runtime results as CSO JSON; does not independently verify formulas.",
    )
    commands.add_parser(
        "execute",
        help="Capture source and emit execution evidence for core verification.",
    )
    commands.add_parser("bindings", help="Generate typed calculation handles")
    add_export_arguments(export)
    return export_from_args(parser.parse_args(argv))


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
