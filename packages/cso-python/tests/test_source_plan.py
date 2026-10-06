"""A source plan lowers formulas before any case supplies values."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cso_python.describe import describe
from cso_python.execution import Execution, execute
from cso_python.source_plan import symbolic_plan

IMPORTS = (
    "from typing import Annotated\n"
    "from cso_python import calculation, section, symbol, given, calculation_call\n"
)
SYMBOL = 'Annotated[float, symbol(glyph="x", description="Quantity", unit="m")]'
OTHER = 'Annotated[float, symbol(glyph="z", description="Other quantity", unit="m")]'
RESULT = 'Annotated[float, symbol(glyph="y", description="Result", unit="m")]'


def source(body: str, parameters: str = "x: float = 2", name: str = "calculate") -> str:
    return (
        IMPORTS
        + f'@calculation(id="test", title="Test")\n'
        + f'@section(id="main", title="Main", root=True)\n'
        + f"def {name}({parameters}):\n"
        + "\n".join("    " + line for line in body.splitlines())
        + "\n"
    )


class SourcePlanTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="cso-source-plan-")
        self.directory = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)

    def write(self, name: str, text: str) -> Path:
        path = self.directory / name
        path.write_text(text)
        return path

    def test_plan_lowers_conditionals_without_executing_or_inventing_inputs(self):
        path = self.write(
            "root.cso.py",
            source(
                f"a: {SYMBOL} = given(x)\n"
                f"b: {RESULT} = a + 1 if a > 0 else a - 1\n"
                'return {"b": b}',
                parameters="x: float = -4",
            ),
        )
        with patch.object(Execution, "run") as run:
            planned = symbolic_plan(path, "calculate")
            run.assert_not_called()
        self.assertTrue(planned["ok"], planned)
        plan = planned["plan"]
        self.assertNotIn("resolvedInputs", plan)
        encoded = str(plan)
        self.assertNotIn("-4", encoded)
        functions = {
            node["funcSpec"]["id"]
            for quantity in plan["quantities"]
            for node in quantity["nodes"]
            if node["mode"] == "FUNCTION"
        }
        self.assertTrue({"fg.cnd", "fg.gt", "fg.add", "fg.subtract"} <= functions)
        names = {
            node["ref"]["name"]
            for quantity in plan["quantities"]
            for node in quantity["nodes"]
            if node["mode"] == "SYMBOL" and node["ref"]["kind"] == "name"
        }
        self.assertIn("a", names)

    def test_formula_edit_changes_revision_not_interface_fingerprint(self):
        path = self.write(
            "root.cso.py",
            source(
                f"a: {SYMBOL} = given(x)\n"
                f"b: {RESULT} = a * 4\n"
                'return {"a": a, "b": b}'
            ),
        )
        before = symbolic_plan(path, "calculate")["plan"]
        fingerprint = describe(path, "calculate")["definition"]["fingerprint"]
        text = path.read_text().replace("a * 4", "a * 5", 1)
        path.write_text(text)
        after = symbolic_plan(path, "calculate")["plan"]
        self.assertEqual(
            describe(path, "calculate")["definition"]["fingerprint"], fingerprint
        )
        self.assertNotEqual(before["revision"], after["revision"])
        self.assertNotEqual(before["sourceHash"], after["sourceHash"])

    def test_repeated_calls_share_one_plan_and_keep_distinct_results(self):
        self.write(
            "child.cso.py",
            source(
                f"a: {SYMBOL} = given(x)\n"
                f"b: {RESULT} = a * 4\n"
                'return {"a": a, "b": b}'
            ),
        )
        entry = self.write(
            "root.cso.py",
            source(
                f"a: {SYMBOL} = given(x)\n"
                f"c: {OTHER} = given(z)\n"
                'one = calculation_call("child.cso.py", function="calculate", inputs={"x": a})\n'
                'two = calculation_call("child.cso.py", function="calculate", inputs={"x": c})\n'
                f"b: {RESULT} = one['b'] + two['b']\n"
                'return {"b": b}',
                parameters="x: float = 2, z: float = 5",
            ),
        )
        execution = Execution(entry, "calculate", {})
        result = execution.response()
        self.assertTrue(result["ok"], result)
        children = [
            invocation
            for invocation in execution.planner.invocations
            if invocation.module.id == "child.cso.py"
        ]
        self.assertEqual(len(children), 2)
        self.assertIs(children[0].source_plan, children[1].source_plan)
        child_compiles = [
            key
            for key in execution.planner.compiled_plan_keys
            if key[0] == "child.cso.py"
        ]
        self.assertEqual(child_compiles, [child_compiles[0]])
        values = [item["value"] for item in result["execution"]["observations"]]
        self.assertIn(8, values)
        self.assertIn(20, values)
        again = Execution(entry, "calculate", {})
        self.assertIsNot(execution.planner.source_plans, again.planner.source_plans)
        self.assertEqual(
            symbolic_plan(self.directory / "child.cso.py", "calculate")["plan"][
                "revision"
            ],
            children[0].source_plan.revision,
        )
