"""Behavioral checks for signature inputs, inherited quantities and typed handles."""

import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cso_python.bindings import generate
from cso_python.execution import Execution, execute
from cso_python.source import SourceError


def sources(*names):
    def decorate(method):
        method.sources = names
        return method

    return decorate


class AuthoringV2Test(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="cso-v2-test-")
        self.root = Path(self.temp.name)
        fixture = Path(__file__).parent / "fixtures/authoring-api"
        self.fixture = fixture
        for name in ("metadata.py", "defaulted_step.cso.py"):
            shutil.copy(fixture / name, self.root / name)
        # Composition and hidden-observation cases are added only by tests that use them.
        for name in getattr(getattr(type(self), self._testMethodName), "sources", ()):
            shutil.copy(fixture / name, self.root / name)

    def tearDown(self):
        self.temp.cleanup()

    def add_hidden_assignment(self):
        self.edit(
            "defaulted_step.cso.py",
            "    return",
            '    intermediate: Annotated[float, symbol(glyph="I", description="Hidden", unit="m")] = adjusted * 2\n    return',
        )

    def run_case(self, function="forward", **inputs):
        return execute(
            self.root
            / (
                "defaulted_step.cso.py"
                if function == "adjust"
                else "forwarded_output.cso.py"
            ),
            function,
            inputs,
        )

    def success(self, response):
        self.assertTrue(response["ok"], response)
        self.assertEqual(response["protocolVersion"], "2")
        return response["execution"]

    def edit(self, name, before, after):
        path = self.root / name
        self.assertIn(before, path.read_text())
        path.write_text(path.read_text().replace(before, after))

    @sources("hidden_intermediate.cso.py")
    def test_standalone_records_hidden_intermediate_and_selected_outputs(self):
        result = self.success(
            execute(self.root / "hidden_intermediate.cso.py", "hidden", {})
        )
        self.assertEqual([o["value"] for o in result["observations"]], [2, 3, 6])
        self.assertEqual(
            [o["name"] for o in result["authoring"]["outputs"]], ["adjusted"]
        )
        self.assertEqual(len(result["authoring"]["uses"]), 1)

    @sources("forwarded_output.cso.py")
    def test_generation_bootstraps_without_importing_or_executing_calculations(self):
        with patch.object(Execution, "run") as run:
            self.assertTrue(generate(self.root)["ok"])
            run.assert_not_called()
        before = {
            p: p.read_bytes()
            for p in (self.root / "_cso_bindings").iterdir()
            if p.is_file()
        }
        self.assertTrue(generate(self.root, check=True)["ok"])
        self.assertEqual(before, {p: p.read_bytes() for p in before})

    @sources("forwarded_output.cso.py")
    def test_repeated_calls_share_inputs_but_keep_invocation_identity(self):
        generate(self.root)
        result = self.success(self.run_case())
        self.assertEqual(len(result["observations"]), 5)
        self.assertEqual(sum(o["kind"] == "input" for o in result["observations"]), 2)

        self.assertEqual(
            [i["id"] for i in result["invocations"]],
            ["root", "root/first", "root/second"],
        )
        second = next(
            p
            for p in result["authoring"]["parameters"]
            if p["invocationId"] == "root/second" and p["parameterName"] == "amount"
        )
        self.assertEqual(
            second["origin"],
            {"kind": "output", "invocationId": "root/first", "outputName": "original"},
        )
        for item in result["sourceManifest"]:
            self.assertEqual(
                item["sha256"],
                hashlib.sha256((self.root / item["moduleId"]).read_bytes()).hexdigest(),
            )

    @sources("forwarded_output.cso.py")
    def test_stale_interface_rejected_but_formula_edit_needs_no_regeneration(self):
        generate(self.root)
        self.edit(
            "defaulted_step.cso.py", "amount + increment", "amount + increment * 2"
        )
        self.assertTrue(generate(self.root, check=True)["ok"])
        self.success(self.run_case())
        self.edit(
            "defaulted_step.cso.py",
            "increment: Increment = 3",
            "increment: Increment = 4",
        )
        self.assertFalse(generate(self.root, check=True)["ok"])
        self.assertEqual(self.run_case()["diagnostics"][0]["code"], "STALE_BINDINGS")

    @sources("forwarded_output.cso.py")
    def test_private_output_and_unknown_arguments_fail_preflight(self):
        self.add_hidden_assignment()
        generate(self.root)
        self.edit(
            "forwarded_output.cso.py", 'first["adjusted"]', 'first["intermediate"]'
        )
        with patch.object(Execution, "run") as run:
            self.assertFalse(self.run_case()["ok"])
            run.assert_not_called()

    @sources("forwarded_output.cso.py")
    def test_literal_and_default_child_inputs_get_their_own_rows(self):
        self.edit(
            "forwarded_output.cso.py",
            "adjust(amount=amount, increment=increment)",
            "adjust(amount=2)",
        )
        generate(self.root)
        result = self.success(self.run_case())
        self.assertEqual(sum(o["kind"] == "input" for o in result["observations"]), 4)

    @sources("forwarded_output.cso.py")
    def test_unit_mismatch_rejected_before_execution(self):
        self.edit(
            "forwarded_output.cso.py",
            "amount: Amount = 2",
            'amount: Annotated[float, symbol(glyph="Q", description="Amount", unit="cm")] = 2',
        )
        generate(self.root)
        with patch.object(Execution, "run") as run:
            result = self.run_case()
            self.assertEqual(result["diagnostics"][0]["code"], "INPUT_UNIT_MISMATCH")
            run.assert_not_called()

    def test_duplicate_signature_input_metadata_rejected(self):
        self.edit(
            "defaulted_step.cso.py",
            "    adjusted:",
            '    amount: Annotated[float, symbol(glyph="Q", description="Amount", unit="m")] = given(amount)\n    adjusted:',
        )
        result = self.run_case("adjust", amount=2)
        self.assertEqual(result["diagnostics"][0]["code"], "AMBIGUOUS_METADATA")

    def test_source_change_after_capture_does_not_change_execution(self):
        engine = Execution(self.root / "defaulted_step.cso.py", "adjust", {"amount": 2})
        self.edit(
            "defaulted_step.cso.py", "amount + increment", "amount + increment * 100"
        )
        result = engine.response()["execution"]
        self.assertEqual(result["authoring"]["outputs"][0]["value"], 5)

    def test_captured_and_direct_handle_calls_agree(self):
        generate(self.root)
        code = "from _cso_bindings.defaulted_step import adjust; import json,inspect; print(json.dumps(adjust(amount=2))); print(inspect.signature(adjust))"
        result = subprocess.run(
            [sys.executable, "-c", code],
            cwd=self.root,
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertEqual(
            json.loads(result.stdout.splitlines()[0]), {"adjusted": 5, "original": 2}
        )
        self.assertIn("increment: float = 3", result.stdout)

    @sources("forwarded_output.cso.py")
    def test_nested_forwarding_keeps_each_parameter_hop(self):
        (
            self.root / "wrapper.cso.py"
        ).write_text("""from cso_python import calculation, section, CalculationResults
from metadata import Amount, Increment
from _cso_bindings.defaulted_step import adjust
@calculation(id="wrapper", title="Wrapper")
@section(id="wrapper", title="Wrapper")
def wrapper(w: Amount, h: Increment) -> CalculationResults:
    child = adjust(amount=w, increment=h)
    return {"adjusted": child["adjusted"], "original": w}
""")
        self.edit(
            "forwarded_output.cso.py",
            "from _cso_bindings.defaulted_step import adjust",
            "from _cso_bindings.wrapper import wrapper",
        )
        self.edit("forwarded_output.cso.py", "adjust(amount=", "wrapper(w=")
        self.edit("forwarded_output.cso.py", ", increment=increment)", ", h=increment)")
        generate(self.root)
        result = self.success(self.run_case())
        child = next(
            p
            for p in result["authoring"]["parameters"]
            if p["invocationId"] == "root/first/child"
            and p["parameterName"] == "amount"
        )
        self.assertEqual(
            child["origin"],
            {"kind": "parameter", "invocationId": "root/first", "parameterName": "w"},
        )
        self.assertEqual(sum(o["kind"] == "input" for o in result["observations"]), 2)
        symbols = self.symbols(result)
        for parent in ("first", "second"):
            self.assertEqual(
                symbols[f'["symbol","root/{parent}/child","adjusted"]']["glyph"],
                f"R_{{{parent},child}}",
            )

    def test_generated_output_cannot_overwrite_authored_files_or_escape(self):
        output = self.root / "_cso_bindings"
        output.mkdir()
        authored = output / "__init__.py"
        authored.write_text("authored = True\n")
        with self.assertRaises(SourceError):
            generate(self.root)
        self.assertEqual(authored.read_text(), "authored = True\n")
        authored.unlink()
        authored.symlink_to(self.root / "metadata.py")
        with self.assertRaises(SourceError):
            generate(self.root)

    def test_metadata_effects_and_cycles_fail_before_execution(self):
        for content in ('print("effect")', "from metadata import Amount"):
            with self.subTest(content=content):
                (self.root / "metadata.py").write_text(content)
                with patch.object(Execution, "run") as run:
                    result = self.run_case("adjust", amount=2)
                    self.assertFalse(result["ok"])
                    self.assertIn("location", result["diagnostics"][0])
                    run.assert_not_called()

    @sources("forwarded_output.cso.py")
    def test_unknown_missing_arguments_and_inherited_reassignment_fail(self):
        generate(self.root)
        for inputs in ({"wdith": 2}, {}):
            result = self.run_case("adjust", **inputs)
            self.assertFalse(result["ok"])
            self.assertIn("location", result["diagnostics"][0])
        self.edit(
            "defaulted_step.cso.py",
            "    adjusted:",
            '    amount: Annotated[float, symbol(glyph="Q", description="Changed", unit="m")] = amount * 2\n    adjusted:',
        )
        generate(self.root)
        self.assertFalse(self.run_case()["ok"])

    @sources("forwarded_output.cso.py")
    def test_observation_hooks_do_not_repeat_invocations_or_calculations(self):
        import math

        self.edit(
            "defaulted_step.cso.py",
            "from typing import",
            "from math import sqrt\nfrom typing import",
        )
        self.edit(
            "defaulted_step.cso.py", "amount + increment", "sqrt(amount + increment)"
        )
        generate(self.root)
        original = math.sqrt
        with patch("math.sqrt", wraps=original) as sqrt:
            result = self.success(self.run_case(amount=2, increment=2))
            self.assertEqual(sqrt.call_count, 2)
        inputs = [o for o in result["observations"] if o["kind"] == "input"]
        self.assertEqual([o["value"] for o in inputs], [2, 2])
        self.assertNotEqual(inputs[0]["symbolId"], inputs[1]["symbolId"])

    def test_metadata_and_selected_output_changes_invalidate_bindings(self):
        generate(self.root)
        self.edit(
            "metadata.py", 'description="Amount"', 'description="Different amount"'
        )
        self.assertFalse(generate(self.root, check=True)["ok"])
        generate(self.root)
        self.edit(
            "defaulted_step.cso.py", '"original": amount', '"original": increment'
        )
        self.assertFalse(generate(self.root, check=True)["ok"])

    @sources("forwarded_output.cso.py")
    def test_generated_package_initializer_is_captured_and_effects_rejected(self):
        generate(self.root)
        result = self.success(self.run_case())
        self.assertIn(
            "_cso_bindings/__init__.py",
            [m["moduleId"] for m in result["sourceManifest"]],
        )
        (self.root / "_cso_bindings/__init__.py").write_text(
            'print("unexpected effect")'
        )
        with patch.object(Execution, "run") as run:
            self.assertFalse(self.run_case()["ok"])
            run.assert_not_called()

    def symbols(self, result):
        return {
            item["symbol"]["id"]: item["symbol"]
            for section in result["cso"]["sections"]
            for item in section["items"]
            if item["kind"] == "symbol"
        }

    @sources("forwarded_output.cso.py")
    def test_repeated_calls_have_unique_glyphs_and_keep_inherited_inputs(self):
        generate(self.root)
        symbols = self.symbols(self.success(self.run_case()))
        self.assertEqual(len({s["glyph"] for s in symbols.values()}), len(symbols))
        self.assertEqual(
            symbols['["symbol","root/first","adjusted"]']["glyph"], "R_{first}"
        )
        self.assertEqual(
            symbols['["symbol","root/second","adjusted"]']["glyph"], "R_{second}"
        )
        self.assertEqual(symbols['["symbol","root","amount"]']["glyph"], "Q")
        self.assertEqual(symbols['["symbol","root","total"]']["glyph"], "R")
        standalone = self.symbols(self.success(self.run_case("adjust", amount=2)))
        self.assertEqual(standalone['["symbol","root","adjusted"]']["glyph"], "R")

    def test_duplicate_local_glyphs_fail_before_execution_with_both_locations(self):
        self.add_hidden_assignment()
        self.edit("defaulted_step.cso.py", 'glyph="I"', 'glyph="R"')
        with patch.object(Execution, "run") as run:
            result = self.run_case("adjust", amount=2)
            self.assertFalse(result["ok"])
            diagnostic = result["diagnostics"][0]
            self.assertEqual(diagnostic["code"], "DUPLICATE_GLYPH")
            self.assertEqual(diagnostic["location"]["start"]["line"], 13)
            self.assertEqual(diagnostic["relatedLocations"][0]["start"]["line"], 10)
            run.assert_not_called()

    def test_equivalent_glyph_spellings_are_duplicates(self):
        self.add_hidden_assignment()
        path = self.root / "defaulted_step.cso.py"
        original = path.read_text()
        for first, second in [("R_ab", "R_{ab}"), (r"\rho", "ρ"), ("R_a", " R_{a} ")]:
            with self.subTest(first=first, second=second):
                path.write_text(
                    original.replace('glyph="R"', f"glyph={first!r}").replace(
                        'glyph="I"', f"glyph={second!r}"
                    )
                )
                result = self.run_case("adjust", amount=2)
                self.assertFalse(result["ok"])
                self.assertEqual(result["diagnostics"][0]["code"], "DUPLICATE_GLYPH")

    @sources("forwarded_output.cso.py")
    def test_descriptive_call_names_use_compact_scopes_and_keep_full_provenance(self):
        self.edit("forwarded_output.cso.py", "first", "first_panel")
        self.edit("forwarded_output.cso.py", "second", "second_panel")
        generate(self.root)
        symbols = self.symbols(self.success(self.run_case()))
        self.assertEqual(
            symbols['["symbol","root/first_panel","adjusted"]']["glyph"], "R_{fp}"
        )
        self.assertEqual(
            symbols['["symbol","root/second_panel","adjusted"]']["metadata"][
                "glyphScope"
            ],
            "second_panel",
        )

    @sources("forwarded_output.cso.py")
    def test_abbreviation_collisions_fail_before_execution(self):
        self.edit("forwarded_output.cso.py", "first", "first_panel")
        self.edit("forwarded_output.cso.py", "second", "front_panel")
        generate(self.root)
        with patch.object(Execution, "run") as run:
            result = self.run_case()
            self.assertFalse(result["ok"])
            self.assertEqual(result["diagnostics"][0]["code"], "DUPLICATE_GLYPH")
            self.assertIn("location", result["diagnostics"][0])
            self.assertIn("relatedLocations", result["diagnostics"][0])
            run.assert_not_called()

    @sources("forwarded_output.cso.py")
    def test_existing_subscripts_are_preserved_and_collisions_are_not_renumbered(self):
        self.edit("defaulted_step.cso.py", 'glyph="R"', 'glyph="R_{s}"')
        generate(self.root)
        symbols = self.symbols(self.success(self.run_case()))
        self.assertEqual(
            symbols['["symbol","root/first","adjusted"]']["glyph"], "R_{s,first}"
        )
        self.edit("forwarded_output.cso.py", 'glyph="R"', 'glyph="R_{s,first}"')
        generate(self.root)
        result = self.run_case()
        self.assertFalse(result["ok"])
        self.assertEqual(result["diagnostics"][0]["code"], "DUPLICATE_GLYPH")


if __name__ == "__main__":
    unittest.main()
