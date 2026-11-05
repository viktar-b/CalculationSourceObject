"""Boolean report values stay distinct from numerical quantities and verdicts."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from cso_python.bindings import generate
from cso_python.execution import Execution, execute
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

    def assert_unplaced_before_execution(self, source, function, inputs=None):
        with (
            patch.object(Execution, "run", side_effect=AssertionError("Authored execution started")) as authored,
            patch.object(Execution, "run_external", side_effect=AssertionError("External execution started")) as external,
        ):
            response = execute(source, function, inputs or {})
        self.assertFalse(response["ok"], response)
        self.assertEqual(response["diagnostics"][0]["code"], "BOOLEAN_REQUIRES_TABLE")
        self.assertIn("grouped comparison case", response["diagnostics"][0]["message"])
        self.assertIn("location", response["diagnostics"][0])
        authored.assert_not_called()
        external.assert_not_called()
        return response

    def test_standalone_boolean_facts_are_rejected_before_execution_and_export(self):
        self.assert_unplaced_before_execution(self.root / "case.cso.py", "case", {"width": 2})
        with self.assertRaisesRegex(ExportError, "grouped comparison case"):
            convert_annotated_python(self.root / "case.cso.py", function_name="case", inputs={"width": 2})

    def write_wrapper(self):
        (self.root / "wrapper.cso.py").write_text('''from typing import Annotated, TypeAlias
from cso_python import calculation, section, symbol
from _cso_bindings.case import case
Width: TypeAlias = Annotated[float, symbol(glyph="w_{wrapper}", description="Width", unit="m")]
@calculation(id="wrapper", title="Wrapper")
@section(title="Wrapper", root=True)
def wrapper(width: Width):
    child = case(width=width)
    return {"result": child["result"]}
''')
        generate(self.root)

    def test_ordinary_wrapper_does_not_silently_drop_imported_boolean_facts(self):
        self.write_wrapper()
        response = self.assert_unplaced_before_execution(self.root / "wrapper.cso.py", "wrapper", {"width": 2})
        self.assertEqual(len(response["diagnostics"][0]["callChain"]), 1)

    def test_extra_ungrouped_call_is_rejected_even_when_its_function_has_a_table(self):
        for position in ("before", "after"):
            with self.subTest(position=position):
                source = COMPARE.replace("SELECTION", "")
                anchor = '    table(' if position == "before" else '    return '
                source = source.replace(anchor, '    spare = case(width=3)\n' + anchor)
                (self.root / "compare.cso.py").write_text(source)
                generate(self.root)
                response = self.assert_unplaced_before_execution(self.root / "compare.cso.py", "compare")
                self.assertEqual(response["diagnostics"][0]["location"]["moduleId"], "case.cso.py")

    def test_grouped_nested_boolean_helpers_remain_supported_and_protocol_gated(self):
        self.write_wrapper()
        source = COMPARE.replace("SELECTION", "").replace(
            "from _cso_bindings.case import case", "from _cso_bindings.wrapper import wrapper as case"
        )
        (self.root / "compare.cso.py").write_text(source)
        generate(self.root)
        response = execute(self.root / "compare.cso.py", "compare", {})
        self.assertTrue(response["ok"], response)
        self.assertEqual(response["protocolVersion"], "5")
        self.assertEqual(len(response["execution"]["booleanOutcomes"]), 8)
        with (
            patch.object(Execution, "run", side_effect=AssertionError("Authored execution started")) as authored,
            patch.object(Execution, "run_external", side_effect=AssertionError("External execution started")) as external,
        ):
            response = execute(self.root / "compare.cso.py", "compare", {}, supports_booleans=False)
        self.assertFalse(response["ok"], response)
        self.assertEqual(response["diagnostics"][0]["code"], "INCOMPATIBLE_CONTRACT")
        authored.assert_not_called()
        external.assert_not_called()

    def test_boolean_guards_precede_external_adapter_execution(self):
        self.write_wrapper()
        marker = self.root / "adapter-ran.txt"
        (self.root / "metadata.py").write_text('''from typing import Annotated, TypeAlias
from cso_python import external_function, symbol
Width: TypeAlias = Annotated[float, symbol(glyph="w_{adapter}", description="Width", unit="m")]
identity = external_function(path="adapter.py", function="identity", inputs={"width": Width}, outputs={"width": Width}, description="Retain the supplied width.")
''')
        (self.root / "adapter.py").write_text(
            f"from pathlib import Path\nPath({str(marker)!r}).write_text('imported')\ndef identity(*, width):\n    return width\n"
        )
        wrapper = (self.root / "wrapper.cso.py").read_text().replace(
            "from _cso_bindings.case import case",
            "from _cso_bindings.case import case\nfrom _cso_bindings._external.metadata import identity",
        ).replace(
            "    child = case(width=width)",
            '    supplied = identity(width=width)\n    child = case(width=supplied["width"])',
        )
        (self.root / "wrapper.cso.py").write_text(wrapper)
        generate(self.root)
        self.assertFalse(marker.exists())
        self.assert_unplaced_before_execution(self.root / "wrapper.cso.py", "wrapper", {"width": 2})
        self.assertFalse(marker.exists())
        source = COMPARE.replace("SELECTION", "").replace(
            "from _cso_bindings.case import case", "from _cso_bindings.wrapper import wrapper as case"
        )
        (self.root / "compare.cso.py").write_text(source)
        generate(self.root)
        response = execute(self.root / "compare.cso.py", "compare", {}, supports_booleans=False)
        self.assertFalse(response["ok"], response)
        self.assertEqual(response["diagnostics"][0]["code"], "INCOMPATIBLE_CONTRACT")
        self.assertFalse(marker.exists())
        response = execute(self.root / "compare.cso.py", "compare", {})
        self.assertTrue(response["ok"], response)
        self.assertEqual(response["protocolVersion"], "5")
        self.assertTrue(marker.exists())

    def test_static_empty_comparison_preserves_its_boolean_method(self):
        source = COMPARE.replace("SELECTION", "").replace(
            '    first = case(width=0)\n    second = case(width=2.0)\n', ""
        ).replace('{"Zero": first, "Positive": second}', "{}").replace(
            '    return {"result": first["result"]}', '    return {}'
        )
        # Public output declarations remain required, independently of empty cases.
        source = source.replace('    return {}', '    ready: Annotated[int, symbol(glyph="n_{ready}", description="Ready", unit="")] = 0\n    return {"ready": ready}').replace(
            'from cso_python import calculation, section, method, table',
            'from typing import Annotated\nfrom cso_python import calculation, section, method, table, symbol',
        )
        (self.root / "compare.cso.py").write_text(source)
        generate(self.root)
        response = execute(self.root / "compare.cso.py", "compare", {})
        self.assertTrue(response["ok"], response)
        self.assertEqual(response["protocolVersion"], "5")
        self.assertNotIn("booleanOutcomes", response["execution"])
        self.assertEqual(len(response["execution"]["methods"][0]["booleans"]), 4)
