from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class DescribeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="cso-describe-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        fixtures = Path(__file__).parent / "fixtures/authoring-api"
        for name in ("metadata.py", "defaulted_step.cso.py"):
            shutil.copy(fixtures / name, self.root / name)
        self.source = self.root / "defaulted_step.cso.py"

    def run_describe(
        self, source: Path | None = None, function: str = "adjust"
    ) -> tuple[subprocess.CompletedProcess[str], dict]:
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "cso_python",
                "describe",
                str(source or self.source),
                "--function",
                function,
            ],
            cwd=self.root,
            text=True,
            capture_output=True,
            check=False,
        )
        return result, json.loads(result.stdout)

    def test_describes_composed_interface_without_executing_calculation(self) -> None:
        self.source.write_text(
            self.source.read_text().replace("amount + increment", "amount / 0")
        )
        fixtures = Path(__file__).parent / "fixtures/authoring-api"
        parent = self.root / "forwarded_output.cso.py"
        parent.write_text(
            (fixtures / parent.name)
            .read_text()
            .replace(
                "from _cso_bindings.defaulted_step import adjust",
                'from cso_python import load_calculation\nadjust = load_calculation("defaulted_step.cso.py", function="adjust")',
            )
            .replace(
                'return {"total": total}',
                'return {"adjusted": first["adjusted"], "original": first["original"]}',
            )
            .replace("increment: Increment = 3", "increment: Increment = 1e100")
        )

        result, response = self.run_describe(parent, "forward")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(response["diagnostics"], [])
        definition = response["definition"]
        self.assertEqual(
            definition["inputs"],
            [
                {
                    "name": "amount",
                    "numericType": "float",
                    "glyph": "Q",
                    "description": "Amount",
                    "unit": "m",
                    "default": 2,
                },
                {
                    "name": "increment",
                    "numericType": "float",
                    "glyph": "D",
                    "description": "Increment",
                    "unit": "m",
                    "default": 1e100,
                },
            ],
        )
        self.assertEqual(
            definition["outputs"],
            [
                {
                    "name": "adjusted",
                    "numericType": "float",
                    "glyph": "R",
                    "description": "Adjusted amount",
                    "unit": "m",
                },
                {
                    "name": "original",
                    "numericType": "float",
                    "glyph": "Q",
                    "description": "Amount",
                    "unit": "m",
                },
            ],
        )
        self.assertEqual(
            [item["moduleId"] for item in definition["sourceManifest"]],
            ["defaulted_step.cso.py", "forwarded_output.cso.py", "metadata.py"],
        )
        self.assertEqual(definition["entryModuleId"], "forwarded_output.cso.py")
        self.assertEqual(
            definition["entrySourceHash"],
            next(
                item["sha256"]
                for item in definition["sourceManifest"]
                if item["moduleId"] == definition["entryModuleId"]
            ),
        )

    def test_legacy_given_keeps_declared_input_type(self) -> None:
        self.source.write_text("""from typing import Annotated
from cso_python import calculation, given, section, symbol

@calculation(id="legacy", title="Legacy")
@section(title="Legacy", root=True)
def adjust(amount: float = 1.5):
    supplied: Annotated[int, symbol(glyph="Q", description="Amount", unit="m")] = given(amount)
    return {"supplied": supplied}
""")

        result, response = self.run_describe()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            response["definition"]["inputs"],
            [
                {
                    "name": "amount",
                    "numericType": "float",
                    "glyph": "Q",
                    "description": "Amount",
                    "unit": "m",
                    "default": 1.5,
                }
            ],
        )

    def test_reports_static_definition_failures(self) -> None:
        original = self.source.read_text()
        cases = [
            ("def adjust(:", "adjust", "INVALID_SOURCE"),
            (original, "missing", "MISSING_FUNCTION"),
            (original.replace("amount: Amount", "amount: float"), "adjust", "MISSING_METADATA"),
            (
                original.replace(
                    "increment: Increment = 3",
                    'increment: Annotated[int, symbol(glyph="D", description="Increment", unit="m")] = 1.5',
                ),
                "adjust",
                "DEFAULT_TYPE_MISMATCH",
            ),
            (
                original.replace(
                    "increment: Increment = 3",
                    "increment: Increment = 9007199254740993",
                ),
                "adjust",
                "UNSUPPORTED_NUMERIC_RANGE",
            ),
        ]
        for source, function, code in cases:
            with self.subTest(code=code):
                self.source.write_text(source)
                result, response = self.run_describe(function=function)
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertFalse(response["ok"])
                self.assertEqual(response["diagnostics"][0]["code"], code)


if __name__ == "__main__":
    unittest.main()
