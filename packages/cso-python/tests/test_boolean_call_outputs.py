"""Predicates bind reusable-call outputs without losing lazy operand evidence."""
from pathlib import Path
import tempfile
import unittest

from cso_python.bindings import generate
from cso_python.execution import execute

SCALAR = '''from typing import Annotated, TypeAlias
from cso_python import applicable, calculation, section, symbol
Width: TypeAlias = Annotated[float, symbol(glyph="w_{scalar}", description="Width", unit="m")]
@calculation(id="scalar", title="Scalar")
@section(title="Scalar", root=True)
def scalar(width: Width):
    result: Annotated[float, symbol(glyph="r_{scalar}", description="Retained width", unit="m")] = width + 0
    applicable(id="domain", targets=("result",), explanation="Child width must be nonnegative", predicate=result >= 0)
    return {"result": result}
'''
WRAPPER = '''from typing import Annotated, TypeAlias
from cso_python import applicable, boolean, calculation, check, section, symbol
from _cso_bindings.scalar import scalar
Width: TypeAlias = Annotated[float, symbol(glyph="w_{wrapper}", description="Width", unit="m")]
@calculation(id="wrapper", title="Wrapper")
@section(title="Wrapper", root=True)
def wrapper(width: Width):
    child = scalar(width=width)
    boolean(id="direct", description="Child result is positive", predicate=child["result"] > 0)
    boolean(id="lazy", description="Positive child reciprocal", predicate=width <= 0 or 1 / child["result"] > 0)
    boolean(id="conditional", description="Selected child result is positive", predicate=(child["result"] if width >= 0 else 1) > 0)
    check(id="direct", targets=("width",), explanation="Child result is nonnegative", predicate=child["result"] >= 0)
    check(id="lazy", targets=("width",), explanation="Child reciprocal or nonpositive width", predicate=width <= 0 or 1 / child["result"] > 0)
    applicable(id="direct", targets=("width",), explanation="Child result exceeds minus ten", predicate=child["result"] > -10)
    return {"result": child["result"]}
'''
NESTED = '''from typing import Annotated, TypeAlias
from cso_python import boolean, calculation, section, symbol
from _cso_bindings.wrapper import wrapper
Width: TypeAlias = Annotated[float, symbol(glyph="w_{nested}", description="Width", unit="m")]
@calculation(id="nested", title="Nested")
@section(title="Nested", root=True)
def nested(width: Width):
    wrapped = wrapper(width=width)
    boolean(id="forwarded", description="Forwarded result is positive", predicate=wrapped["result"] > 0)
    return {"result": wrapped["result"]}
'''


class BooleanCallOutputTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="cso-boolean-outputs-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        for name, source in [("scalar", SCALAR), ("wrapper", WRAPPER), ("nested", NESTED)]:
            (self.root / f"{name}.cso.py").write_text(source)
        for name in ("wrapper", "nested"):
            (self.root / f"compare_{name}.cso.py").write_text(f'''from cso_python import calculation, method, section, table
from _cso_bindings.{name} import {name}
@calculation(id="compare", title="Compare")
@section(title="Compare", root=True)
def compare():
    method(id="procedure", calculation={name}, title="Procedure")
    negative = {name}(width=-1)
    zero = {name}(width=0)
    positive = {name}(width=2)
    table(id="cases", method="procedure", title="Cases", cases={{"Negative": negative, "Zero": zero, "Positive": positive}})
    return {{"result": positive["result"]}}
''')
        generate(self.root)

    def capture(self, function):
        response = execute(self.root / f"compare_{function}.cso.py", "compare", {})
        self.assertTrue(response["ok"], response)
        return response["execution"]

    def test_direct_and_forwarded_child_outputs_preserve_boolean_values(self):
        for function, local_id in [("wrapper", "direct"), ("nested", "forwarded")]:
            with self.subTest(function=function):
                execution = self.capture(function)
                method = execution["methods"][0]
                outcomes = [item for item in execution["booleanOutcomes"] if item["methodId"] == method["id"] and item["booleanId"] == local_id]
                self.assertEqual([item["value"] for item in outcomes], [False, False, True])
                self.assertEqual([item["value"] for item in execution["checkOutcomes"] if item["checkId"] == "direct"], [False, True, True])
                self.assertEqual([item["value"] for item in execution["applicabilityOutcomes"] if item["applicabilityId"] == "direct"], [True, True, True])

    def test_untaken_output_operands_are_absent_from_used_keys(self):
        for function in ("wrapper", "nested"):
            with self.subTest(function=function):
                execution = self.capture(function)
                method = execution["methods"][0]
                owner = method if function == "wrapper" else next(helper for helper in method["helpers"] if helper["function"] == "wrapper")
                for local_id in ("lazy", "conditional"):
                    declaration = next(item for item in owner["booleans"] if item["id"] == local_id)
                    output_keys = {node["key"] for node in declaration["expression"]["nodes"] if node.get("ref", {}).get("kind") == "output"}
                    outcomes = [item for item in execution["booleanOutcomes"] if item["methodId"] == owner["id"] and item["booleanId"] == local_id]
                    self.assertIs(outcomes[0]["value"], True)
                    self.assertTrue(output_keys.isdisjoint(outcomes[0]["usedKeys"]))
                    self.assertTrue(output_keys.issubset(outcomes[2]["usedKeys"]))

    def test_direct_external_outputs_use_the_same_captured_numeric_binding(self):
        (self.root / "external_methods.py").write_text('''from typing import Annotated, TypeAlias
from cso_python import external_function, symbol
Width: TypeAlias = Annotated[float, symbol(glyph="w_{external}", description="Width", unit="m")]
scalar = external_function(path="adapter.py", function="scalar", inputs={"width": Width}, outputs={"result": Width}, description="Retain the supplied width.")
''')
        (self.root / "adapter.py").write_text("def scalar(*, width):\n    return width\n")
        source = WRAPPER.replace(
            "from _cso_bindings.scalar import scalar",
            "from _cso_bindings._external.external_methods import scalar",
        )
        (self.root / "wrapper.cso.py").write_text(source)
        generate(self.root)
        execution = self.capture("wrapper")
        outcomes = [item for item in execution["booleanOutcomes"] if item["booleanId"] == "direct"]
        self.assertEqual([item["value"] for item in outcomes], [False, False, True])
        self.assertEqual(len(execution["externalCalls"]), 3)
        self.assertEqual([item["outputs"][0]["value"] for item in execution["externalCalls"]], [-1, 0, 2])
