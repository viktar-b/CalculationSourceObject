"""External declarations and captured calls through the public authoring APIs."""

import tempfile
import unittest
import math
import runpy
from pathlib import Path

from cso_python.bindings import generate
from cso_python.describe import describe
from cso_python.execution import Execution, execute
from cso_python.source import SourceError


class ExternalFunctionsTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="cso-external-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        (self.root / "methods.py").write_text("""from typing import Annotated, TypeAlias
from cso_python import external_function, symbol
Length: TypeAlias = Annotated[float, symbol(glyph="L", description="Length", unit="m")]
Area: TypeAlias = Annotated[float, symbol(glyph="A", description="Area", unit="m^2")]
Count: TypeAlias = Annotated[int, symbol(glyph="n", description="Calls", unit="")]
square = external_function(path="adapter.py", function="square", inputs={"length": Length}, outputs={"area": Area, "count": Count}, description="Square the supplied length.")
""")
        self.source = self.root / "root.cso.py"
        self.source.write_text("""from typing import Annotated
from cso_python import calculation, section, symbol
from methods import Length
from _cso_bindings._external.methods import square
@calculation(id="external", title="External example")
@section(title="Example", root=True)
def calculate(length: Length = 3.0):
    first = square(length=length)
    doubled: Annotated[float, symbol(glyph="D", description="Double area", unit="m^2")] = first["area"] * 2.0
    return {"doubled": doubled}
""")
        self.adapter = self.root / "adapter.py"
        self.adapter.write_text("""calls = 0
def square(*, length):
    global calls
    calls += 1
    return {"area": length * length, "count": calls}
""")

    def test_static_generation_and_description_do_not_import_adapter(self):
        self.adapter.write_text(
            'import missing_optional_scientific_library\nraise RuntimeError("must not import")\n'
        )
        self.assertTrue(generate(self.root)["ok"])
        self.assertTrue(generate(self.root, check=True)["ok"])
        self.assertTrue(describe(self.source, "calculate")["ok"])
        stub = (self.root / "_cso_bindings/_external/methods.pyi").read_text()
        self.assertIn("length: float", stub)
        self.assertIn("'area': float", stub)
        self.assertIn("'count': int", stub)

    def test_one_call_captures_all_named_results_and_downstream_arithmetic(self):
        generate(self.root)
        response = execute(self.source, "calculate", {})
        self.assertTrue(response["ok"], response)
        self.assertEqual(response["protocolVersion"], "4")
        execution = response["execution"]
        self.assertEqual(len(execution["externalCalls"]), 1)
        call = execution["externalCalls"][0]
        self.assertEqual([o["value"] for o in call["outputs"]], [9.0, 1])
        self.assertEqual(
            next(
                o
                for o in execution["authoring"]["outputs"]
                if o["invocationId"] == "root"
            )["value"],
            18.0,
        )

    def test_equal_input_calls_share_adapter_state_but_runs_start_fresh(self):
        self.source.write_text(
            self.source.read_text().replace(
                "    doubled:", "    second = square(length=length)\n    doubled:"
            )
        )
        generate(self.root)
        for _ in range(2):
            response = execute(self.source, "calculate", {})
            self.assertTrue(response["ok"], response)
            self.assertEqual(
                [
                    call["outputs"][1]["value"]
                    for call in response["execution"]["externalCalls"]
                ],
                [1, 2],
            )

    def test_top_level_generated_handle_runs_fresh_and_external_handle_requires_context(
        self,
    ):
        generate(self.root)
        handle = runpy.run_path(str(self.root / "_cso_bindings/root.py"))["calculate"]
        self.assertEqual(handle()["doubled"], 18.0)
        self.assertEqual(handle()["doubled"], 18.0)
        external = runpy.run_path(
            str(self.root / "_cso_bindings/_external/methods.py")
        )["square"]
        with self.assertRaises(SourceError) as caught:
            external(length=3.0)
        self.assertEqual(
            caught.exception.diagnostic["code"], "EXTERNAL_CONTEXT_REQUIRED"
        )

    def test_capture_executes_original_adapter_bytes_and_fresh_run_observes_edits(self):
        generate(self.root)
        engine = Execution(self.source, "calculate", {})
        self.adapter.write_text('raise RuntimeError("edited adapter")\n')
        self.assertEqual(engine.run_root({})["doubled"], 18.0)
        self.assertFalse(engine.unchanged())
        response = execute(self.source, "calculate", {})
        self.assertFalse(response["ok"])
        self.assertIn("edited adapter", response["diagnostics"][0]["message"])

    def test_defaults_literals_scalar_and_signed_zero_preserve_numeric_evidence(self):
        declaration = self.root / "methods.py"
        declaration.write_text(
            declaration.read_text().replace(
                'outputs={"area": Area, "count": Count}',
                'outputs={"area": Area}, defaults={"length": -0.0}',
            )
        )
        self.source.write_text(
            self.source.read_text().replace("square(length=length)", "square()")
        )
        self.adapter.write_text("def square(*, length):\n    return length\n")
        generate(self.root)
        response = execute(self.source, "calculate", {})
        self.assertTrue(response["ok"], response)
        call = response["execution"]["externalCalls"][0]
        self.assertEqual(call["inputs"][0]["numericKind"], "float")
        self.assertEqual(math.copysign(1, call["outputs"][0]["value"]), -1)
        self.source.write_text(
            self.source.read_text().replace("square()", "square(length=4)")
        )
        response = execute(self.source, "calculate", {})
        self.assertTrue(response["ok"], response)
        self.assertEqual(
            response["execution"]["externalCalls"][0]["outputs"][0]["numericKind"],
            "int",
        )

    def test_invalid_outputs_fail_the_entire_run_with_adapter_context(self):
        generate(self.root)
        for result in (
            "True",
            'float("nan")',
            '{"area": 9}',
            '{"area": 9, "count": 1.0}',
            '{"area": 9, "count": 2**53}',
            "[9, 1]",
        ):
            with self.subTest(result=result):
                self.adapter.write_text(
                    f"def square(*, length):\n    return {result}\n"
                )
                response = execute(self.source, "calculate", {})
                self.assertFalse(response["ok"], response)
                self.assertNotIn("execution", response)
                self.assertIn(
                    "adapter.py:square", response["diagnostics"][0]["message"]
                )

    def test_capability_rejection_and_lossy_export_precede_adapter_execution(self):
        generate(self.root)
        self.adapter.write_text(
            'raise RuntimeError("adapter must remain unexecuted")\n'
        )
        response = execute(self.source, "calculate", {}, supports_external=False)
        self.assertFalse(response["ok"])
        self.assertEqual(response["diagnostics"][0]["code"], "INCOMPATIBLE_CONTRACT")

    def test_adapter_only_edits_keep_bindings_current_but_declaration_edits_require_generation(
        self,
    ):
        generate(self.root)
        self.adapter.write_text(
            'def square(*, length):\n    return {"area": length, "count": 1}\n'
        )
        self.assertTrue(generate(self.root, check=True)["ok"])
        declaration = self.root / "methods.py"
        declaration.write_text(
            declaration.read_text().replace(
                "Square the supplied length.", "Use a changed method."
            )
        )
        self.assertFalse(generate(self.root, check=True)["ok"])
        response = execute(self.source, "calculate", {})
        self.assertEqual(response["diagnostics"][0]["code"], "STALE_BINDINGS")

    def test_project_local_adapter_imports_are_rejected_without_importing_them(self):
        self.adapter.write_text(
            "import methods\ndef square(*, length):\n    return length\n"
        )
        with self.assertRaises(SourceError) as caught:
            generate(self.root)
        self.assertEqual(
            caught.exception.diagnostic["code"], "UNSUPPORTED_ADAPTER_IMPORT"
        )


if __name__ == "__main__":
    unittest.main()
