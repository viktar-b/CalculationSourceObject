"""Shared public-definition behavior through generation and execution."""

import hashlib
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cso_python.bindings import generate
from cso_python.execution import Execution, execute
from cso_python.source import SourceError


class DefinitionTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="cso-definition-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.fixtures = Path(__file__).parent / "fixtures/authoring-api"
        for name in ("metadata.py", "defaulted_step.cso.py"):
            shutil.copy(self.fixtures / name, self.root / name)
        self.source = self.root / "defaulted_step.cso.py"

    def generated(self):
        return {
            str(path.relative_to(self.root)): path.read_bytes()
            for path in (self.root / "_cso_bindings").rglob("*")
            if path.is_file()
        }

    def test_invalid_declarations_agree_and_never_replace_generated_files(self):
        original = self.source.read_text()
        returned = 'return {"adjusted": adjusted, "original": amount}'
        cases = [
            (returned, 'return {"": adjusted}', "INVALID_RETURN_KEYS"),
            (returned, "", "INVALID_RETURN_KEYS"),
            (returned, "return adjusted", "INVALID_RETURN_KEYS"),
            (
                returned,
                'return {"adjusted": adjusted, "adjusted": amount}',
                "INVALID_RETURN_KEYS",
            ),
            (returned, "return {1: adjusted}", "INVALID_RETURN_KEYS"),
            (returned, "return {**{}}", "INVALID_RETURN_KEYS"),
            (returned, 'return {"adjusted": adjusted + amount}', "MISSING_OUTPUT"),
            (returned, 'return {"adjusted": absent}', "MISSING_OUTPUT"),
            (returned, returned + "\n    pass", "UNSUPPORTED_SYNTAX"),
            ("amount: Amount", "amount", "UNSUPPORTED_SIGNATURE"),
            (
                "increment: Increment = 3",
                "amount: Increment = 3",
                "UNSUPPORTED_SIGNATURE",
            ),
            ("amount: Amount,", "amount: Amount, /,", "UNSUPPORTED_SIGNATURE"),
            (
                "increment: Increment = 3",
                "increment: Increment = True",
                "UNSUPPORTED_SYNTAX",
            ),
            (
                "increment: Increment = 3",
                "increment: Increment = 9007199254740993",
                "UNSUPPORTED_NUMERIC_RANGE",
            ),
        ]
        for before, after, code in cases:
            with self.subTest(source=after):
                self.source.write_text(original)
                generate(self.root)
                saved = self.generated()
                self.source.write_text(original.replace(before, after))
                with patch.object(Execution, "run") as run:
                    for check in (False, True):
                        with self.assertRaises(SourceError) as error:
                            generate(self.root, check=check)
                        self.assertEqual(error.exception.diagnostic["code"], code)
                        self.assertEqual(self.generated(), saved)
                    result = execute(self.source, "adjust", {"amount": 2})
                    self.assertFalse(result["ok"], result)
                    self.assertEqual(result["diagnostics"][0]["code"], code)
                    run.assert_not_called()

    def test_invalid_child_has_call_chain_and_no_partial_binding_output(self):
        caller = self.root / "forwarded_output.cso.py"
        caller.write_text(
            (self.fixtures / "forwarded_output.cso.py")
            .read_text()
            .replace(
                "from _cso_bindings.defaulted_step import adjust",
                'from cso_python import load_calculation\nadjust = load_calculation("defaulted_step.cso.py", function="adjust")',
            )
        )
        self.source.write_text(
            self.source.read_text().replace(
                'return {"adjusted": adjusted, "original": amount}',
                'return {"": adjusted}',
            )
        )
        with self.assertRaises(SourceError):
            generate(self.root)
        self.assertFalse((self.root / "_cso_bindings").exists())
        result = execute(self.root / "forwarded_output.cso.py", "forward", {})
        self.assertFalse(result["ok"], result)
        diagnostic = result["diagnostics"][0]
        self.assertEqual(diagnostic["code"], "INVALID_RETURN_KEYS")
        self.assertEqual(diagnostic["location"]["moduleId"], "defaulted_step.cso.py")
        self.assertEqual(
            [location["moduleId"] for location in diagnostic["callChain"]],
            ["forwarded_output.cso.py"],
        )

    def test_valid_binding_bytes_match_the_previous_definition_format(self):
        for name in ("forwarded_output.cso.py", "hidden_intermediate.cso.py"):
            shutil.copy(self.fixtures / name, self.root)
        generate(self.root)
        # Captured before this refactor at 01f296b, from these package-owned sources.
        expected = {
            "defaulted_step.py": "367006d9c463520f59e48e2283e0ecc316f37b986d14419258fa22aa69d6689d",
            "defaulted_step.pyi": "e45981b121520e839ad570884c205f54ccfaf720b1aa89cde1fa899996bf033e",
            "forwarded_output.py": "ff47e0297ef3a4ddbd7a9de3a5b36dfa42cac13eefed3f5f74f43d9bfa0ebf7e",
            "forwarded_output.pyi": "c5039b80476191f22b4ed46c09b0537825eeb68a61430d2366f4c1b9d567a7ca",
            "hidden_intermediate.py": "ccfcbe646b4b740196447e1fd45d2aca4a5d633a7c8dcef16ede08c72f2af167",
            "hidden_intermediate.pyi": "97dededcdd5bbea73743cdaf50dae782f985e36f36cdeb36ff7254087cdbe096",
        }
        files = self.generated()
        for name, digest in expected.items():
            self.assertEqual(
                hashlib.sha256(files[f"_cso_bindings/{name}"]).hexdigest(), digest
            )
        self.assertEqual(files["_cso_bindings/__init__.py"], b"")
        self.assertEqual(files["_cso_bindings/py.typed"], b"")

    def test_definition_generation_does_not_validate_or_execute_formula_bodies(self):
        self.source.write_text(
            self.source.read_text().replace("amount + increment", "amount // increment")
        )
        with patch.object(Execution, "run") as run:
            self.assertTrue(generate(self.root)["ok"])
            result = execute(self.source, "adjust", {"amount": 2})
            self.assertFalse(result["ok"], result)
            self.assertEqual(result["diagnostics"][0]["code"], "UNSUPPORTED_SYNTAX")
            run.assert_not_called()

    def test_grouped_legacy_outputs_keep_source_order_and_wrong_runtime_values(self):
        self.source.write_text("""from typing import Annotated
from cso_python import calculation, section, symbol, given, document_section

@calculation(id="legacy", title="Legacy grouped calculation")
@section(id="legacy", title="Legacy", root=True)
def adjust(amount: float = 2):
    with document_section(id="inputs", title="Inputs"):
        supplied: Annotated[float, symbol(id="input", root_key="value", glyph="A_{in}", description="Amount", unit="m")] = given(amount)
    adjusted: Annotated[float, symbol(glyph="R_{out}", description="Adjusted", unit="m")] = supplied * 4
    return {"supplied": supplied, "adjusted": 999}
""")
        self.assertTrue(generate(self.root)["ok"])
        result = execute(self.source, "adjust", {})
        self.assertTrue(result["ok"], result)
        execution = result["execution"]
        self.assertEqual([o["value"] for o in execution["observations"]], [2, 8])
        self.assertEqual(
            [o["value"] for o in execution["authoring"]["outputs"]], [2, 999]
        )
        inputs = [o for o in execution["observations"] if o["kind"] == "input"]
        self.assertEqual(len(inputs), 1)
        definition = execution["invocations"][0]["symbols"][0]
        self.assertEqual(definition["localId"], "input")
        self.assertEqual(
            execution["invocations"][0]["inputBindings"][0]["kind"], "parsedDefault"
        )

    def test_duplicate_metadata_is_rejected_by_generation_too(self):
        self.source.write_text(
            self.source.read_text()
            .replace(
                "    adjusted:", "    supplied: Amount = given(amount)\n    adjusted:"
            )
            .replace(
                "CalculationResults, calculation",
                "given, CalculationResults, calculation",
            )
        )
        with self.assertRaises(SourceError) as error:
            generate(self.root)
        self.assertEqual(error.exception.diagnostic["code"], "AMBIGUOUS_METADATA")
        self.assertFalse((self.root / "_cso_bindings").exists())

    def test_malformed_dependencies_keep_structured_source_errors(self):
        original = self.source.read_text()
        shutil.copy(self.source, self.root / "child.cso.py")
        cases = [
            (
                'calculation_call(123, function="adjust", inputs={"amount": amount})',
                "INVALID_CALL",
            ),
            (
                'calculation_call("child.cso.py", function=1, inputs={"amount": amount})',
                "INVALID_CALL",
            ),
            (
                'calculation_call("child.cso.py", function="adjust", inputs={[1]: amount})',
                "INVALID_CALL_INPUTS",
            ),
        ]
        for call, code in cases:
            with self.subTest(call=call):
                self.source.write_text(
                    original.replace(
                        "CalculationResults, calculation",
                        "calculation_call, CalculationResults, calculation",
                    ).replace(
                        'return {"adjusted": adjusted, "original": amount}',
                        f'child = {call}\n    return {{"adjusted": child["adjusted"]}}',
                    )
                )
                with self.assertRaises(SourceError) as error:
                    generate(self.root)
                self.assertEqual(error.exception.diagnostic["code"], code)
                result = execute(self.source, "adjust", {"amount": 2})
                self.assertFalse(result["ok"], result)
                self.assertEqual(result["diagnostics"][0]["code"], code)
