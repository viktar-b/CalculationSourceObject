from __future__ import annotations

import ast
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cso_python.execution import Execution, execute
from cso_python.source import compact, identity

IMPORTS = "from typing import Annotated\nfrom cso_python import calculation, section, symbol, given, calculation_call, text, figure, document_section, documented_result\n"
SYMBOL = 'Annotated[float, symbol(glyph="x", description="Quantity", unit="m")]'
RESULT = 'Annotated[float, symbol(glyph="y", description="Result", unit="m")]'


def source(body: str, parameters: str = "x: float = 2", name: str = "calculate") -> str:
    return (
        IMPORTS
        + f'@calculation(id="test", title="Test")\n@section(id="main", title="Main", root=True)\ndef {name}({parameters}):\n'
        + "\n".join("    " + line for line in body.splitlines())
        + "\n"
    )


class ExecutionTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="cso-execution-")
        self.directory = Path(self.temp.name)
        self.entry = self.directory / "root.cso.py"
        self.child = self.directory / "child.cso.py"
        self.child.write_text(
            source(
                f'a: {SYMBOL} = given(x)\nb: {RESULT} = a * 4\nreturn {{"a": a, "b": b}}'
            )
        )
        self.entry.write_text(
            source(
                f'a: {SYMBOL} = given(x)\nchild = calculation_call("child.cso.py", function="calculate", inputs={{"x": a}})\nb: {RESULT} = child["b"]\nreturn {{"a": a, "b": b}}'
            )
        )
        self.addCleanup(self.temp.cleanup)

    def run_case(self, inputs=None):
        return execute(self.entry, "calculate", inputs or {})

    def success(self, result):
        self.assertTrue(result["ok"], result)
        return result["execution"]

    def reject_before_execution(self, expected=None):
        with patch.object(Execution, "run") as run:
            result = self.run_case()
            self.assertFalse(result["ok"], result)
            run.assert_not_called()
        if expected:
            self.assertEqual(result["diagnostics"][0]["code"], expected, result)
        return result

    def test_exact_bytes_namespace_bindings_and_observations(self):
        execution = self.success(self.run_case())
        self.assertEqual(
            [i["id"] for i in execution["invocations"]], ["root", "root/child"]
        )
        child = execution["invocations"][1]
        self.assertEqual(child["inputBindings"][0]["kind"], "callerSymbol")
        self.assertEqual(
            child["inputBindings"][0]["source"],
            {"symbolId": identity("symbol", "root", "a"), "nodeKey": "n1"},
        )
        child_symbol = execution["cso"]["sections"][1]["items"][0]["symbol"]
        self.assertEqual(
            child_symbol["valueTree"]["nodes"][0]["symbol"]["id"],
            identity("symbol", "root", "a"),
        )
        self.assertEqual(len(execution["observations"]), 4)
        for item in execution["sourceManifest"]:
            self.assertEqual(
                item["sha256"],
                hashlib.sha256(
                    (self.directory / item["moduleId"]).read_bytes()
                ).hexdigest(),
            )
        encoded = compact(
            [[m["moduleId"], m["sha256"]] for m in execution["sourceManifest"]]
        ).encode()
        self.assertEqual(
            execution["sourceClosureHash"], hashlib.sha256(encoded).hexdigest()
        )

    def test_parameter_name_can_be_documented_and_explicit_identity_is_retained(self):
        self.entry.write_text(
            source(
                'x: Annotated[float, symbol(id="width", root_key="value", glyph="w", description="Width", unit="m")] = given(x)\nchild = calculation_call("child.cso.py", function="calculate", inputs={"x": x})\nb: '
                + RESULT
                + ' = child["b"]\nreturn {"x": x, "b": b}'
            )
        )
        execution = self.success(self.run_case())
        definition = execution["invocations"][0]["symbols"][0]
        self.assertEqual(definition["localId"], "width")
        self.assertEqual(
            execution["invocations"][1]["inputBindings"][0]["source"],
            {"symbolId": identity("symbol", "root", "width"), "nodeKey": "value"},
        )

    def test_compilation_failure_is_preflighted_before_any_module_executes(self):
        self.child.write_text(
            self.child.read_text() + '\nif __name__ == "__main__":\n    return 3\n'
        )
        self.reject_before_execution("INVALID_SOURCE")

    def test_incomplete_capture_never_claims_a_complete_closure_hash(self):
        self.entry.write_text(
            self.entry.read_text().replace("child.cso.py", "missing.cso.py")
        )
        result = self.reject_before_execution("INVALID_DEPENDENCY_PATH")
        self.assertIn("sourceManifest", result["provenance"])
        self.assertNotIn("sourceClosureHash", result["provenance"])

    def test_parameter_cannot_shadow_an_imported_helper(self):
        self.entry.write_text(
            source(
                f'a: {SYMBOL} = given(given)\nreturn {{"a": a}}',
                parameters="given: float = 2",
            )
        )
        self.reject_before_execution("UNSUPPORTED_SIGNATURE")

    def test_entry_symlink_loop_emits_structured_failure(self):
        self.entry.unlink()
        self.entry.symlink_to(self.entry)
        result = subprocess.run(
            [
                sys.executable,
                "-I",
                "-m",
                "cso_python",
                "execute",
                str(self.entry),
                "--function",
                "calculate",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 1)
        self.assertFalse(json.loads(result.stdout)["ok"])
        self.assertNotIn("Traceback", result.stderr)

    def test_syntax_failure_has_a_utf8_source_location(self):
        self.entry.write_text("é = (\n")
        result = self.reject_before_execution("INVALID_SOURCE")
        self.assertEqual(
            result["diagnostics"][0]["location"],
            {
                "moduleId": "root.cso.py",
                "start": {"line": 1, "column": 0},
                "end": {"line": 1, "column": len("é = (".encode())},
            },
        )

    def test_same_module_different_function_is_not_recursion(self):
        leaf = source(
            f'a: {SYMBOL} = given(x)\nb: {RESULT} = a * 4\nreturn {{"a": a, "b": b}}',
            name="leaf",
        )
        root = self.entry.read_text().replace(
            '"child.cso.py", function="calculate"', '"root.cso.py", function="leaf"'
        )
        self.entry.write_text(root + "\n" + leaf[len(IMPORTS) :])
        execution = self.success(self.run_case())
        self.assertEqual(len(execution["sourceManifest"]), 1)
        self.assertEqual(
            [i["function"] for i in execution["invocations"]], ["calculate", "leaf"]
        )
        self.assertEqual(execution["observations"][-1]["value"], 8)
        recursive_leaf = source(
            f'a: {SYMBOL} = given(x)\nagain = calculation_call("root.cso.py", function="calculate", inputs={{"x": a}})\nb: {RESULT} = again["b"]\nreturn {{"a": a, "b": b}}',
            name="leaf",
        )
        self.entry.write_text(root + "\n" + recursive_leaf[len(IMPORTS) :])
        self.reject_before_execution("DEPENDENCY_CYCLE")

    def test_nested_runtime_failure_retains_full_call_chain(self):
        wrapper = self.directory / "wrapper.cso.py"
        wrapper.write_text(self.entry.read_text())
        self.entry.write_text(
            self.entry.read_text().replace('"child.cso.py"', '"wrapper.cso.py"')
        )
        self.child.write_text(self.child.read_text().replace("a * 4", "a / 0"))
        result = self.run_case()
        self.assertFalse(result["ok"])
        diagnostic = result["diagnostics"][0]
        self.assertEqual(diagnostic["code"], "EXECUTION_FAILED")
        self.assertEqual(diagnostic["location"]["moduleId"], "child.cso.py")
        self.assertEqual(diagnostic["invocationId"], "root/child/child")
        self.assertEqual(
            [s["moduleId"] for s in diagnostic["callChain"]],
            ["root.cso.py", "wrapper.cso.py"],
        )
        self.assertIn(diagnostic["callChain"][-1], diagnostic["relatedLocations"])
        self.child.write_text(self.child.read_text().replace("a / 0", "2 ** 53"))
        numeric = self.run_case()["diagnostics"][0]
        self.assertEqual(numeric["code"], "UNSUPPORTED_NUMERIC_RANGE")
        self.assertEqual(numeric["callChain"], diagnostic["callChain"])
        self.assertEqual(numeric["invocationId"], "root/child/child")

    def test_grouped_raw_string_is_rejected_before_execution(self):
        self.entry.write_text(
            source(
                f'with document_section(id="group", title="Assumptions"):\n    "Assumption accidentally missing text wrapper"\n    a: {SYMBOL} = given(x)\nreturn {{"a": a}}'
            )
        )
        self.reject_before_execution("UNSUPPORTED_SYNTAX")
        self.entry.write_text(
            source(f'"Function docstring"\na: {SYMBOL} = given(x)\nreturn {{"a": a}}')
        )
        self.success(self.run_case())

    def test_every_parameter_requires_an_input_symbol_before_execution(self):
        original = self.entry.read_text()
        for parameters in ["x: float", "x: float = 2"]:
            self.entry.write_text(
                source(f'a: {SYMBOL} = 1\nreturn {{"a": a}}', parameters=parameters)
            )
            with patch.object(Execution, "run") as run:
                result = execute(self.entry, "calculate", {"x": 2})
                self.assertFalse(result["ok"])
                self.assertEqual(result["diagnostics"][0]["code"], "UNDOCUMENTED_INPUT")
                run.assert_not_called()
        self.entry.write_text(original)
        self.child.write_text(self.child.read_text().replace("given(x)", "2"))
        execution = self.success(self.run_case())
        child_parameter = next(
            p
            for p in execution["authoring"]["parameters"]
            if p["invocationId"] == "root/child"
        )
        self.assertEqual(child_parameter["symbolId"], identity("symbol", "root", "a"))

    def test_metadata_requires_native_json_types_recursively(self):
        original = self.entry.read_text()
        for metadata in [
            '{1: "numeric", "1": "string"}',
            '{"nested": (1, 2)}',
            '{"nested": [{False: "value"}]}',
            '{"nested": [1e400]}',
        ]:
            for decorator in [
                '@calculation(id="test", title="Test")',
                '@section(id="main", title="Main", root=True)',
            ]:
                with self.subTest(metadata=metadata, decorator=decorator):
                    self.entry.write_text(
                        original.replace(
                            decorator, decorator[:-1] + ", metadata=" + metadata + ")"
                        )
                    )
                    self.reject_before_execution("INVALID_METADATA")
        metadata = {"nested": {"values": [1, 2.5, None, True, "text"]}}
        self.entry.write_text(
            original.replace(
                '@calculation(id="test", title="Test")',
                '@calculation(id="test", title="Test", metadata='
                + repr(metadata)
                + ")",
            )
        )
        execution = self.success(self.run_case())
        self.assertEqual(
            json.loads(json.dumps(execution))["cso"]["source"]["metadata"], metadata
        )

    def test_helper_call_targets_require_supported_ast_shapes(self):
        original = self.entry.read_text()
        for before, after in [
            ("given(x)", "(1).given(x)"),
            ('child["b"]', "(1).sqrt(a)"),
            ('child["b"]', "(1).math.sqrt(a)"),
            ('child["b"]', "(1).documented_result(a)"),
            ("calculation_call(", "(1).calculation_call("),
            ("symbol(", "(1).symbol("),
            ("Annotated[", "(1).Annotated["),
            ("@calculation(", "@(1).calculation("),
            ("@section(", "@(1).section("),
        ]:
            with self.subTest(target=after):
                self.entry.write_text(
                    "from math import sqrt\n" + original.replace(before, after)
                )
                self.reject_before_execution(
                    "MISSING_METADATA"
                    if before in {"symbol(", "Annotated["}
                    else "UNSUPPORTED_SYNTAX"
                )
        for statement in [
            '(1).text(id="text", content="Assumption")',
            '(1).figure(id="figure", path="none.png", media_type="image/png", caption="Figure", alt="Figure")',
            'with (1).document_section(id="group", title="Group"):\n    text(id="text", content="Assumption")',
        ]:
            with self.subTest(statement=statement):
                self.entry.write_text(
                    source(f'a: {SYMBOL} = given(x)\n{statement}\nreturn {{"a": a}}')
                )
                self.reject_before_execution("UNSUPPORTED_SYNTAX")
        for imported, call in [
            ("from math import sqrt", "sqrt(a)"),
            ("import math", "math.sqrt(a)"),
        ]:
            with self.subTest(valid=call):
                self.entry.write_text(
                    imported + "\n" + original.replace('child["b"]', call)
                )
                self.success(self.run_case())

    def test_selected_parameters_require_numeric_annotations(self):
        original_entry = self.entry.read_text()
        original_child = self.child.read_text()
        for parameters in ["x=2", "x: Any=2", "x: None=2", "x: CalculationResults=2"]:
            for target, original in [
                (self.entry, original_entry),
                (self.child, original_child),
            ]:
                with self.subTest(parameters=parameters, module=target.name):
                    self.entry.write_text(original_entry)
                    self.child.write_text(original_child)
                    target.write_text(
                        "from typing import Any\nfrom cso_python import CalculationResults\n"
                        + original.replace("x: float = 2", parameters)
                    )
                    result = self.reject_before_execution("UNSUPPORTED_SIGNATURE")
                    self.assertEqual(
                        result["diagnostics"][0]["location"]["moduleId"], target.name
                    )
        self.entry.write_text(original_entry.replace("x: float = 2", "x: int = 2"))
        self.child.write_text(original_child)
        self.success(self.run_case())

    def test_metadata_numbers_preserve_the_safe_json_domain(self):
        original = self.entry.read_text()
        for value in [2**53, -(2**53), 2**53 + 1, float(2**53), 1e100]:
            with self.subTest(value=value):
                self.entry.write_text(
                    original.replace(
                        'title="Test")',
                        f'title="Test", metadata={{"nested": [{{"case": {value!r}}}]}})',
                    )
                )
                self.reject_before_execution("INVALID_METADATA")
        for value in [2**53 - 1, -(2**53 - 1), 1.25]:
            with self.subTest(valid=value):
                self.entry.write_text(
                    original.replace(
                        'title="Test")',
                        f'title="Test", metadata={{"case": {value!r}}})',
                    )
                )
                result = self.success(self.run_case())
                self.assertEqual(result["cso"]["source"]["metadata"]["case"], value)

    def test_dependency_call_line_ranges_must_not_overlap(self):
        first = 'one = calculation_call("child.cso.py", function="calculate", inputs={"x": a})'
        second = first.replace("one =", "two =")
        for calls in [
            first + "; " + second,
            first.replace("inputs=", "\n    inputs=") + "; " + second,
        ]:
            with self.subTest(calls=calls):
                self.entry.write_text(
                    source(
                        f'a: {SYMBOL} = given(x)\n{calls}\nb: {RESULT} = two["b"]\nreturn {{"a": a, "b": b}}'
                    )
                )
                result = self.reject_before_execution("AMBIGUOUS_CALL_SITE")
                self.assertTrue(result["diagnostics"][0]["relatedLocations"])
        self.entry.write_text(
            source(
                f'a: {SYMBOL} = given(x)\n{first}\n{second}\nb: {RESULT} = two["b"]\nreturn {{"a": a, "b": b}}'
            )
        )
        self.success(self.run_case())
        namespace = {"__name__": "direct", "__file__": str(self.entry)}
        exec(compile(self.entry.read_bytes(), str(self.entry), "exec"), namespace)  # noqa: S102
        self.assertEqual(namespace["calculate"]()["b"], 8)

    def test_export_rejects_aliased_content_instead_of_dropping_it(self):
        imports = [
            ("from cso_python import {helper} as content", "content"),
            ("import cso_python as cso", "cso.{helper}"),
            ("from cso_python import *", "{helper}"),
            ("import cso_python.authoring as authoring", "authoring.{helper}"),
            ("import cso_python.authoring", "cso_python.authoring.{helper}"),
            ("from cso_python.authoring import {helper} as content", "content"),
            ("from cso_python.authoring import {helper}", "{helper}"),
            ("from cso_python import authoring", "authoring.{helper}"),
            ("from cso_python import authoring as helpers", "helpers.{helper}"),
            ("import cso_python.authoring.extra as nested", "nested.{helper}"),
            ("from cso_python.authoring.extra import {helper} as content", "content"),
        ]
        calls = {
            "text": '(id="assumption", content="Keep this assumption")',
            "figure": '(id="figure", path="none.png", media_type="image/png", caption="Keep this figure", alt="Figure")',
        }
        cases = [
            (imported.format(helper=helper), target.format(helper=helper) + arguments)
            for helper, arguments in calls.items()
            for imported, target in imports
        ]
        for imported, call in cases:
            with self.subTest(imported=imported):
                text = source(f'a: {SYMBOL} = given(x)\n{call}\nreturn {{"a": a}}')
                text = text.replace(
                    IMPORTS,
                    "from typing import Annotated\nfrom cso_python import calculation, section, symbol, given\n"
                    + imported
                    + "\n",
                )
                self.entry.write_text(text)
                for command in ["execute", "export"]:
                    with self.subTest(command=command):
                        result = subprocess.run(
                            [
                                sys.executable,
                                "-I",
                                "-m",
                                "cso_python",
                                command,
                                str(self.entry),
                                "--function",
                                "calculate",
                            ],
                            capture_output=True,
                            text=True,
                            check=False,
                        )
                        self.assertEqual(
                            result.returncode, 1, result.stdout + result.stderr
                        )
                        if command == "execute":
                            response = json.loads(result.stdout)
                            self.assertFalse(response["ok"])
                            self.assertEqual(
                                response["diagnostics"][0]["code"], "UNSUPPORTED_SYNTAX"
                            )
                        else:
                            self.assertEqual(result.stdout, "")
                            self.assertRegex(
                                result.stderr,
                                "Unapproved or aliased import|Unsupported module statement",
                            )

    def test_export_namespace_rule_keeps_similarly_named_modules_distinct(self):
        for imported in [
            "import cso_python_extra",
            "from cso_python_extra import value",
        ]:
            with self.subTest(imported=imported):
                text = source(f'a: {SYMBOL} = given(x)\nreturn {{"a": a}}')
                text = text.replace(
                    IMPORTS,
                    "from typing import Annotated\nfrom cso_python import calculation, section, symbol, given\n"
                    + imported
                    + "\n",
                )
                self.entry.write_text(text)
                runner = (
                    "import sys,types,runpy; module=types.ModuleType('cso_python_extra'); module.value=1; "
                    "sys.modules['cso_python_extra']=module; sys.argv="
                    + repr(
                        [
                            "cso_python",
                            "export",
                            str(self.entry),
                            "--function",
                            "calculate",
                        ]
                    )
                    + "; runpy.run_module('cso_python',run_name='__main__')"
                )
                result = subprocess.run(
                    [sys.executable, "-I", "-c", runner],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(result.stdout)["title"], "Test")

    def test_wrong_return_is_not_corrected(self):
        self.child.write_text(self.child.read_text().replace('"b": b', '"b": 999'))
        execution = self.success(self.run_case())
        actual = {o["symbolId"]: o["value"] for o in execution["observations"]}
        self.assertEqual(actual[identity("symbol", "root/child", "b")], 8)
        returned = next(
            o
            for o in execution["authoring"]["outputs"]
            if o["invocationId"] == "root/child" and o["name"] == "b"
        )
        self.assertEqual(returned["value"], 999)
        self.assertEqual(actual[identity("symbol", "root", "b")], 999)
        graph = execution["cso"]["sections"][1]["items"][1]["symbol"]["valueTree"]
        self.assertEqual(graph["nodes"][0]["funcSpec"]["id"], "fg.multiply")
        self.assertEqual(graph["result"]["value"], 8)
        self.assertNotIn("operationObservations", execution)

    def test_relocation_and_comment_or_formula_hash_changes(self):
        before = self.success(self.run_case())
        target = self.directory / "copied"
        target.mkdir()
        for path in [self.entry, self.child]:
            shutil.copy(path, target / path.name)
        moved = self.success(execute(target / self.entry.name, "calculate", {}))
        self.assertEqual(before, moved)
        self.child.write_text(self.child.read_text() + "# equivalent edit\n")
        changed = self.success(self.run_case())
        self.assertNotEqual(before["sourceClosureHash"], changed["sourceClosureHash"])
        self.assertEqual(before["observations"], changed["observations"])
        self.child.write_text(self.child.read_text().replace("a * 4", "a * 5"))
        formula = self.success(self.run_case())
        self.assertNotEqual(changed["observations"], formula["observations"])
        self.assertNotEqual(changed["cso"], formula["cso"])

    def test_source_change_during_execution_uses_captured_bytes(self):
        import cso_python

        original = cso_python.given

        def change(value):
            self.child.write_text(self.child.read_text().replace("a * 4", "a * 9"))
            return original(value)

        before = hashlib.sha256(self.child.read_bytes()).hexdigest()
        with patch("cso_python.given", change):
            execution = self.success(self.run_case())
        child_hash = next(
            m["sha256"]
            for m in execution["sourceManifest"]
            if m["moduleId"] == "child.cso.py"
        )
        self.assertEqual(child_hash, before)
        self.assertNotEqual(
            child_hash, hashlib.sha256(self.child.read_bytes()).hexdigest()
        )
        self.assertEqual(execution["observations"][-1]["value"], 8)

    def test_duplicate_unknown_missing_call_inputs_have_two_locations(self):
        original = self.entry.read_text()
        self.child.write_text(
            self.child.read_text().replace("x: float = 2", "x: float")
        )
        for mapping in ['{"x": a, "x": 3}', '{"wrong": a}', "{}"]:
            with self.subTest(mapping=mapping):
                self.entry.write_text(original.replace('{"x": a}', mapping))
                result = self.reject_before_execution("INVALID_CALL_INPUTS")
                diag = result["diagnostics"][0]
                self.assertEqual(diag["location"]["moduleId"], "root.cso.py")
                self.assertEqual(
                    diag["relatedLocations"][0]["moduleId"], "child.cso.py"
                )

    def test_default_literal_and_supplied_provenance(self):
        original = self.entry.read_text()
        for mapping, kind in [("{}", "parsedDefault"), ('{"x": 2}', "callerLiteral")]:
            self.entry.write_text(original.replace('{"x": a}', mapping))
            child = self.success(self.run_case())["invocations"][1]
            self.assertEqual(child["resolvedInputs"], {"x": 2})
            self.assertEqual(child["inputBindings"][0]["kind"], kind)
        omitted = self.success(self.run_case())["invocations"][0]
        supplied = self.success(self.run_case({"x": 2}))["invocations"][0]
        self.assertEqual(omitted["resolvedInputs"], supplied["resolvedInputs"])
        self.assertEqual(omitted["inputBindings"][0]["kind"], "parsedDefault")
        self.assertEqual(supplied["inputBindings"][0]["kind"], "entrySupplied")

    def test_reuse_and_nested_calls(self):
        wrapper = self.directory / "wrapper.cso.py"
        wrapper.write_text(self.entry.read_text())
        self.entry.write_text(
            source(
                f'a: {SYMBOL} = given(x)\none = calculation_call("wrapper.cso.py", function="calculate", inputs={{"x": a}})\ntwo = calculation_call("wrapper.cso.py", function="calculate", inputs={{"x": one["b"]}})\nb: {RESULT} = two["b"]\nreturn {{"a": a, "b": b}}'
            )
        )
        execution = self.success(self.run_case())
        self.assertEqual(
            [i["id"] for i in execution["invocations"]],
            ["root", "root/one", "root/one/child", "root/two", "root/two/child"],
        )
        self.assertEqual(execution["observations"][-1]["value"], 32)
        self.assertEqual(len({o["symbolId"] for o in execution["observations"]}), 10)

    def test_failure_matrix_preflights_entire_closure(self):
        original = self.entry.read_text()
        cases = [
            (original.replace('child["b"]', 'child["missing"]'), "MISSING_OUTPUT"),
            (
                original.replace("child.cso.py", "missing.cso.py"),
                "INVALID_DEPENDENCY_PATH",
            ),
            (
                original.replace("child.cso.py", "../outside.cso.py"),
                "INVALID_DEPENDENCY_PATH",
            ),
            (original.replace("child.cso.py", "root.cso.py"), "DEPENDENCY_CYCLE"),
            (original.replace("    b:", "    a:"), "DUPLICATE_IDENTITY"),
            (
                original.replace("    b:", "    for x in [1]: pass\n    b:"),
                "UNSUPPORTED_SYNTAX",
            ),
            ('print("side effect")\n' + original, "UNSUPPORTED_SYNTAX"),
            ("import os\n" + original, "UNSUPPORTED_SYNTAX"),
            (original.replace("x: float = 2", "x: float = 1+1"), "UNSUPPORTED_SYNTAX"),
            (
                original.replace(
                    "    return", '    text(id="late", content=unknown)\n    return'
                ),
                "INVALID_LITERAL",
            ),
        ]
        for value, code in cases:
            with self.subTest(code=code):
                self.entry.write_text(value)
                self.reject_before_execution(code)

    def test_symlink_escape(self):
        with tempfile.TemporaryDirectory() as other:
            target = Path(other) / "child.cso.py"
            shutil.copy(self.child, target)
            self.child.unlink()
            self.child.symlink_to(target)
            self.reject_before_execution("INVALID_DEPENDENCY_PATH")

    def test_utf8_spans_and_manifest(self):
        target = self.directory / "géométrie.cso.py"
        self.child.rename(target)
        self.entry.write_text(
            self.entry.read_text()
            .replace("child.cso.py", "géométrie.cso.py")
            .replace("a: Annotated", "é: Annotated")
            .replace("given(x)", "given(x)")
            .replace('"x": a', '"x": é')
            .replace('"a": a', '"é": é')
        )
        execution = self.success(self.run_case())
        definition = execution["invocations"][0]["symbols"][0]
        tree = ast.parse(self.entry.read_text())
        assignment = next(
            n
            for n in ast.walk(tree)
            if isinstance(n, ast.AnnAssign) and n.target.id == "é"
        )
        self.assertEqual(
            definition["definitionLocation"]["end"]["column"], assignment.end_col_offset
        )
        self.assertEqual(execution["sourceManifest"][0]["moduleId"], "géométrie.cso.py")

    def test_grouped_content_order_and_invalid_nesting(self):
        (self.directory / "diagram.svg").write_text(
            '<svg xmlns="http://www.w3.org/2000/svg"/>'
        )
        body = f'text(id="before", content="Before")\nwith document_section(id="detail", title="Detail"):\n    a: {SYMBOL} = given(x)\n    figure(id="diagram", path="diagram.svg", media_type="image/svg+xml", caption="Diagram", alt="Diagram")\ntext(id="after", content="After")\nb: {RESULT} = a * 4\nreturn {{"a": a, "b": b}}'
        self.entry.write_text(source(body))
        execution = self.success(self.run_case())
        sections = execution["cso"]["sections"]
        self.assertEqual(
            [i["kind"] for i in sections[0]["items"]],
            ["text", "section", "text", "symbol"],
        )
        self.assertEqual(
            [i["kind"] for i in sections[1]["items"]], ["symbol", "figure"]
        )
        self.assertEqual(len(execution["assets"]), 1)
        self.entry.write_text(
            source(
                body.replace(
                    "    a:",
                    '    with document_section(id="nested", title="Nested"):\n        text(id="x", content="X")\n    a:',
                )
            )
        )
        self.reject_before_execution("UNSUPPORTED_SYNTAX")

    def test_unsupported_and_numeric_failures_are_honest(self):
        for value in ["True", '"text"', "9007199254740993", "1e400"]:
            self.entry.write_text(source(f'a: {SYMBOL} = {value}\nreturn {{"a": a}}'))
            self.reject_before_execution()
        self.entry.write_text(
            source(
                f'a: {SYMBOL} = documented_result(2 * 4)\nreturn {{"a": a}}',
                parameters="",
            )
        )
        execution = self.success(self.run_case())
        self.assertEqual(execution["observations"][0]["kind"], "unsupported")
        self.entry.write_text(
            source(f'a: {SYMBOL} = 1 / 0\nreturn {{"a": a}}', parameters="")
        )
        result = self.run_case()
        self.assertFalse(result["ok"])
        self.assertEqual(result["diagnostics"][0]["stage"], "execution")

    def test_direct_helper_and_export_match_execute(self):
        code = (
            "import runpy,json; m=runpy.run_path("
            + repr(str(self.entry))
            + '); print(json.dumps(m["calculate"]()))'
        )
        result = subprocess.run(
            [sys.executable, "-I", "-c", code],
            capture_output=True,
            text=True,
            check=True,
        )
        self.assertEqual(json.loads(result.stdout), {"a": 2, "b": 8})
        exported = subprocess.run(
            [
                sys.executable,
                "-I",
                "-m",
                "cso_python",
                "export",
                str(self.entry),
                "--function",
                "calculate",
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        self.assertEqual(
            json.loads(exported.stdout), self.success(self.run_case())["cso"]
        )

    def test_json_usage_failure_matrix(self):
        base = [
            sys.executable,
            "-I",
            "-m",
            "cso_python",
            "execute",
            str(self.entry),
            "--function",
            "calculate",
        ]
        for args in [
            ["--input", "x=1", "--input", "x=2"],
            ["--inputs-json", '{"x":1,"x":2}'],
            ["--input", "nope=1"],
            ["--input", "x=NaN"],
            ["--inputs-json", "[]"],
            ["--function", "calculate"],
            ["--unknown"],
            ["--input"],
            ["--input", "x=9007199254740993"],
        ]:
            with self.subTest(args=args):
                result = subprocess.run(
                    base + args, capture_output=True, text=True, check=False
                )
                self.assertEqual(result.returncode, 2, result)
                response = json.loads(result.stdout)
                self.assertFalse(response["ok"])
                self.assertEqual(response["diagnostics"][0]["stage"], "usage")


if __name__ == "__main__":
    unittest.main()
