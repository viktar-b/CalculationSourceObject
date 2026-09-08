from __future__ import annotations

import json
import subprocess
import sys
import unittest

from test_exporter import (
    run_exporter,
    run_exporter_for_source,
    temporary_annotated_source,
)


class ExportCliTest(unittest.TestCase):
    def test_module_and_export_help(self) -> None:
        for args in (["--help"], ["export", "--help"]):
            with self.subTest(args=args):
                result = subprocess.run(
                    [sys.executable, "-m", "cso_python", *args],
                    text=True,
                    capture_output=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("verif", result.stdout)
                self.assertEqual(result.stderr, "")

    def test_preserves_input_error_behavior(self) -> None:
        cases = [
            (
                ["--input", "width=50", "--input", "width=25"],
                1,
                "more than once",
            ),
            (
                ["--inputs-json", '{"width":50}', "--input", "width=25"],
                1,
                "more than once",
            ),
            (["--input", "width=50", "--input", "unknown=2"], 1, "unknown"),
            (["--input", "side-length=50"], 2, "valid Python parameter"),
            (["--input", "width=NaN"], 2, "finite"),
            (["--inputs-json", "[]"], 2, "JSON object"),
        ]
        for args, code, message in cases:
            with self.subTest(args=args):
                result = run_exporter(*args)
                self.assertEqual(result.returncode, code, result.stderr)
                self.assertEqual(result.stdout, "")
                self.assertIn(message, result.stderr)

    def test_routes_authored_prints_to_stderr(self) -> None:
        with temporary_annotated_source("""
            from __future__ import annotations
            from typing import Annotated
            import os
            import sys
            from cso_python import calculation, given, section, symbol
            print("module loaded")

            @calculation(id="printed", title="Printed")
            @section(title="Printed", root=True)
            def calculate(x: float):
                print("function called")
                os.write(1, b"raw output\\n")
                sys.__stdout__.write("buffered output\\n")
                a: Annotated[float, symbol(glyph="a", description="A", unit="mm")] = given(x)
                return {"a": a}
        """) as source:
            result = run_exporter_for_source(source, "calculate", "--input", "x=4")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["title"], "Printed")
        self.assertEqual(
            result.stderr.splitlines(),
            ["module loaded", "function called", "raw output", "buffered output"],
        )

    def test_missing_file_is_an_export_failure(self) -> None:
        with temporary_annotated_source("") as source:
            source.unlink()
            result = run_exporter_for_source(source, "calculate")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")
        self.assertIn("error:", result.stderr)

    def test_syntax_error_is_an_export_failure(self) -> None:
        with temporary_annotated_source("def calculate(:") as source:
            result = run_exporter_for_source(source, "calculate")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")
        self.assertIn("syntax", result.stderr)
