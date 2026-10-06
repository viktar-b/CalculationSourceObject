"""Straight-line method and column comparison capture."""

from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from cso_python.bindings import generate
from cso_python.execution import Execution, execute


RECTANGLE = '''from typing import Annotated, TypeAlias
from cso_python import CalculationResults, calculation, section, symbol

Width: TypeAlias = Annotated[float, symbol(glyph="w", description="Width", unit="m")]
Height: TypeAlias = Annotated[float, symbol(glyph="h", description="Height", unit="m")]
Allowance: TypeAlias = Annotated[float, symbol(glyph="c", description="Allowance", unit="m")]

@calculation(id="rectangle", title="Rectangle geometry")
@section(id="geometry", title="Rectangle geometry", root=True)
def rectangle(width: Width, height: Height, allowance: Allowance = 0.0) -> CalculationResults:
    area: Annotated[float, symbol(glyph="A", description="Area", unit="m^2")] = width * height
    perimeter: Annotated[float, symbol(glyph="P", description="Perimeter", unit="m")] = 2 * (width + height)
    return {"area": area, "perimeter": perimeter}
'''


def compare_source(body: str) -> str:
    return f'''from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table
from _cso_bindings.rectangle import rectangle

@calculation(id="compare", title="Rectangle comparison")
@section(id="comparison", title="Comparison", root=True)
def compare() -> CalculationResults:
{body}
    compared: Annotated[float, symbol(glyph="R", description="Compared area", unit="m^2")] = first_panel["area"]
    return {{"compared": compared}}
'''


class MethodTableCaptureTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="cso-method-table-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "rectangle.cso.py").write_text(RECTANGLE)
        generate(self.root)

    def write_compare(self, body: str) -> None:
        (self.root / "compare.cso.py").write_text(compare_source(body))

    def execution(self):
        response = execute(self.root / "compare.cso.py", "compare", {})
        self.assertTrue(response["ok"], response)
        return response

    def test_column_table_binds_equal_areas_without_a_representative_method_case(self):
        self.write_compare(
            '''    method(id="rectangle-method", calculation=rectangle, title="How rectangle results are calculated")
    first_panel = rectangle(width=2.0, height=3.0)
    second_panel = rectangle(width=1.0, height=6.0)
    extra_panel = rectangle(width=4.0, height=5.0)
    table(id="rectangle-results", method="rectangle-method", title="Rectangle comparison", cases={"Case A": first_panel, "Case B": second_panel})
'''
        )
        response = self.execution()
        execution = response["execution"]
        self.assertEqual(response["protocolVersion"], "3")
        self.assertEqual(execution["cso"]["schemaVersion"], "1.1.0")
        self.assertEqual(
            [item["id"] for item in execution["invocations"]],
            ["root", "root/first_panel", "root/second_panel", "root/extra_panel"],
        )
        method = execution["methods"][0]
        self.assertEqual(method["localId"], "rectangle-method")
        self.assertEqual(method["function"], "rectangle")
        self.assertNotIn("resolvedInputs", method)
        self.assertNotIn(3, [node.get("literal", {}).get("value") for quantity in method["quantities"] for node in quantity["nodes"]])
        self.assertEqual(
            [quantity["selectionName"] for quantity in method["quantities"]],
            ["width", "height", "allowance", "area", "perimeter"],
        )
        area = next(quantity for quantity in method["quantities"] if quantity["selectionName"] == "area")
        self.assertEqual(area["glyph"], "A")
        self.assertIn("w", area["formulaText"])
        self.assertIn("h", area["formulaText"])
        table = execution["tables"][0]
        self.assertEqual(table["casesAxis"], "columns")
        self.assertEqual(table["inputs"], ["width", "height", "allowance"])
        self.assertEqual(table["outputs"], ["area", "perimeter"])
        self.assertEqual([case["heading"] for case in table["cases"]], ["Case A", "Case B"])
        self.assertEqual(
            [case["invocationId"] for case in table["cases"]],
            ["root/first_panel", "root/second_panel"],
        )
        areas = [
            output
            for output in execution["authoring"]["outputs"]
            if output["name"] == "area"
        ]
        self.assertEqual(sorted(output["value"] for output in areas), [6, 6, 20])
        perimeters = {
            output["invocationId"]: output["value"]
            for output in execution["authoring"]["outputs"]
            if output["name"] == "perimeter"
        }
        self.assertEqual(perimeters["root/first_panel"], 10)
        self.assertEqual(perimeters["root/second_panel"], 14)
        area_cells = [cell for cell in table["cells"] if cell["quantity"] == "area"]
        self.assertEqual(
            [cell["symbolId"] for cell in area_cells],
            [output["symbolId"] for output in areas if output["invocationId"] != "root/extra_panel"],
        )
        allowance_cells = [cell for cell in table["cells"] if cell["quantity"] == "allowance"]
        self.assertEqual([cell["unit"] for cell in allowance_cells], ["m", "m"])
        root_items = execution["cso"]["sections"][0]["items"]
        kinds = [item["kind"] for item in root_items]
        self.assertLess(kinds.index("method"), kinds.index("table"))
        self.assertEqual(kinds.count("section"), 3)
        modules = {item["moduleId"]: item["sha256"] for item in execution["sourceManifest"]}
        self.assertEqual(modules[method["moduleId"]], method["sourceHash"])

    def test_empty_cases_plan_the_method_without_executing_it(self):
        (self.root / "compare.cso.py").write_text(
            '''from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table
from _cso_bindings.rectangle import rectangle

@calculation(id="compare", title="Rectangle comparison")
@section(id="comparison", title="Comparison", root=True)
def compare() -> CalculationResults:
    method(id="rectangle-method", calculation=rectangle, title="How rectangle results are calculated")
    table(id="rectangle-results", method="rectangle-method", title="Rectangle comparison", cases={})
    ready: Annotated[float, symbol(glyph="r", description="Ready", unit="")] = 1
    return {"ready": ready}
'''
        )
        execution = self.execution()["execution"]
        self.assertEqual([item["function"] for item in execution["invocations"]], ["compare"])
        self.assertEqual(execution["tables"][0]["cases"], [])
        self.assertEqual(execution["tables"][0]["cells"], [])
        self.assertTrue(execution["methods"][0]["quantities"])

    def test_later_slices_are_diagnosed_before_execution(self):
        cases = {
            "rows": (
                '''    method(id="rectangle-method", calculation=rectangle, title="How rectangle results are calculated")
    first_panel = rectangle(width=2.0, height=3.0)
    table(id="rectangle-results", method="rectangle-method", title="Rectangle comparison", cases={"Case A": first_panel}, cases_axis="rows")
''',
                "UNSUPPORTED_TABLE_AXIS",
            ),
            "duplicate heading": (
                '''    method(id="rectangle-method", calculation=rectangle, title="How rectangle results are calculated")
    first_panel = rectangle(width=2.0, height=3.0)
    second_panel = rectangle(width=1.0, height=6.0)
    table(id="rectangle-results", method="rectangle-method", title="Rectangle comparison", cases={"Case A": first_panel, "Case A": second_panel})
''',
                "DUPLICATE_CASE_HEADING",
            ),
            "forward reference": (
                '''    method(id="rectangle-method", calculation=rectangle, title="How rectangle results are calculated")
    table(id="rectangle-results", method="rectangle-method", title="Rectangle comparison", cases={"Case A": first_panel})
    first_panel = rectangle(width=2.0, height=3.0)
''',
                "AMBIGUOUS_CASE_REFERENCE",
            ),
            "duplicate id": (
                '''    method(id="rectangle-method", calculation=rectangle, title="How rectangle results are calculated")
    method(id="rectangle-method", calculation=rectangle, title="Repeated method")
    first_panel = rectangle(width=2.0, height=3.0)
''',
                "DUPLICATE_IDENTITY",
            ),
        }
        for name, (body, code) in cases.items():
            with self.subTest(name=name):
                self.write_compare(body)
                with patch.object(Execution, "run") as run:
                    response = execute(self.root / "compare.cso.py", "compare", {})
                    self.assertFalse(response["ok"], response)
                    self.assertEqual(response["diagnostics"][0]["code"], code, response)
                    run.assert_not_called()

    def test_explicit_empty_selection_and_unknown_names(self):
        self.write_compare(
            '''    method(id="rectangle-method", calculation=rectangle, title="How rectangle results are calculated")
    first_panel = rectangle(width=2.0, height=3.0)
    table(id="rectangle-results", method="rectangle-method", title="Rectangle comparison", cases={"Case A": first_panel}, inputs=(), outputs=("perimeter",))
'''
        )
        table = self.execution()["execution"]["tables"][0]
        self.assertEqual(table["inputs"], [])
        self.assertEqual(table["outputs"], ["perimeter"])
        self.assertEqual([cell["quantity"] for cell in table["cells"]], ["perimeter"])
        self.write_compare(
            '''    method(id="rectangle-method", calculation=rectangle, title="How rectangle results are calculated")
    first_panel = rectangle(width=2.0, height=3.0)
    table(id="rectangle-results", method="rectangle-method", title="Rectangle comparison", cases={"Case A": first_panel}, outputs=("area", "area"))
'''
        )
        with patch.object(Execution, "run") as run:
            response = execute(self.root / "compare.cso.py", "compare", {})
            self.assertEqual(response["diagnostics"][0]["code"], "DUPLICATE_QUANTITY")
            run.assert_not_called()
        self.write_compare(
            '''    method(id="rectangle-method", calculation=rectangle, title="How rectangle results are calculated")
    first_panel = rectangle(width=2.0, height=3.0)
    table(id="rectangle-results", method="rectangle-method", title="Rectangle comparison", cases={"Case A": first_panel}, outputs=("missing",))
'''
        )
        with patch.object(Execution, "run") as run:
            response = execute(self.root / "compare.cso.py", "compare", {})
            self.assertEqual(response["diagnostics"][0]["code"], "UNKNOWN_QUANTITY")
            run.assert_not_called()

    def test_method_content_awaiting_later_slices_is_diagnosed(self):
        source = (self.root / "rectangle.cso.py").read_text()
        (self.root / "rectangle.cso.py").write_text(
            source.replace(
                "from cso_python import CalculationResults, calculation, section, symbol",
                "from cso_python import CalculationResults, calculation, section, symbol, text",
            ).replace(
                "    area:",
                '    text(id="note", content="Keep this note")\n    area:',
            )
        )
        (self.root / "compare.cso.py").write_text(
            '''from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table
from _cso_bindings.rectangle import rectangle

@calculation(id="compare", title="Rectangle comparison")
@section(id="comparison", title="Comparison", root=True)
def compare() -> CalculationResults:
    method(id="rectangle-method", calculation=rectangle, title="How rectangle results are calculated")
    ready: Annotated[float, symbol(glyph="r", description="Ready", unit="")] = 1
    return {"ready": ready}
'''
        )
        with patch.object(Execution, "run") as run:
            response = execute(self.root / "compare.cso.py", "compare", {})
            self.assertEqual(response["diagnostics"][0]["code"], "UNSUPPORTED_METHOD_CONTENT")
            run.assert_not_called()

    def test_overlapping_membership_is_rejected(self):
        self.write_compare(
            '''    method(id="rectangle-method", calculation=rectangle, title="How rectangle results are calculated")
    first_panel = rectangle(width=2.0, height=3.0)
    table(id="first-results", method="rectangle-method", title="First", cases={"Case A": first_panel})
    table(id="second-results", method="rectangle-method", title="Second", cases={"Case A again": first_panel})
'''
        )
        with patch.object(Execution, "run") as run:
            response = execute(self.root / "compare.cso.py", "compare", {})
            self.assertEqual(response["diagnostics"][0]["code"], "OVERLAPPING_TABLE")
            run.assert_not_called()
