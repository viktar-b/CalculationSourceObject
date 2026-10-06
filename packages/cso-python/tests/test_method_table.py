"""Method and column comparison capture, including nested helpers."""

import base64
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


PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)

MARGIN = '''from typing import Annotated, TypeAlias
from cso_python import CalculationResults, calculation, section, symbol, text

Length: TypeAlias = Annotated[float, symbol(glyph="L", description="Length", unit="m")]

@calculation(id="margin", title="Add a margin")
@section(id="margin-section", title="Margin")
def margin(length: Length) -> CalculationResults:
    """Add one metre of margin."""
    text(id="assumption", content="The margin is one metre.")
    grown: Annotated[float, symbol(glyph="G", description="Grown length", unit="m")] = length + 1.0
    return {"grown": grown}
'''

PANEL = '''from typing import Annotated, TypeAlias
from cso_python import CalculationResults, calculation, document_section, figure, section, symbol, text
from _cso_bindings.margin import margin

Width: TypeAlias = Annotated[float, symbol(glyph="w", description="Width", unit="m")]
Height: TypeAlias = Annotated[float, symbol(glyph="h", description="Height", unit="m")]

@calculation(id="panel", title="Panel area")
@section(id="panel-section", title="Panel")
def panel(width: Width, height: Height) -> CalculationResults:
    """Grow each side, then multiply."""
    with document_section(id="assumptions", title="Assumptions"):
        text(id="note", content="Panel sides are grown independently.")
    figure(id="sketch", path="sketch.png", media_type="image/png", caption="Panel sketch", alt="A rectangle")
    wider = margin(length=width)
    taller = margin(length=height)
    product: Annotated[float, symbol(glyph="Q", description="Grown product", unit="m^2")] = wider["grown"] * taller["grown"]
    area: Annotated[float, symbol(glyph="A", description="Area", unit="m^2")] = product
    return {"area": area}
'''


def content_shape(content: list) -> list:
    shaped = []
    for item in content:
        if item["kind"] == "section":
            shaped.append(("section", item["title"], content_shape(item["content"])))
        elif item["kind"] == "quantity":
            shaped.append(("quantity", item["variableName"]))
        elif item["kind"] == "call":
            shaped.append(("call", item["binding"], item["inputs"], item["outputs"]))
        else:
            shaped.append((item["kind"], item["localId"]))
    return shaped


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
            "invalid axis": (
                '''    method(id="rectangle-method", calculation=rectangle, title="How rectangle results are calculated")
    first_panel = rectangle(width=2.0, height=3.0)
    table(id="rectangle-results", method="rectangle-method", title="Rectangle comparison", cases={"Case A": first_panel}, cases_axis="diagonal")
''',
                "INVALID_METHOD",
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
                "    area:",
                "    with open('x'):\n        pass\n    area:",
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

    def write_composed(self, body: str) -> None:
        (self.root / "sketch.png").write_bytes(PNG)
        (self.root / "margin.cso.py").write_text(MARGIN)
        (self.root / "panel.cso.py").write_text(PANEL)
        (self.root / "compare.cso.py").write_text(
            f'''from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table, text
from _cso_bindings.panel import panel

@calculation(id="compare", title="Panel comparison")
@section(id="comparison", title="Comparison", root=True)
def compare() -> CalculationResults:
{body}
    compared: Annotated[float, symbol(glyph="R", description="Compared area", unit="m^2")] = first_panel["area"]
    return {{"compared": compared}}
'''
        )
        generate(self.root)

    def test_nested_helpers_keep_distinct_call_mappings(self):
        self.write_composed(
            '''    method(id="panel-method", calculation=panel, title="How panel area is calculated")
    text(id="case-a", content="Case A is the narrow panel")
    first_panel = panel(width=2.0, height=3.0)
    text(id="case-b", content="Case B is the wide panel")
    second_panel = panel(width=1.0, height=6.0)
    table(id="panel-results", method="panel-method", title="Panel comparison", cases={"Case A": first_panel, "Case B": second_panel}, inputs=(), outputs=("area",))
    extra_panel = panel(width=4.0, height=5.0)
'''
        )
        execution = self.execution()["execution"]
        method = execution["methods"][0]
        self.assertEqual(
            content_shape(method["content"]),
            [
                ("quantity", "width"),
                ("quantity", "height"),
                ("section", "Assumptions", [("text", "note")]),
                ("figure", "sketch"),
                ("call", "wider", [{"name": "length", "formulaText": "w"}], ["grown"]),
                ("call", "taller", [{"name": "length", "formulaText": "h"}], ["grown"]),
                ("quantity", "product"),
                ("quantity", "area"),
            ],
        )
        self.assertEqual(len(method["helpers"]), 1)
        helper = method["helpers"][0]
        self.assertEqual(helper["function"], "margin")
        self.assertEqual(
            [item["helperId"] for item in method["content"] if item["kind"] == "call"],
            [helper["id"], helper["id"]],
        )
        self.assertEqual(
            content_shape(helper["content"]),
            [
                ("quantity", "length"),
                ("text", "assumption"),
                ("quantity", "grown"),
            ],
        )
        self.assertEqual(helper["content"][1]["content"], "The margin is one metre.")
        product = next(item for item in method["quantities"] if item["variableName"] == "product")
        self.assertEqual(product["formulaText"], "(wider.grown * taller.grown)")
        self.assertEqual(product["role"], "intermediate")
        rendered = str(method["content"])
        self.assertIn("Panel sides are grown independently.", rendered)
        self.assertNotIn("Case A is the narrow panel", rendered)
        self.assertNotIn("The margin is one metre.", rendered)
        table = execution["tables"][0]
        self.assertEqual(table["inputs"], [])
        self.assertEqual(table["outputs"], ["area"])
        parent_text = [
            item["text"]["content"]
            for item in execution["cso"]["sections"][0]["items"]
            if item["kind"] == "text"
        ]
        self.assertEqual(
            parent_text,
            ["Case A is the narrow panel", "Case B is the wide panel"],
        )
        self.assertIn(
            "root/first_panel",
            [section["metadata"].get("invocationId") for section in execution["cso"]["sections"]],
        )
        self.assertIn("root/extra_panel", [item["id"] for item in execution["invocations"]])
        self.assertTrue(any(asset["path"] == "sketch.png" for asset in execution["assets"]))
        self.assertNotIn(
            2,
            [
                node.get("literal", {}).get("value")
                for quantity in method["quantities"]
                for node in quantity["nodes"]
            ],
        )

    def test_empty_method_keeps_helper_explanation_without_executing_it(self):
        (self.root / "sketch.png").write_bytes(PNG)
        (self.root / "margin.cso.py").write_text(MARGIN)
        (self.root / "panel.cso.py").write_text(PANEL)
        (self.root / "compare.cso.py").write_text(
            '''from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table
from _cso_bindings.panel import panel

@calculation(id="compare", title="Panel comparison")
@section(id="comparison", title="Comparison", root=True)
def compare() -> CalculationResults:
    method(id="panel-method", calculation=panel, title="How panel area is calculated")
    table(id="panel-results", method="panel-method", title="Panel comparison", cases={}, outputs=("area",))
    ready: Annotated[float, symbol(glyph="r", description="Ready", unit="")] = 1
    return {"ready": ready}
'''
        )
        generate(self.root)
        execution = self.execution()["execution"]
        self.assertEqual([item["function"] for item in execution["invocations"]], ["compare"])
        method = execution["methods"][0]
        self.assertEqual(method["helpers"][0]["function"], "margin")
        self.assertEqual(
            [item["binding"] for item in method["content"] if item["kind"] == "call"],
            ["wider", "taller"],
        )
        self.assertTrue(any(asset["path"] == "sketch.png" for asset in execution["assets"]))

    def test_disjoint_tables_share_one_method(self):
        self.write_compare(
            '''    method(id="rectangle-method", calculation=rectangle, title="How rectangle results are calculated")
    first_panel = rectangle(width=2.0, height=3.0)
    second_panel = rectangle(width=1.0, height=6.0)
    table(id="left-results", method="rectangle-method", title="Left", cases={"A": first_panel})
    table(id="right-results", method="rectangle-method", title="Right", cases={"B": second_panel})
'''
        )
        execution = self.execution()["execution"]
        self.assertEqual(len(execution["methods"]), 1)
        self.assertEqual(
            [table["methodId"] for table in execution["tables"]],
            [execution["methods"][0]["id"], execution["methods"][0]["id"]],
        )

    def test_inner_table_overlap_is_rejected(self):
        (self.root / "leaf.cso.py").write_text(
            '''from typing import Annotated, TypeAlias
from cso_python import CalculationResults, calculation, section, symbol

Width: TypeAlias = Annotated[float, symbol(glyph="w", description="Width", unit="m")]

@calculation(id="leaf", title="Leaf")
@section(id="leaf-section", title="Leaf")
def leaf(width: Width) -> CalculationResults:
    value: Annotated[float, symbol(glyph="V", description="Value", unit="m")] = width
    return {"value": value}
'''
        )
        (self.root / "wrapper.cso.py").write_text(
            '''from typing import Annotated, TypeAlias
from cso_python import CalculationResults, calculation, method, section, symbol, table
from _cso_bindings.leaf import leaf

Width: TypeAlias = Annotated[float, symbol(glyph="w", description="Width", unit="m")]

@calculation(id="wrapper", title="Wrapper")
@section(id="wrapper-section", title="Wrapper")
def wrapper(width: Width) -> CalculationResults:
    method(id="leaf-method", calculation=leaf, title="Leaf")
    only = leaf(width=width)
    table(id="inner", method="leaf-method", title="Inner", cases={"Only": only})
    value: Annotated[float, symbol(glyph="V", description="Value", unit="m")] = only["value"]
    return {"value": value}
'''
        )
        (self.root / "compare.cso.py").write_text(
            '''from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table
from _cso_bindings.wrapper import wrapper

@calculation(id="compare", title="Outer comparison")
@section(id="comparison", title="Comparison", root=True)
def compare() -> CalculationResults:
    method(id="wrap", calculation=wrapper, title="Wrapper")
    first = wrapper(width=1.0)
    table(id="outer", method="wrap", title="Outer", cases={"A": first})
    ready: Annotated[float, symbol(glyph="r", description="Ready", unit="")] = 1
    return {"ready": ready}
'''
        )
        generate(self.root)
        with patch.object(Execution, "run") as run:
            response = execute(self.root / "compare.cso.py", "compare", {})
            self.assertFalse(response["ok"], response)
            self.assertEqual(response["diagnostics"][0]["code"], "OVERLAPPING_TABLE")
            self.assertTrue(
                response["diagnostics"][0]["location"]["moduleId"].endswith("compare.cso.py"),
                response["diagnostics"][0],
            )
            run.assert_not_called()

    def test_helper_source_edit_changes_the_dependency_hash(self):
        self.write_composed(
            '''    method(id="panel-method", calculation=panel, title="How panel area is calculated")
    first_panel = panel(width=2.0, height=3.0)
    second_panel = panel(width=1.0, height=6.0)
    table(id="panel-results", method="panel-method", title="Panel comparison", cases={"Case A": first_panel, "Case B": second_panel}, outputs=("area",))
'''
        )
        before = self.execution()["execution"]["methods"][0]["helpers"][0]["sourceHash"]
        margin = self.root / "margin.cso.py"
        margin.write_text(margin.read_text().replace("length + 1.0", "length + 2.0"))
        after = self.execution()["execution"]["methods"][0]["helpers"][0]["sourceHash"]
        self.assertNotEqual(before, after)

    def _orientation_source(self, axis: str, count: int) -> str:
        names = (
            "one",
            "two",
            "three",
            "four",
            "five",
            "six",
            "seven",
            "eight",
            "nine",
            "ten",
            "eleven",
            "twelve",
        )[:count]
        calls = "\n".join(
            f"    {name} = rectangle(width={index}.0, height=1.0)"
            for index, name in enumerate(names, start=1)
        )
        mapping = ", ".join(f'"{name}": {name}' for name in names)
        return f'''from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table
from _cso_bindings.rectangle import rectangle

@calculation(id="compare", title="Rectangle comparison")
@section(id="comparison", title="Comparison", root=True)
def compare() -> CalculationResults:
    method(id="rectangle-method", calculation=rectangle, title="How rectangle results are calculated")
{calls}
    table(id="rectangle-results", method="rectangle-method", title="Rectangle comparison", cases={{{mapping}}}, inputs=("width",), outputs=("area", "perimeter"), cases_axis="{axis}")
    ready: Annotated[float, symbol(glyph="r", description="Ready", unit="")] = 1
    return {{"ready": ready}}
'''

    def test_row_orientation_keeps_the_same_cell_inventory(self):
        (self.root / "compare.cso.py").write_text(self._orientation_source("columns", 12))
        columns = self.execution()["execution"]
        (self.root / "compare.cso.py").write_text(self._orientation_source("rows", 12))
        rows = self.execution()["execution"]
        self.assertEqual(columns["tables"][0]["casesAxis"], "columns")
        self.assertEqual(rows["tables"][0]["casesAxis"], "rows")
        self.assertEqual(rows["tables"][0]["cells"], columns["tables"][0]["cells"])
        self.assertEqual(len(rows["tables"][0]["cells"]), 36)
        self.assertEqual(
            [item["function"] for item in rows["invocations"]],
            [item["function"] for item in columns["invocations"]],
        )
        self.assertEqual(rows["methods"][0]["id"], columns["methods"][0]["id"])
        area_cells = [cell for cell in rows["tables"][0]["cells"] if cell["quantity"] == "area"]
        self.assertEqual(len({cell["symbolId"] for cell in area_cells}), 12)

    def test_explicit_rows_selection_matches_columns(self):
        body = '''    method(id="rectangle-method", calculation=rectangle, title="How rectangle results are calculated")
    first_panel = rectangle(width=2.0, height=3.0)
    second_panel = rectangle(width=1.0, height=6.0)
    table(id="rectangle-results", method="rectangle-method", title="Rectangle comparison", cases={"Case A": first_panel, "Case B": second_panel}, inputs=(), outputs=("area",), cases_axis="AXIS")
'''
        self.write_compare(body.replace("AXIS", "columns"))
        columns = self.execution()["execution"]["tables"][0]
        self.write_compare(body.replace("AXIS", "rows"))
        rows = self.execution()["execution"]["tables"][0]
        self.assertEqual(rows["cells"], columns["cells"])
        self.assertEqual([cell["quantity"] for cell in rows["cells"]], ["area", "area"])
        self.assertNotEqual(rows["cells"][0]["symbolId"], rows["cells"][1]["symbolId"])

    def test_empty_row_table_does_not_invent_cases(self):
        (self.root / "compare.cso.py").write_text(
            '''from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table
from _cso_bindings.rectangle import rectangle

@calculation(id="compare", title="Rectangle comparison")
@section(id="comparison", title="Comparison", root=True)
def compare() -> CalculationResults:
    method(id="rectangle-method", calculation=rectangle, title="How rectangle results are calculated")
    table(id="rectangle-results", method="rectangle-method", title="Rectangle comparison", cases={}, cases_axis="rows")
    ready: Annotated[float, symbol(glyph="r", description="Ready", unit="")] = 1
    return {"ready": ready}
'''
        )
        execution = self.execution()["execution"]
        self.assertEqual([item["function"] for item in execution["invocations"]], ["compare"])
        self.assertEqual(execution["tables"][0]["casesAxis"], "rows")
        self.assertEqual(execution["tables"][0]["cases"], [])
        self.assertEqual(execution["tables"][0]["cells"], [])

    def test_failed_check_keeps_the_number(self):
        self.write_checked()
        execution = self.execution()["execution"]
        check = execution["methods"][0]["checks"][0]
        self.assertEqual(check["predicateText"], "A <= 20")
        self.assertEqual(check["explanation"], "Area exceeds 20 square metres.")
        outcomes = [item for item in execution["checkOutcomes"] if item["checkId"] == "area-limit"]
        self.assertEqual([item["value"] for item in outcomes], [True, False])
        self.assertEqual([symbol_result(execution, item["symbolId"]) for item in execution["tables"][0]["cells"] if item["quantity"] == "area"], [6, 24])

    def test_hidden_quantity_keeps_the_check(self):
        self.write_checked(outputs='outputs=()')
        execution = self.execution()["execution"]
        self.assertEqual(execution["tables"][0]["outputs"], [])
        self.assertEqual(len(execution["checkOutcomes"]), 4)
        self.assertEqual(
            [item["id"] for item in execution["methods"][0]["checks"]],
            ["area-limit", "perimeter-limit"],
        )

    def test_empty_cases_do_not_invent_check_outcomes(self):
        self.write_checked(cases="{}")
        execution = self.execution()["execution"]
        self.assertEqual(execution["methods"][0]["checks"][0]["id"], "area-limit")
        self.assertNotIn("checkOutcomes", execution)

    def test_bare_check_predicate_is_diagnosed_before_execution(self):
        self.write_checked()
        path = self.root / "rectangle.cso.py"
        path.write_text(path.read_text().replace("predicate=area <= 20", "predicate=area"))
        generate(self.root)
        with patch.object(Execution, "run") as run:
            response = execute(self.root / "compare.cso.py", "compare", {})
            self.assertEqual(response["diagnostics"][0]["code"], "UNSUPPORTED_SYNTAX")
            run.assert_not_called()

    def test_check_exception_stays_a_whole_run_failure(self):
        self.write_checked()
        path = self.root / "rectangle.cso.py"
        path.write_text(path.read_text().replace("predicate=area <= 20", "predicate=1 / 0 <= area"))
        generate(self.root)
        response = execute(self.root / "compare.cso.py", "compare", {})
        self.assertFalse(response["ok"])
        self.assertNotIn("execution", response)
        self.assertNotIn("checkOutcomes", response)

    def test_unknown_check_target_is_diagnosed_before_execution(self):
        self.write_checked(target="volume")
        with patch.object(Execution, "run") as run:
            response = execute(self.root / "compare.cso.py", "compare", {})
            self.assertEqual(response["diagnostics"][0]["code"], "UNKNOWN_QUANTITY")
            run.assert_not_called()

    def test_conditional_records_exact_selected_branch(self):
        self.write_choice()
        payload = self.execution()["execution"]
        chosen = next(item for item in payload["methods"][0]["quantities"] if item["variableName"] == "chosen")
        self.assertEqual(chosen["formulaText"], "(w if w > h else h)")
        outcomes = payload["branchOutcomes"]
        self.assertEqual([item["value"] for item in outcomes], [True, False])
        self.assertEqual([item["label"] for item in outcomes], ["w", "h"])
        self.assertEqual([item["invocationId"] for item in outcomes], ["root/narrow", "root/wide"])
        self.assertEqual(payload["tables"][0]["casesAxis"], "rows")
        self.assertTrue(any(item["id"] == "root/spare" for item in payload["invocations"]))
        self.assertEqual(
            [symbol_result(payload, outcome["symbolId"]) for outcome in outcomes],
            [4, 4],
        )

    def test_empty_conditional_method_records_no_outcomes(self):
        self.write_choice(cases="{}")
        execution = self.execution()["execution"]
        self.assertNotIn("branchOutcomes", execution)
        self.assertEqual(
            execution["methods"][0]["quantities"][-1]["formulaText"],
            "(w if w > h else h)",
        )

    def test_short_circuit_omits_dormant_comparison(self):
        self.write_guard()
        execution = self.execution()["execution"]
        outcome = execution["branchOutcomes"][0]
        chosen = next(item for item in execution["methods"][0]["quantities"] if item["variableName"] == "chosen")
        nodes = {node["key"]: node for node in chosen["nodes"]}
        dormant = next(
            node["key"]
            for node in chosen["nodes"]
            if node.get("funcSpec", {}).get("id") == "fg.gt"
            and any((nodes[argument["key"]].get("literal") or {}).get("value") == 10 for argument in node["funcArgs"])
        )
        self.assertEqual(outcome["value"], False)
        self.assertNotIn(dormant, outcome["usedKeys"])
        self.assertEqual(outcome["label"], "0")

    def test_comparison_chain_short_circuits(self):
        self.write_chain()
        outcomes = self.execution()["execution"]["branchOutcomes"]
        self.assertEqual([item["value"] for item in outcomes], [False, True])
        self.assertLess(len(outcomes[0]["usedKeys"]), len(outcomes[1]["usedKeys"]))

    def test_dormant_division_is_not_executed(self):
        self.write_division(2)
        execution = self.execution()["execution"]
        chosen = next(item for item in execution["methods"][0]["quantities"] if item["variableName"] == "chosen")
        divide = next(node["key"] for node in chosen["nodes"] if node.get("funcSpec", {}).get("id") == "fg.divide")
        outcome = execution["branchOutcomes"][0]
        self.assertEqual(outcome["value"], True)
        self.assertNotIn(divide, outcome["usedKeys"])
        self.assertIn("else", chosen["formulaText"])

    def test_nested_conditional_records_only_the_selected_path(self):
        self.write_nested()
        outcomes = self.execution()["execution"]["branchOutcomes"]
        self.assertEqual([item["nodeKey"] for item in outcomes], ["n5", "n1"])
        self.assertEqual([item["value"] for item in outcomes], [False, True])
        self.assertEqual(outcomes[0]["label"], "0")
        self.assertEqual(outcomes[1]["label"], "(w if w > 0 else 0)")
        self.assertNotIn("n9", outcomes[0]["usedKeys"])

    def test_selected_division_by_zero_fails_the_run(self):
        self.write_division(0)
        response = execute(self.root / "compare.cso.py", "compare", {})
        self.assertFalse(response["ok"])
        self.assertNotIn("execution", response)

    def write_checked(self, outputs="", cases=None, target="area"):
        source = RECTANGLE.replace(
            "from cso_python import CalculationResults, calculation, section, symbol",
            "from cso_python import CalculationResults, calculation, check, section, symbol",
        ).replace(
            '    return {"area": area, "perimeter": perimeter}',
            f'''    check(id="area-limit", targets=("{target}",), explanation="Area exceeds 20 square metres.", predicate=area <= 20)
    check(id="perimeter-limit", targets=("perimeter",), explanation="Perimeter stays under 100 metres.", predicate=perimeter < 100)
    return {{"area": area, "perimeter": perimeter}}''',
        )
        (self.root / "rectangle.cso.py").write_text(source)
        if cases == "{}":
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
        else:
            suffix = f", {outputs}" if outputs else ""
            self.write_compare(
                f'''    method(id="rectangle-method", calculation=rectangle, title="How rectangle results are calculated")
    first_panel = rectangle(width=2.0, height=3.0)
    second_panel = rectangle(width=8.0, height=3.0)
    table(id="rectangle-results", method="rectangle-method", title="Rectangle comparison", cases={{"Case A": first_panel, "Case B": second_panel}}{suffix})'''
            )
        generate(self.root)

    def write_choice(self, cases=None):
        (self.root / "choice.cso.py").write_text(
            '''from typing import Annotated
from cso_python import CalculationResults, calculation, section, symbol

@calculation(id="choice", title="Choice")
@section(id="choice-section", title="Choice", root=True)
def choice(width: Annotated[float, symbol(glyph="w", description="Width", unit="m")], height: Annotated[float, symbol(glyph="h", description="Height", unit="m")]) -> CalculationResults:
    chosen: Annotated[float, symbol(glyph="c", description="Chosen", unit="m")] = width if width > height else height
    return {"chosen": chosen}
'''
        )
        body = '''narrow = choice(width=4, height=1)
    wide = choice(width=1, height=4)
    spare = choice(width=2, height=2)
    table(id="choice-results", method="choice-method", title="Choice comparison", cases={"Narrow": narrow, "Wide": wide}, cases_axis="rows")''' if cases is None else f'''table(id="choice-results", method="choice-method", title="Choice comparison", cases={cases})'''
        (self.root / "compare.cso.py").write_text(
            f'''from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table
from _cso_bindings.choice import choice

@calculation(id="compare", title="Choice comparison")
@section(id="comparison", title="Comparison", root=True)
def compare() -> CalculationResults:
    method(id="choice-method", calculation=choice, title="How the larger side is chosen")
    {body}
    ready: Annotated[float, symbol(glyph="r", description="Ready", unit="")] = 1
    return {{"ready": ready}}
'''
        )
        generate(self.root)

    def write_guard(self):
        (self.root / "guard.cso.py").write_text(
            '''from typing import Annotated
from cso_python import CalculationResults, calculation, section, symbol

@calculation(id="guard", title="Guard")
@section(id="guard-section", title="Guard", root=True)
def guard(width: Annotated[float, symbol(glyph="w", description="Width", unit="m")]) -> CalculationResults:
    chosen: Annotated[float, symbol(glyph="c", description="Chosen", unit="")] = 1 if width > 0 and width > 10 else 0
    return {"chosen": chosen}
'''
        )
        (self.root / "compare.cso.py").write_text(
            '''from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table
from _cso_bindings.guard import guard

@calculation(id="compare", title="Guard comparison")
@section(id="comparison", title="Comparison", root=True)
def compare() -> CalculationResults:
    method(id="guard-method", calculation=guard, title="How the guard is calculated")
    negative = guard(width=-1)
    table(id="guard-results", method="guard-method", title="Guard comparison", cases={"Negative": negative})
    ready: Annotated[float, symbol(glyph="r", description="Ready", unit="")] = 1
    return {"ready": ready}
'''
        )
        generate(self.root)

    def write_chain(self):
        (self.root / "chain.cso.py").write_text(
            '''from typing import Annotated
from cso_python import CalculationResults, calculation, section, symbol

@calculation(id="chain", title="Chain")
@section(id="chain-section", title="Chain", root=True)
def chain(width: Annotated[float, symbol(glyph="w", description="Width", unit="m")]) -> CalculationResults:
    chosen: Annotated[float, symbol(glyph="c", description="Chosen", unit="")] = 1 if 0 < width < 10 else 0
    return {"chosen": chosen}
'''
        )
        (self.root / "compare.cso.py").write_text(
            '''from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table
from _cso_bindings.chain import chain

@calculation(id="compare", title="Chain comparison")
@section(id="comparison", title="Comparison", root=True)
def compare() -> CalculationResults:
    method(id="chain-method", calculation=chain, title="How the band is calculated")
    below = chain(width=-1)
    inside = chain(width=5)
    table(id="chain-results", method="chain-method", title="Chain comparison", cases={"Below": below, "Inside": inside})
    ready: Annotated[float, symbol(glyph="r", description="Ready", unit="")] = 1
    return {"ready": ready}
'''
        )
        generate(self.root)

    def write_nested(self):
        (self.root / "nested.cso.py").write_text(
            '''from typing import Annotated
from cso_python import CalculationResults, calculation, section, symbol

@calculation(id="nested", title="Nested")
@section(id="nested-section", title="Nested", root=True)
def nested(width: Annotated[float, symbol(glyph="w", description="Width", unit="m")], height: Annotated[float, symbol(glyph="h", description="Height", unit="m")]) -> CalculationResults:
    chosen: Annotated[float, symbol(glyph="c", description="Chosen", unit="m")] = (width if width > 0 else 0) if height > 0 else height
    return {"chosen": chosen}
'''
        )
        (self.root / "compare.cso.py").write_text(
            '''from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table
from _cso_bindings.nested import nested

@calculation(id="compare", title="Nested comparison")
@section(id="comparison", title="Comparison", root=True)
def compare() -> CalculationResults:
    method(id="nested-method", calculation=nested, title="How the nested choice is calculated")
    sample = nested(width=-1, height=1)
    table(id="nested-results", method="nested-method", title="Nested comparison", cases={"Sample": sample})
    ready: Annotated[float, symbol(glyph="r", description="Ready", unit="")] = 1
    return {"ready": ready}
'''
        )
        generate(self.root)

    def write_division(self, width: int):
        (self.root / "division.cso.py").write_text(
            '''from typing import Annotated
from cso_python import CalculationResults, calculation, section, symbol

@calculation(id="division", title="Division")
@section(id="division-section", title="Division", root=True)
def division(width: Annotated[float, symbol(glyph="w", description="Width", unit="m")]) -> CalculationResults:
    chosen: Annotated[float, symbol(glyph="c", description="Chosen", unit="m")] = width if width > 0 else 1 / width
    return {"chosen": chosen}
'''
        )
        (self.root / "compare.cso.py").write_text(
            f'''from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table
from _cso_bindings.division import division

@calculation(id="compare", title="Division comparison")
@section(id="comparison", title="Comparison", root=True)
def compare() -> CalculationResults:
    method(id="division-method", calculation=division, title="How the guarded width is calculated")
    sample = division(width={width})
    table(id="division-results", method="division-method", title="Division comparison", cases={{"Sample": sample}})
    ready: Annotated[float, symbol(glyph="r", description="Ready", unit="")] = 1
    return {{"ready": ready}}
'''
        )
        generate(self.root)


def symbol_result(execution, symbol_id: str):
    def walk(sections):
        for section in sections:
            for item in section["items"]:
                if item["kind"] == "symbol" and item["symbol"]["id"] == symbol_id:
                    return item["symbol"]["valueTree"]["result"]["value"]
            found = walk(section.get("sections") or [])
            if found is not None:
                return found
        return None

    return walk(execution["cso"]["sections"])
