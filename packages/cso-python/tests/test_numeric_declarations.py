"""Runtime numeric declarations through capture and calculation handles."""

import json
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

from cso_python.bindings import generate
from cso_python.execution import execute
from cso_python.handles import CalculationHandle
from cso_python.source import SourceError


HEADER = '''\
from typing import Annotated, TypeAlias
from cso_python import calculation, section, symbol, given

Quantity: TypeAlias = Annotated[int, symbol(glyph="Q_{in}", description="Input quantity", unit="")]
FloatQuantity: TypeAlias = Annotated[float, symbol(glyph="Q_{in}", description="Input quantity", unit="")]
Counted: TypeAlias = Annotated[int, symbol(glyph="Q_{out}", description="Counted quantity", unit="")]
Measured: TypeAlias = Annotated[float, symbol(glyph="Q_{meas}", description="Measured quantity", unit="")]
'''


class NumericDeclarationsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="cso-numeric-declarations-")
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def write(
        self, body, *, parameters="quantity: Quantity", name="count.cso.py", imports=""
    ):
        source = self.root / name
        source.write_text(
            HEADER
            + imports
            + '\n@calculation(id="count", title="Count quantity")\n'
            + '@section(id="count", title="Count quantity")\n'
            + f"def calculate({parameters}):\n"
            + textwrap.indent(textwrap.dedent(body).strip(), "    ")
            + "\n"
        )
        return source

    def assert_failure(self, source, value, code, line):
        response = execute(source, "calculate", {"quantity": value})
        self.assertFalse(response["ok"], response)
        self.assertNotIn("execution", response)
        diagnostic = response["diagnostics"][0]
        self.assertEqual(diagnostic["code"], code)
        self.assertEqual(diagnostic["stage"], "execution")
        self.assertEqual(response["provenance"]["resolvedInputs"], {"quantity": value})
        self.assertEqual(diagnostic["location"]["moduleId"], source.name)
        line_index = diagnostic["location"]["start"]["line"] - 1
        actual_line = source.read_text().splitlines()[line_index]
        self.assertIn(line, actual_line)
        with self.assertRaises(SourceError) as raised:
            CalculationHandle(source, "calculate", None)(quantity=value)
        self.assertEqual(raised.exception.diagnostic["code"], code)
        return diagnostic

    def test_integer_assignments_reject_fractional_and_integral_floats(self):
        source = self.write('''
            counted: Counted = quantity / 2
            return {"counted": counted}
        ''')
        self.assertTrue(generate(self.root)["ok"])
        self.assertIn(
            "'counted': int", (self.root / "_cso_bindings/count.pyi").read_text()
        )
        for quantity in (3, 2):
            with self.subTest(quantity=quantity):
                diagnostic = self.assert_failure(
                    source, quantity, "SYMBOL_TYPE_MISMATCH", "counted: Counted"
                )
                self.assertEqual(
                    diagnostic["valueDisplay"],
                    {"kind": "python-float", "text": repr(quantity / 2)},
                )

    def test_hidden_integer_assignments_are_enforced(self):
        source = self.write('''
            counted: Counted = quantity / 2
            return {"original": quantity}
        ''')
        self.assert_failure(source, 3, "SYMBOL_TYPE_MISMATCH", "counted: Counted")

    def test_integer_input_contract_still_rejects_float_values(self):
        source = self.write('return {"original": quantity}')
        for quantity in (1.5, 1.0):
            with self.subTest(quantity=quantity):
                self.assert_failure(
                    source, quantity, "INPUT_TYPE_MISMATCH", "def calculate"
                )

    def test_legacy_public_returns_enforce_the_declared_type_without_correcting_values(self):
        source = self.write('''
            counted: Counted = given(quantity)
            return {"counted": counted / 2}
        ''', parameters="quantity: int")
        for quantity in (3, 2):
            with self.subTest(quantity=quantity):
                self.assert_failure(source, quantity, "OUTPUT_TYPE_MISMATCH", "return")

        source.write_text(source.read_text().replace("counted / 2", "999"))
        response = execute(source, "calculate", {"quantity": 3})
        self.assertTrue(response["ok"], response)
        self.assertEqual(response["execution"]["observations"][0]["value"], 3)
        self.assertEqual(response["execution"]["authoring"]["outputs"][0]["value"], 999)

    def test_float_declarations_accept_ints_and_floats_without_coercion(self):
        source = self.write('''
            measured: Measured = quantity
            return {"measured": measured}
        ''', parameters="quantity: FloatQuantity")
        for quantity in (3, 1.5, 1.0, -0.0):
            with self.subTest(quantity=quantity):
                response = execute(source, "calculate", {"quantity": quantity})
                self.assertTrue(response["ok"], response)
                result = CalculationHandle(source, "calculate", None)(quantity=quantity)
                value = result["measured"]
                self.assertIs(type(value), type(quantity))
                self.assertEqual(repr(value), repr(quantity))

    def test_generated_handles_enforce_child_outputs_and_preserve_valid_integer_types(self):
        child = self.write('''
            counted: Counted = quantity * 2
            return {"counted": counted}
        ''', name="child.cso.py")
        entry = self.write('''
            child = child_count(quantity=quantity)
            return {"counted": child["counted"], "original": quantity}
        ''', name="entry.cso.py",
            imports="from _cso_bindings.child import calculate as child_count\n")
        self.assertTrue(generate(self.root)["ok"])
        response = execute(entry, "calculate", {"quantity": 3})
        self.assertTrue(response["ok"], response)
        command = '''\
from _cso_bindings.entry import calculate
import json
result = calculate(quantity=3)
print(json.dumps({"values": result, "types": {key: type(value).__name__ for key, value in result.items()}}))
'''
        result = subprocess.run(
            [sys.executable, "-c", command],
            cwd=self.root,
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertEqual(
            json.loads(result.stdout),
            {
                "values": {"counted": 6, "original": 3},
                "types": {"counted": "int", "original": "int"},
            },
        )

        child.write_text(child.read_text().replace("quantity * 2", "quantity / 2"))
        self.assertTrue(generate(self.root, check=True)["ok"])
        response = execute(entry, "calculate", {"quantity": 3})
        self.assertFalse(response["ok"], response)
        diagnostic = response["diagnostics"][0]
        self.assertEqual(diagnostic["code"], "SYMBOL_TYPE_MISMATCH")
        self.assertEqual(diagnostic["invocationId"], "root/child")
        self.assertEqual(diagnostic["location"]["moduleId"], child.name)
        self.assertEqual(diagnostic["callChain"][0]["moduleId"], entry.name)
        failed = subprocess.run(
            [sys.executable, "-c", command],
            cwd=self.root,
            text=True,
            capture_output=True,
        )
        self.assertNotEqual(failed.returncode, 0)
        self.assertEqual(failed.stdout, "")
        self.assertIn("declared int", failed.stderr)
