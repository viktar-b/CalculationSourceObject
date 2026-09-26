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

    def reject(self, expression, imports="", extra="", *, code):
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
            self.assertEqual(response["diagnostics"][0]["code"], code, response)
            run.assert_not_called()
        return response

    def test_all_declared_calls_reject_invalid_arity_and_keywords_before_execution(self):
        for call in FUNCTION_CALLS:
            for spelling in call.spellings:
                imports = f"from math import {call.name}\nimport math" if call.module == "math" else ""
                counts = (
                    ([call.min_arity - 1] if call.min_arity > 0 else [])
                    + ([call.max_arity + 1] if call.max_arity is not None else [])
                )
                for args in [*(", ".join(["quantity"] * count) for count in counts), "quantity=quantity"]:
                    with self.subTest(function=spelling, args=args):
                        self.reject(f"{spelling}({args})", imports, code="UNSUPPORTED_SYNTAX")

    def test_math_calls_require_imports_and_reject_local_shadowing(self):
        for call in FUNCTION_CALLS:
            if call.module != "math":
                continue
            for spelling in call.spellings:
                args = ", ".join(["quantity"] * call.min_arity)
                expression = f"{spelling}({args})"
                with self.subTest(function=spelling, issue="missing import"):
                    self.reject(expression, code="UNSUPPORTED_SYNTAX")
                imported = "math" if spelling.startswith("math.") else call.name
                imports = "import math" if imported == "math" else f"from math import {call.name}"
                with self.subTest(function=spelling, issue="local shadowing"):
                    self.reject(
                        expression,
                        imports,
                        f'    {imported}: Annotated[float, symbol(glyph="q_{{shadow}}", description="Shadow", unit="")] = 1.0\n',
                        code="DUPLICATE_IDENTITY",
                    )

    def test_hypot_rejects_iterables_and_starred_arguments_before_execution(self):
        for spelling, imports in [
            ("hypot", "from math import hypot"),
            ("math.hypot", "import math"),
        ]:
            for arguments in ["[quantity]", "*(quantity,)"]:
                with self.subTest(function=spelling, arguments=arguments):
                    self.reject(
                        f"{spelling}({arguments})",
                        imports,
                        code="UNSUPPORTED_SYNTAX",
                    )

    def test_unlisted_math_functions_remain_unavailable(self):
        self.reject("math.fsum(quantity)", "import math", code="UNSUPPORTED_SYNTAX")
        self.reject("fsum(quantity)", "from math import fsum", code="UNSUPPORTED_SYNTAX")

    def test_display_helpers_are_not_authoring_functions(self):
        import cso_python

        for name in ("noop", "stub"):
            with self.subTest(function=name):
                self.assertFalse(hasattr(cso_python, name))
                self.reject(f"{name}(quantity)", f"from cso_python import {name}", code="UNSUPPORTED_SYNTAX")
                self.reject(f"{name}(quantity)", code="UNSUPPORTED_SYNTAX")

    def test_numeric_logical_expressions_are_rejected_before_execution(self):
        for expression in (
            "quantity and 2", "quantity or 2",
            "1 if quantity and 2 else 0",
            "1 if quantity > 0 and quantity else 0",
            "1 if (quantity or 2) > 0 else 0",
            "1 if quantity < 0 else quantity or 2",
        ):
            with self.subTest(expression=expression):
                self.reject(expression, code="UNSUPPORTED_SYNTAX")

    def test_extrema_reject_iterables_keywords_starred_arguments_and_shadowing(self):
        for name in ["min", "max"]:
            for args in [
                "quantity",
                "[quantity, 1.0]",
                "quantity, [1.0, 2.0]",
                "quantity, 1.0, key=quantity",
                "quantity, default=1.0",
                "quantity, *[1.0, 2.0]",
            ]:
                with self.subTest(function=name, args=args):
                    self.reject(f"{name}({args})", code="UNSUPPORTED_SYNTAX")
            self.reject(
                f"{name}(quantity, 1.0, 2.0)",
                extra=f'    {name}: Annotated[float, symbol(glyph="q_{{shadow}}", description="Shadow", unit="")] = 1.0\n',
                code="SHADOWED_HELPER",
            )
