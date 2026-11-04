"""Boolean report values stay distinct from numerical quantities and verdicts."""
from pathlib import Path
import tempfile
import unittest

from cso_python.bindings import generate
from cso_python.execution import execute
from cso_python.exporter import ExportError, convert_annotated_python

CASE = '''from typing import Annotated, TypeAlias
from cso_python import calculation, section, symbol, boolean
Width: TypeAlias = Annotated[float, symbol(glyph="w_{case}", description="Case width", unit="m")]
@calculation(id="case", title="Case")
@section(title="Case", root=True)
def case(width: Width):
    result: Annotated[float, symbol(glyph="r_{case}", description="Case result", unit="m")] = width + 0
    boolean(id="positive", description="Positive width", predicate=width > 0)
    boolean(id="false-flag", description="False flag", predicate=False)
    boolean(id="true-flag", description="True flag", predicate=True)
    boolean(id="lazy", description="Positive reciprocal", predicate=width == 0 or 1 / width > 0)
    return {"result": result}
'''
COMPARE = '''from cso_python import calculation, section, method, table
from _cso_bindings.case import case
@calculation(id="compare", title="Compare")
@section(title="Compare", root=True)
def compare():
    method(id="case", calculation=case, title="Case method")
    first = case(width=0)
    second = case(width=2.0)
    table(id="cases", method="case", title="Cases", cases={"Zero": first, "Positive": second}SELECTION)
    return {"result": first["result"]}
'''

class BooleanTableTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="cso-boolean-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / "case.cso.py").write_text(CASE)

    def capture(self, selection=""):
        (self.root / "compare.cso.py").write_text(COMPARE.replace("SELECTION", selection))
        generate(self.root)
        return execute(self.root / "compare.cso.py", "compare", {})

    def test_native_false_true_comparisons_and_zero_retain_their_types(self):
        response = self.capture()
        self.assertTrue(response["ok"], response)
        self.assertEqual(response["protocolVersion"], "5")
        execution = response["execution"]
        self.assertEqual(execution["cso"]["schemaVersion"], "1.3.0")
        values = {(item["invocationId"], item["booleanId"]): item for item in execution["booleanOutcomes"]}
        self.assertIs(values[("root/first", "positive")]["value"], False)
        self.assertIs(values[("root/second", "positive")]["value"], True)
        self.assertIs(values[("root/first", "false-flag")]["value"], False)
        self.assertIs(values[("root/first", "true-flag")]["value"], True)
        self.assertEqual(values[("root/first", "false-flag")]["usedKeys"], [])
        self.assertIs(values[("root/first", "lazy")]["value"], True)
        self.assertLess(len(values[("root/first", "lazy")]["usedKeys"]), len(values[("root/second", "lazy")]["usedKeys"]))
        output = next(item for item in execution["authoring"]["outputs"] if item["invocationId"] == "root/first")
        self.assertEqual(output["value"], 0)
        self.assertEqual(output["numericKind"], "int")
        self.assertIs(type(output["value"]), int)

    def test_selection_and_empty_selection_only_change_table_rows(self):
        for selection, expected in [((', booleans=("false-flag",)'), ["false-flag"]), (', booleans=()', [])]:
            with self.subTest(selection=selection):
                response = self.capture(selection)
                self.assertTrue(response["ok"], response)
                self.assertEqual(response["execution"]["tables"][0]["booleans"], expected)
                self.assertEqual(len(response["execution"]["booleanOutcomes"]), 8)
                self.assertEqual(len(response["execution"]["methods"][0]["booleans"]), 4)

    def test_unknown_and_duplicate_selection_fail_before_execution(self):
        for selection in [', booleans=("missing",)', ', booleans=("positive", "positive")']:
            with self.subTest(selection=selection):
                response = self.capture(selection)
                self.assertFalse(response["ok"], response)

    def test_older_execution_consumers_reject_boolean_evidence_before_execution(self):
        self.capture()
        response = execute(self.root / "compare.cso.py", "compare", {}, supports_booleans=False)
        self.assertFalse(response["ok"], response)
        self.assertEqual(response["diagnostics"][0]["code"], "INCOMPATIBLE_CONTRACT")

    def test_standalone_export_rejects_boolean_evidence_instead_of_dropping_it(self):
        self.capture()
        with self.assertRaisesRegex(ExportError, "protocol 5"):
            convert_annotated_python(self.root / "compare.cso.py", function_name="compare", inputs={})

    def test_numbers_are_not_implicit_boolean_values(self):
        (self.root / "case.cso.py").write_text(CASE.replace('predicate=False', 'predicate=0'))
        response = self.capture()
        self.assertFalse(response["ok"], response)

    def test_numeric_public_outputs_still_reject_boolean_values(self):
        (self.root / "case.cso.py").write_text(CASE.replace('= width + 0', '= True'))
        response = self.capture()
        self.assertFalse(response["ok"], response)
