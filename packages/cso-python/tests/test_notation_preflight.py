"""Notation errors must stop a calculation before authored Python executes."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cso_python.execution import Execution, execute


class NotationPreflightTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="cso-notation-test-")
        self.source = Path(self.temp.name) / "notation.cso.py"

    def tearDown(self):
        self.temp.cleanup()

    def write_source(self, *, glyph: str, unit: str) -> None:
        self.source.write_text(
            "from typing import Annotated\n"
            "from cso_python import CalculationResults, calculation, section, symbol\n"
            "\n"
            '@calculation(id="notation", title="Notation")\n'
            '@section(id="notation", title="Notation", root=True)\n'
            "def calculate(\n"
            "    quantity: Annotated[\n"
            "        float,\n"
            f"        symbol(glyph={glyph!r}, description=\"Quantity\", unit={unit!r}),\n"
            "    ] = 2,\n"
            ") -> CalculationResults:\n"
            '    return {"quantity": quantity}\n'
        )

    def test_invalid_glyph_and_nonempty_unit_fail_with_symbol_context(self):
        for field, glyph, unit, notation_code in (
            ("glyph", "{a", "m", "UNCLOSED_GROUP"),
            ("unit", "Q", "{a", "UNCLOSED_GROUP"),
            ("unit", "Q", " \t", "EMPTY_EXPRESSION"),
        ):
            with self.subTest(field=field, value=glyph if field == "glyph" else unit):
                self.write_source(glyph=glyph, unit=unit)
                with patch.object(Execution, "run") as run:
                    result = execute(self.source, "calculate", {})
                self.assertFalse(result["ok"], result)
                diagnostic = result["diagnostics"][0]
                self.assertEqual(diagnostic["code"], "INVALID_NOTATION")
                self.assertEqual(diagnostic["symbolId"], '["symbol","root","quantity"]')
                self.assertIn(f"Invalid {field} notation", diagnostic["message"])
                self.assertIn(notation_code, diagnostic["message"])
                self.assertEqual(diagnostic["location"]["moduleId"], "notation.cso.py")
                self.assertEqual(diagnostic["location"]["start"]["line"], 7)
                self.assertEqual(
                    set(diagnostic),
                    {"code", "message", "stage", "symbolId", "location", "callChain"},
                )
                run.assert_not_called()

    def test_empty_unit_is_absent_for_validation(self):
        self.write_source(glyph="Q", unit="")
        result = execute(self.source, "calculate", {})
        self.assertTrue(result["ok"], result)
        symbol = result["execution"]["cso"]["sections"][0]["items"][0]["symbol"]
        self.assertEqual(symbol["unit"], "")

    def test_forwarded_child_metadata_is_validated_before_unit_matching(self):
        child = Path(self.temp.name) / "child.cso.py"
        self.source.write_text(
            "from typing import Annotated\n"
            "from cso_python import CalculationResults, calculation, calculation_call, "
            "section, symbol\n"
            "\n"
            '@calculation(id="parent", title="Parent")\n'
            '@section(id="parent", title="Parent", root=True)\n'
            "def calculate(\n"
            "    quantity: Annotated[\n"
            "        float,\n"
            '        symbol(glyph="Q", description="Quantity", unit="m"),\n'
            "    ] = 2,\n"
            ") -> CalculationResults:\n"
            '    result = calculation_call("child.cso.py", function="calculate", '
            'inputs={"quantity": quantity})\n'
            '    return {"quantity": result["quantity"]}\n'
        )
        for field, glyph, unit in (
            ("glyph", "{q", "m"),
            ("unit", "Q", "{m"),
        ):
            with self.subTest(field=field):
                child.write_text(
                    "from typing import Annotated\n"
                    "from cso_python import CalculationResults, calculation, section, symbol\n"
                    "\n"
                    '@calculation(id="child", title="Child")\n'
                    '@section(id="child", title="Child")\n'
                    "def calculate(\n"
                    "    quantity: Annotated[\n"
                    "        float,\n"
                    f"        symbol(glyph={glyph!r}, description=\"Quantity\", unit={unit!r}),\n"
                    "    ],\n"
                    ") -> CalculationResults:\n"
                    '    return {"quantity": quantity}\n'
                )
                with patch.object(Execution, "run") as run:
                    result = execute(self.source, "calculate", {})
                self.assertFalse(result["ok"], result)
                diagnostic = result["diagnostics"][0]
                self.assertEqual(diagnostic["code"], "INVALID_NOTATION")
                self.assertEqual(
                    diagnostic["symbolId"], '["symbol","root/result","quantity"]'
                )
                self.assertIn(f"Invalid {field} notation", diagnostic["message"])
                self.assertEqual(diagnostic["location"]["moduleId"], "child.cso.py")
                run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
