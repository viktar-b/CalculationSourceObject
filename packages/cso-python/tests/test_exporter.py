from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import unittest
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from tempfile import NamedTemporaryFile
from textwrap import dedent, indent


def run_exporter_for_source(
    source: Path,
    function_name: str,
    *args: str,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            "-m",
            "cso_python",
            "export",
            str(source),
            "--function",
            function_name,
            *args,
        ],
        check=False,
        cwd=source.parent,
        text=True,
        capture_output=True,
    )


def run_exporter(*args: str) -> subprocess.CompletedProcess[str]:
    with temporary_annotated_source("""
        from typing import Annotated
        from cso_python import calculation, section, given, symbol
        @calculation(id="input", title="Input echo")
        @section(title="Input", root=True)
        def calculate(width: float):
            quantity: Annotated[float, symbol(glyph="Q_{in}", description="Input quantity", unit="mm")] = given(width)
            return {"quantity": quantity}
    """) as source:
        return run_exporter_for_source(source, "calculate", *args)


@contextmanager
def temporary_annotated_source(source_text: str) -> Iterator[Path]:
    path: Path | None = None

    try:
        with NamedTemporaryFile(
            "w",
            encoding="utf-8",
            prefix="_tmp_exporter_",
            suffix=".cso.py",
            delete=False,
        ) as source_file:
            path = Path(source_file.name)
            source_file.write(dedent(source_text))

        yield path
    finally:
        if path is not None:
            path.unlink(missing_ok=True)


def function_body(source_text: str) -> str:
    return indent(dedent(source_text).strip(), "    ")


def derived_root_key_for_source(
    source_id: str,
    function_name: str,
    variable_name: str,
) -> str:
    digest = hashlib.sha1(
        f"{source_id}:{function_name}:{variable_name}:root".encode()
    ).hexdigest()
    return f"root{digest[:8]}"


def visible_symbols(document: dict[str, object]) -> list[dict[str, object]]:
    sections = document["sections"]
    assert isinstance(sections, list)

    symbols: list[dict[str, object]] = []

    for section in sections:
        assert isinstance(section, dict)
        items = section["items"]
        assert isinstance(items, list)

        for item in items:
            assert isinstance(item, dict)

            if item["kind"] == "symbol":
                symbol = item["symbol"]
                assert isinstance(symbol, dict)
                symbols.append(symbol)

    return symbols


class AnnotatedPythonExporterTest(unittest.TestCase):
    def test_surfaces_missing_python_function_input(self) -> None:
        result = run_exporter()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("width", result.stderr)

    def test_rejects_missing_return_dictionary_key(self) -> None:
        with temporary_annotated_source(
            """
            from __future__ import annotations

            from typing import Annotated

            from cso_python import calculation, given, section, symbol


            @calculation(id="wswtest", title="Mismatch")
            @section(title="Mismatch", root=True)
            def calculate(x: float):
                a: Annotated[float, symbol(glyph="a", description="A", unit="mm")] = given(x)
                b: Annotated[float, symbol(glyph="b", description="B", unit="mm")] = a * 2

                return {"a": a}
            """
        ) as source:
            result = run_exporter_for_source(source, "calculate", "--input", "x=4")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "Return dictionary keys must match annotated symbol assignments",
            result.stderr,
        )
        self.assertIn("missing: b", result.stderr)

    def test_rejects_extra_return_dictionary_key(self) -> None:
        with temporary_annotated_source(
            """
            from __future__ import annotations

            from typing import Annotated

            from cso_python import calculation, given, section, symbol


            @calculation(id="wswtest", title="Mismatch")
            @section(title="Mismatch", root=True)
            def calculate(x: float):
                a: Annotated[float, symbol(glyph="a", description="A", unit="mm")] = given(x)

                return {"a": a, "extra": 1}
            """
        ) as source:
            result = run_exporter_for_source(source, "calculate", "--input", "x=4")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("extra: extra", result.stderr)

    def test_rejects_return_dictionary_key_order_drift(self) -> None:
        with temporary_annotated_source(
            """
            from __future__ import annotations

            from typing import Annotated

            from cso_python import calculation, given, section, symbol


            @calculation(id="wswtest", title="Mismatch")
            @section(title="Mismatch", root=True)
            def calculate(x: float):
                a: Annotated[float, symbol(glyph="a", description="A", unit="mm")] = given(x)
                b: Annotated[float, symbol(glyph="b", description="B", unit="mm")] = a * 2

                return {"b": b, "a": a}
            """
        ) as source:
            result = run_exporter_for_source(source, "calculate", "--input", "x=4")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("order differs", result.stderr)

    def test_rejects_unsupported_python_constructs_clearly(self) -> None:
        cases = {
            "if statements": """
                if x > 0:
                    x = x

                a: Annotated[float, symbol(glyph="a", description="A", unit="mm")] = given(x)
                return {"a": a}
            """,
            "loops": """
                for _ in range(1):
                    x = x

                a: Annotated[float, symbol(glyph="a", description="A", unit="mm")] = given(x)
                return {"a": a}
            """,
            "comprehensions": """
                a: Annotated[float, symbol(glyph="a", description="A", unit="mm")] = given(x)
                b: Annotated[list, symbol(glyph="b", description="B", unit="mm")] = [a for a in [x]]
                return {"a": a, "b": b}
            """,
            "Unsupported function call 'custom(...)'": """
                a: Annotated[float, symbol(glyph="a", description="A", unit="mm")] = given(x)
                b: Annotated[float, symbol(glyph="b", description="B", unit="mm")] = custom(a)
                return {"a": a, "b": b}
            """,
        }

        for expected_error, body_source in cases.items():
            with self.subTest(expected_error=expected_error):
                source_text = (
                    dedent(
                        """
                    from __future__ import annotations

                    from typing import Annotated

                    from cso_python import calculation, given, section, symbol


                    def custom(value: float) -> float:
                        return value


                    @calculation(id="wswtest", title="Unsupported")
                    @section(title="Unsupported", root=True)
                    def calculate(x: float):
                    """
                    )
                    + function_body(body_source)
                    + "\n"
                )

                with temporary_annotated_source(source_text) as source:
                    result = run_exporter_for_source(
                        source,
                        "calculate",
                        "--input",
                        "x=4",
                    )

                self.assertNotEqual(result.returncode, 0)
                self.assertIn(expected_error, result.stderr)
                self.assertIn("straight_line_formula", result.stderr)

    def test_exports_documented_result_escape_hatch_as_literal_result(self) -> None:
        with temporary_annotated_source(
            """
            from __future__ import annotations

            from typing import Annotated

            from cso_python import (
                calculation,
                documented_result,
                given,
                section,
                symbol,
            )


            def custom(value: float) -> float:
                return value * 3


            @calculation(id="wswtest", title="Escape Hatch")
            @section(title="Escape Hatch", root=True)
            def calculate(x: float):
                a: Annotated[float, symbol(glyph="a", description="A", unit="mm")] = given(x)
                b: Annotated[
                    float,
                    symbol(
                        glyph="b",
                        description="B",
                        unit="mm",
                        comment="Calculated by a documented complex routine.",
                    ),
                ] = documented_result(custom(a))

                return {"a": a, "b": b}
            """
        ) as source:
            result = run_exporter_for_source(source, "calculate", "--input", "x=4")

        if result.returncode != 0:
            raise AssertionError(result.stderr)

        document = json.loads(result.stdout)
        symbols = visible_symbols(document)
        escaped_symbol = next(symbol for symbol in symbols if symbol["glyph"] == "b")

        self.assertEqual(
            document["source"]["metadata"]["annotatedPython"],
            {"fidelityLevel": "straight_line_formula"},
        )
        self.assertEqual(
            escaped_symbol["comment"], "Calculated by a documented complex routine."
        )
        self.assertEqual(
            escaped_symbol["valueTree"]["result"],
            {"kind": "number", "value": 12.0},
        )
        self.assertEqual(
            escaped_symbol["valueTree"]["nodes"],
            [
                {
                    "key": derived_root_key_for_source(
                        "wswtest",
                        "calculate",
                        "b",
                    ),
                    "mode": "LITERAL",
                    "draft": "12",
                    "literal": {"kind": "number", "value": 12.0},
                    "result": {"kind": "number", "value": 12.0},
                    "metadata": {
                        "annotatedPython": {
                            "fidelityLevel": "documented_result_escape_hatch",
                            "escapeHatch": "documented_result",
                        },
                    },
                },
            ],
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
