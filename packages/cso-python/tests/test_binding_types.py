"""Check generated public interfaces through real mypy consumers."""

import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from cso_python.bindings import generate


class BindingTypesTest(unittest.TestCase):
    def test_generated_consumers_and_any_mutation(self):
        with tempfile.TemporaryDirectory(prefix="cso binding types ") as temporary:
            root = Path(temporary)
            source = '''from typing import Annotated
from cso_python import calculation, section, symbol

@calculation(id="adjust", title="Adjust amount")
@section(id="adjust", title="Adjustment", root=True)
def calculate(
    amount: Annotated[float, symbol(glyph="Q_{in}", description="Amount", unit="m")],
    increment: Annotated[float, symbol(glyph="d_{inc}", description="Increment", unit="m")] = 3.0,
):
    adjusted: Annotated[float, symbol(glyph="Q_{out}", description="Adjusted amount", unit="m")] = amount + increment
    return {"adjusted": adjusted, "original": amount}
'''
            (root / "sample.cso.py").write_text(source, encoding="utf-8")
            (root / "nested").mkdir()
            (root / "nested/count.cso.py").write_text(
                source.replace("float", "int").replace("3.0", "3"), encoding="utf-8"
            )
            generate(root)
            consumers = {
                "valid.py": '''from _cso_bindings.sample import calculate
from _cso_bindings.nested.count import calculate as count
result = calculate(amount=2.0)
adjusted: float = result["adjusted"]
original: float = result["original"]
calculate(amount=2, increment=3.0)
counted: int = count(amount=2)["adjusted"]
count(amount=2, increment=4)
# Python typing permits bool as an int subtype. CSO runtime rejects bool.
count(amount=True)
''',
                "unknown_keyword.py": 'calculate(ammount=2.0)',
                "missing_input.py": 'calculate()',
                "wrong_input.py": 'calculate(amount="two")',
                "positional.py": 'calculate(2.0)',
                "private_output.py": 'calculate(amount=2.0)["private_intermediate"]',
                "wrong_result.py": 'result: str = calculate(amount=2.0)["adjusted"]',
                "float_to_int.py": 'from _cso_bindings.nested.count import calculate\ncalculate(amount=2.5)',
            }
            for name, content in consumers.items():
                if name not in ("valid.py", "float_to_int.py"):
                    content = "from _cso_bindings.sample import calculate\n" + content
                (root / name).write_text(content + "\n", encoding="utf-8")

            def check(*names):
                result = subprocess.run(
                    [
                        sys.executable, "-I", "-m", "mypy", "--strict",
                        "--no-incremental", "--no-error-summary",
                        "--show-error-codes", "--no-pretty", *names,
                    ],
                    cwd=root,
                    capture_output=True,
                    text=True,
                )
                # Missing checker/imports must never count as an expected failure.
                self.assertEqual(result.stderr, "", result.stderr)
                diagnostics = re.findall(
                    r"^([^:]+\.py):(\d+): error: .* \[([^\]]+)\]$",
                    result.stdout,
                    re.MULTILINE,
                )
                return result, set(diagnostics)

            valid, diagnostics = check("valid.py")
            self.assertEqual(valid.returncode, 0, valid.stdout)
            self.assertEqual(diagnostics, set())
            expected = {
                ("unknown_keyword.py", "2", "call-arg"),
                ("missing_input.py", "2", "call-arg"),
                ("wrong_input.py", "2", "arg-type"),
                ("positional.py", "2", "misc"),
                ("private_output.py", "2", "typeddict-item"),
                ("wrong_result.py", "2", "assignment"),
                ("float_to_int.py", "2", "arg-type"),
            }
            invalid_names = [name for name in consumers if name != "valid.py"]
            invalid, diagnostics = check(*invalid_names)
            self.assertEqual(invalid.returncode, 1, invalid.stdout)
            self.assertEqual(diagnostics, expected, invalid.stdout)

            # Prove these consumers detect loss of the callable's type contract.
            (root / "_cso_bindings/sample.pyi").write_text(
                "from typing import Any\ncalculate: Any\n", encoding="utf-8"
            )
            weakened, weakened_diagnostics = check(*invalid_names)
            self.assertEqual(weakened.returncode, 1, weakened.stdout)
            self.assertEqual(weakened_diagnostics, {("float_to_int.py", "2", "arg-type")})
            self.assertNotEqual(weakened_diagnostics, expected)
