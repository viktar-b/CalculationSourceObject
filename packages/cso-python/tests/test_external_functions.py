"""External declarations and captured calls through the public authoring APIs."""

import tempfile
import unittest
import math
import runpy
import json
import os
import subprocess
import sys
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

    def test_self_is_a_valid_external_input_name(self):
        methods = self.root / "methods.py"
        methods.write_text(
            methods.read_text().replace(
                'inputs={"length": Length}', 'inputs={"self": Length}'
            )
        )
        self.source.write_text(
            self.source.read_text().replace(
                "square(length=length)", "square(self=length)"
            )
        )
        self.adapter.write_text(self.adapter.read_text().replace("length", "self"))
        self.assertTrue(generate(self.root)["ok"])
        response = execute(self.source, "calculate", {})
        self.assertTrue(response["ok"], response)
        self.assertEqual(
            response["execution"]["externalCalls"][0]["inputs"][0]["name"], "self"
        )
        handle = runpy.run_path(str(self.root / "_cso_bindings/root.py"))["calculate"]
        self.assertEqual(handle()["doubled"], 18.0)

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

    def test_same_named_input_and_output_have_distinct_literal_and_default_identities(
        self,
    ):
        declaration = self.root / "methods.py"
        declaration.write_text(
            declaration.read_text().replace(
                'outputs={"area": Area, "count": Count}',
                'outputs={"length": Area, "count": Count}, defaults={"length": 3.0}',
            )
        )
        self.adapter.write_text(
            'def square(*, length):\n    return {"length": length * length, "count": 1}\n'
        )
        self.source.write_text(
            self.source.read_text()
            .replace('first["area"]', 'first["length"]')
            .replace("square(length=length)", "square(length=3.0)")
        )
        generate(self.root)
        for call in ("square(length=3.0)", "square()"):
            self.source.write_text(
                self.source.read_text().replace("square(length=3.0)", call)
            )
            response = execute(self.source, "calculate", {})
            self.assertTrue(response["ok"], response)
            captured = response["execution"]["externalCalls"][0]
            self.assertNotEqual(
                captured["inputs"][0]["symbolId"], captured["outputs"][0]["symbolId"]
            )

    def test_standard_library_helper_classes_work_and_adapter_modules_are_released(
        self,
    ):
        import sys

        self.adapter.write_text("""from __future__ import annotations
from dataclasses import dataclass
@dataclass
class Measurement:
    value: float
def square(*, length):
    measured = Measurement(length)
    return {"area": measured.value * measured.value, "count": 1}
""")
        generate(self.root)
        before = {name for name in sys.modules if name.startswith("_cso_external_")}
        for _ in range(2):
            response = execute(self.source, "calculate", {})
            self.assertTrue(response["ok"], response)
        self.assertEqual(
            before, {name for name in sys.modules if name.startswith("_cso_external_")}
        )

    def test_direct_authored_wrapper_releases_its_adapter_modules(self):
        import sys
        from unittest.mock import patch

        wrapper = self.root / "wrapper.cso.py"
        wrapper.write_text("""from cso_python import calculation, section
from _cso_bindings.root import calculate
@calculation(id="wrapper", title="Wrapper")
@section(title="Wrapper", root=True)
def wrapper():
    result = calculate()
    return {"doubled": result["doubled"]}
""")
        generate(self.root)
        before = {name for name in sys.modules if name.startswith("_cso_external_")}
        with patch.dict(sys.modules):
            sys.path.insert(0, str(self.root))
            try:
                function = runpy.run_path(str(wrapper))["wrapper"]
                self.assertEqual(function()["doubled"], 18.0)
                self.assertEqual(
                    before,
                    {name for name in sys.modules if name.startswith("_cso_external_")},
                )
            finally:
                sys.path.pop(0)

    def test_external_package_initializer_handles_survive_sibling_module_generation(
        self,
    ):
        package = self.root / "pkg"
        package.mkdir()
        declaration = (
            (self.root / "methods.py")
            .read_text()
            .replace('path="adapter.py"', 'path="../adapter.py"')
        )
        (package / "__init__.py").write_text(declaration)
        (package / "other.py").write_text(
            declaration.replace(
                "square = external_function", "other_square = external_function"
            )
        )
        self.source.write_text(
            self.source.read_text()
            .replace(
                "from _cso_bindings._external.methods import square",
                "from _cso_bindings._external.pkg.__init__ import square\nfrom _cso_bindings._external.pkg.other import other_square",
            )
            .replace(
                "    doubled:", "    second = other_square(length=length)\n    doubled:"
            )
        )
        generate(self.root)
        initializer = self.root / "_cso_bindings/_external/pkg/__init__.py"
        self.assertIn("square = load_external", initializer.read_text())
        self.assertTrue(generate(self.root, check=True)["ok"])
        response = execute(self.source, "calculate", {})
        self.assertTrue(response["ok"], response)
        self.assertEqual(len(response["execution"]["externalCalls"]), 2)

    def test_external_package_initializer_import_uses_normal_package_name(self):
        package = self.root / "pkg"
        package.mkdir()
        declaration = (
            (self.root / "methods.py")
            .read_text()
            .replace('path="adapter.py"', 'path="../adapter.py"')
        )
        (package / "__init__.py").write_text(declaration)
        self.source.write_text(
            self.source.read_text().replace(
                "from _cso_bindings._external.methods import square",
                "from _cso_bindings._external.pkg import square",
            )
        )
        self.assertTrue(generate(self.root)["ok"])
        self.assertTrue(generate(self.root, check=True)["ok"])
        response = execute(self.source, "calculate", {})
        self.assertTrue(response["ok"], response)

    def test_local_package_prefix_imports_are_rejected_before_execution(self):
        package = self.root / "local_helpers"
        package.mkdir()
        (package / "__init__.py").write_text('raise RuntimeError("must not import")\n')
        self.adapter.write_text(
            "import local_helpers.submodule\ndef square(*, length):\n    return length\n"
        )
        with self.assertRaises(SourceError) as caught:
            generate(self.root)
        self.assertEqual(
            caught.exception.diagnostic["code"], "UNSUPPORTED_ADAPTER_IMPORT"
        )

    def test_named_outputs_accept_non_identifier_public_keys(self):
        declaration = self.root / "methods.py"
        declaration.write_text(
            declaration.read_text().replace('"area": Area', '"selected area": Area')
        )
        self.adapter.write_text(
            'def square(*, length):\n    return {"selected area": length * length, "count": 1}\n'
        )
        self.source.write_text(
            self.source.read_text().replace('first["area"]', 'first["selected area"]')
        )
        generate(self.root)
        self.assertIn(
            "'selected area': float",
            (self.root / "_cso_bindings/_external/methods.pyi").read_text(),
        )
        response = execute(self.source, "calculate", {})
        self.assertTrue(response["ok"], response)
        self.assertEqual(
            response["execution"]["externalCalls"][0]["outputs"][0]["name"],
            "selected area",
        )

    def test_native_number_boundaries_preserve_kinds_and_reject_adapted_objects(self):
        declaration = self.root / "methods.py"
        declaration.write_text(
            declaration.read_text().replace(
                'outputs={"area": Area, "count": Count}', 'outputs={"area": Area}'
            )
        )
        self.source.write_text(
            "\n".join(
                line
                for line in self.source.read_text().splitlines()
                if not line.startswith("    doubled:")
            ).replace(
                'return {"doubled": doubled}', 'return {"doubled": first["area"]}'
            )
            + "\n"
        )
        generate(self.root)
        for expression, kind in (
            ("2**53 - 1", "int"),
            ("float(2**54)", "float"),
            ("1e308", "float"),
            ("-0.0", "float"),
        ):
            with self.subTest(expression=expression):
                self.adapter.write_text(
                    f"def square(*, length):\n    return {expression}\n"
                )
                response = execute(self.source, "calculate", {})
                self.assertTrue(response["ok"], response)
                self.assertEqual(
                    response["execution"]["externalCalls"][0]["outputs"][0][
                        "numericKind"
                    ],
                    kind,
                )
        for implementation in (
            "class Scalar(float):\n    pass\ndef square(*, length):\n    return Scalar(9)\n",
            "class Results(dict):\n    pass\ndef square(*, length):\n    return Results(area=9)\n",
            "def square(*, length):\n    return 2**53\n",
            'def square(*, length):\n    return float("inf")\n',
        ):
            with self.subTest(implementation=implementation):
                self.adapter.write_text(implementation)
                response = execute(self.source, "calculate", {})
                self.assertFalse(response["ok"], response)
                self.assertNotIn("execution", response)

    def test_defaults_metadata_and_reserved_namespace_fail_before_adapter_execution(
        self,
    ):
        declaration = self.root / "methods.py"
        original = declaration.read_text()
        marker = self.root / "adapter-imported.txt"
        self.adapter.write_text(
            f"from pathlib import Path\nPath({str(marker)!r}).touch()\n"
        )
        for changed in (
            original.replace(
                'description="Square the supplied length."', 'description=" "'
            ),
            original.replace(
                'description="Square', 'defaults={"length": True}, description="Square'
            ),
            original.replace(
                'description="Square', 'defaults={"unknown": 1.0}, description="Square'
            ),
            original.replace('"length": Length', '"length": float'),
            original.replace('"length": Length', '"class": Length'),
            original.replace('"area": Area', '"": Area'),
        ):
            with self.subTest(changed=changed):
                declaration.write_text(changed)
                with self.assertRaises(SourceError):
                    generate(self.root)
                self.assertFalse(marker.exists())
        declaration.write_text(original)
        (self.root / "_external.cso.py").write_text(self.source.read_text())
        with self.assertRaises(SourceError) as caught:
            generate(self.root)
        self.assertEqual(caught.exception.diagnostic["code"], "BINDING_OUTPUT_CONFLICT")
        self.assertFalse(marker.exists())

    def test_adapter_paths_and_symlinks_cannot_escape_the_project(self):
        outside = tempfile.TemporaryDirectory(prefix="cso-external-outside-")
        self.addCleanup(outside.cleanup)
        target = Path(outside.name) / "outside.py"
        target.write_text('raise RuntimeError("must not import")\n')
        declaration = self.root / "methods.py"
        original = declaration.read_text()
        for path in (str(target), os.path.relpath(target, self.root)):
            with self.subTest(path=path):
                declaration.write_text(
                    original.replace('path="adapter.py"', f"path={path!r}")
                )
                with self.assertRaises(SourceError):
                    generate(self.root)
        self.adapter.unlink()
        self.adapter.symlink_to(target)
        declaration.write_text(original)
        with self.assertRaises(SourceError) as caught:
            generate(self.root)
        self.assertEqual(caught.exception.diagnostic["code"], "INVALID_DEPENDENCY_PATH")

    def test_missing_callable_package_and_numerical_failures_have_adapter_diagnostics(
        self,
    ):
        generate(self.root)
        for implementation, message in (
            ("import missing_optional_scientific_library\n", "ModuleNotFoundError"),
            ("unrelated = 1\n", "Missing callable"),
            (
                'def square(*, length):\n    raise ArithmeticError("no admissible solution")\n',
                "no admissible solution",
            ),
            (
                'def square(*, length):\n    raise MemoryError("resource exhausted")\n',
                "resource exhausted",
            ),
        ):
            with self.subTest(message=message):
                self.adapter.write_text(implementation)
                response = execute(self.source, "calculate", {})
                self.assertFalse(response["ok"], response)
                diagnostic = response["diagnostics"][0]
                self.assertEqual(diagnostic["stage"], "execution")
                self.assertIn("adapter.py:square", diagnostic["message"])
                self.assertIn(message, diagnostic["message"])

    def test_python_and_native_output_do_not_corrupt_json_and_warnings_are_retained(
        self,
    ):
        self.adapter.write_text("""import os
import warnings
print("adapter imported")
def square(*, length):
    print("adapter called")
    os.write(1, b"native adapter output\\n")
    warnings.warn("estimated result", UserWarning)
    return {"area": length * length, "count": 1}
""")
        generate(self.root)
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "cso_python",
                "execute",
                str(self.source),
                "--function",
                "calculate",
                "--supported-execution-protocol",
                "4",
            ],
            env=os.environ.copy(),
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        response = json.loads(result.stdout)
        self.assertTrue(response["ok"], response)
        self.assertEqual(
            response["execution"]["externalCalls"][0]["warnings"],
            ["UserWarning: estimated result"],
        )
        self.assertIn("adapter imported", result.stderr)
        self.assertIn("adapter called", result.stderr)
        self.assertIn("native adapter output", result.stderr)

    def test_nonfatal_warnings_survive_a_later_adapter_failure(self):
        implementations = (
            (
                """import warnings
def square(*, length):
    warnings.warn("search approached its iteration limit", UserWarning)
    raise ArithmeticError("no admissible solution")
""",
                "no admissible solution",
            ),
            (
                """import warnings
warnings.warn("search approached its iteration limit", UserWarning)
raise RuntimeError("adapter initialization failed")
""",
                "adapter initialization failed",
            ),
            (
                """import warnings
def square(*, length):
    warnings.warn("search approached its iteration limit", UserWarning)
    return {"area": True, "count": 1}
""",
                "UNSUPPORTED_RESULT",
            ),
        )
        for implementation, failure in implementations:
            with self.subTest(failure=failure):
                self.adapter.write_text(implementation)
                generate(self.root)
                response = execute(self.source, "calculate", {})
                self.assertFalse(response["ok"], response)
                self.assertNotIn("execution", response)
                primary = response["diagnostics"][0]
                self.assertIn(failure, primary["code"] + primary["message"])
                warnings = [
                    diagnostic
                    for diagnostic in response["diagnostics"]
                    if diagnostic["code"] == "EXTERNAL_WARNING"
                ]
                self.assertEqual(len(warnings), 1)
                self.assertIn(
                    "search approached its iteration limit", warnings[0]["message"]
                )
                self.assertIn("adapter.py:square", warnings[0]["message"])
                self.assertEqual(warnings[0]["invocationId"], "root/first")

    def test_convergence_warning_promoted_by_adapter_remains_a_failure(self):
        self.adapter.write_text("""import warnings
def square(*, length):
    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        warnings.warn("solver did not converge", RuntimeWarning)
    return {"area": 9.0, "count": 1}
""")
        generate(self.root)
        response = execute(self.source, "calculate", {})
        self.assertFalse(response["ok"], response)
        self.assertIn(
            "RuntimeWarning: solver did not converge",
            response["diagnostics"][0]["message"],
        )
        self.assertNotIn("execution", response)

    def test_generated_calculation_exception_message_identifies_invalid_adapter_output(
        self,
    ):
        self.adapter.write_text(
            'def square(*, length):\n    return {"area": True, "count": 1}\n'
        )
        generate(self.root)
        handle = runpy.run_path(str(self.root / "_cso_bindings/root.py"))["calculate"]
        with self.assertRaises(SourceError) as caught:
            handle()
        self.assertIn("adapter.py:square", str(caught.exception))

    def test_external_identifier_names_follow_python_normalization_but_outputs_remain_exact(
        self,
    ):
        declaration = self.root / "methods.py"
        original = declaration.read_text()
        declaration.write_text(
            original.replace('"length": Length', '"K": Length')
            .replace('function="square"', 'function="ｓｑｕａｒｅ"')
            .replace('"area": Area', '"K": Area')
            .replace('description="Square', 'defaults={"K": 3.0}, description="Square')
        )
        self.source.write_text(
            self.source.read_text()
            .replace("square(length=length)", "square(K=length)")
            .replace('first["area"]', 'first["K"]')
        )
        self.adapter.write_text(
            'def ｓｑｕａｒｅ(*, K):\n    return {"K": K * K, "count": 1}\n'
        )
        generate(self.root)
        for call in ("square(K=length)", "square()"):
            self.source.write_text(
                self.source.read_text().replace("square(K=length)", call)
            )
            response = execute(self.source, "calculate", {})
            self.assertTrue(response["ok"], response)
            captured = response["execution"]["externalCalls"][0]
            self.assertEqual(captured["inputs"][0]["name"], "K")
            self.assertEqual(captured["outputs"][0]["name"], "K")
            self.assertEqual(captured["adapter"]["function"], "square")
        for changed in (
            original.replace('"length": Length', '"K": Length, "K": Length'),
            original.replace('"length": Length', '"K": Length').replace(
                'description="Square',
                'defaults={"K": 1.0, "K": 2.0}, description="Square',
            ),
            original.replace('"length": Length', '"ｃｌａｓｓ": Length'),
        ):
            with self.subTest(changed=changed):
                declaration.write_text(changed)
                with self.assertRaises(SourceError):
                    generate(self.root)

    def test_adapter_system_exit_is_failure_evidence_with_call_context(self):
        self.adapter.write_text("""import warnings
def square(*, length):
    warnings.warn("before solver exit")
    raise SystemExit("no admissible solution")
""")
        generate(self.root)
        response = execute(self.source, "calculate", {})
        self.assertFalse(response["ok"])
        self.assertNotIn("execution", response)
        self.assertEqual(
            response["diagnostics"][0]["code"], "EXTERNAL_EXECUTION_FAILED"
        )
        self.assertIn("adapter.py:square", response["diagnostics"][0]["message"])
        self.assertIn("no admissible solution", response["diagnostics"][0]["message"])
        self.assertEqual(response["diagnostics"][1]["code"], "EXTERNAL_WARNING")

    def test_generation_rejects_path_components_that_python_would_normalize(self):
        self.source.rename(self.root / "K.cso.py")
        with self.assertRaises(SourceError) as caught:
            generate(self.root)
        self.assertEqual(caught.exception.diagnostic["code"], "INVALID_BINDING_NAME")


if __name__ == "__main__":
    unittest.main()
