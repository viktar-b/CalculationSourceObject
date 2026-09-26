from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from cso_python.execution import Execution, execute
from cso_python.function_calls import FUNCTION_CALLS


class FunctionCallsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="cso-functions-")
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "functions.cso.py"

    def reject(self, expression, imports="", extra=""):
        self.path.write_text(
            f"""{imports}
from typing import Annotated
from cso_python import calculation, section, symbol
@calculation(id="functions", title="Functions")
@section(id="main", title="Main", root=True)
def calculate(quantity: Annotated[float, symbol(glyph="q_{{in}}", description="Input", unit="")] = 0.5):
    result: Annotated[float, symbol(glyph="q_{{out}}", description="Result", unit="")] = {expression}
{extra}    return {{"result": result}}
"""
        )
        with patch.object(Execution, "run") as run:
            response = execute(self.path, "calculate", {})
            self.assertFalse(response["ok"], response)
            run.assert_not_called()
        return response

    def test_all_declared_calls_reject_invalid_arity_and_keywords_before_execution(self):
        for call in FUNCTION_CALLS:
            for spelling in call.spellings:
                imports = f"from math import {call.name}\nimport math" if call.module == "math" else ""
                for args in ["", ", ".join(["quantity"] * (call.arity + 1)), "quantity=quantity"]:
                    with self.subTest(function=spelling, args=args):
                        response = self.reject(f"{spelling}({args})", imports)
                        self.assertEqual(response["diagnostics"][0]["code"], "UNSUPPORTED_SYNTAX")

    def test_math_calls_require_imports_and_reject_local_shadowing(self):
        for call in FUNCTION_CALLS:
            if call.module != "math":
                continue
            for spelling in call.spellings:
                with self.subTest(function=spelling, issue="missing import"):
                    self.reject(f"{spelling}(quantity)")
                imported = "math" if spelling.startswith("math.") else call.name
                imports = "import math" if imported == "math" else f"from math import {call.name}"
                with self.subTest(function=spelling, issue="local shadowing"):
                    self.reject(
                        f"{spelling}(quantity)",
                        imports,
                        f'    {imported}: Annotated[float, symbol(glyph="q_{{shadow}}", description="Shadow", unit="")] = 1.0\n',
                    )

    def test_unlisted_math_functions_remain_unavailable(self):
        self.reject("math.exp(quantity)", "import math")
        self.reject("exp(quantity)", "from math import exp")
