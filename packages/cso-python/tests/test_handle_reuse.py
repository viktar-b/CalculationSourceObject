from __future__ import annotations

import builtins
import multiprocessing
import os
import pickle
import runpy
import shutil
import sys
import tempfile
import threading
import time
import unittest
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

from cso_python.bindings import generate
from cso_python.execution import Execution
from cso_python.handles import CalculationHandle
from cso_python.source import SourceError


def run_handle(payload):
    handle, inputs = payload
    return handle(**inputs)


class LabeledCalculationHandle(CalculationHandle):
    __slots__ = ("label",)

    def __init__(self, path: Path, label: str):
        super().__init__(path, "adjust", None)
        self.label = label


class CalculationHandleReuseTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="cso-handle-reuse-")
        self.root = Path(self.temp.name)
        fixture = Path(__file__).parent / "fixtures/authoring-api"
        for name in (
            "metadata.py",
            "defaulted_step.cso.py",
            "forwarded_output.cso.py",
        ):
            shutil.copy(fixture / name, self.root / name)
        generate(self.root)
        sys.path.insert(0, str(self.root))
        self.addCleanup(self._restore_imports)
        self.addCleanup(self.temp.cleanup)

    def _restore_imports(self):
        sys.path.remove(str(self.root))
        for name in list(sys.modules):
            if name == "_cso_bindings" or name.startswith("_cso_bindings."):
                del sys.modules[name]

    def handle(self, module: str, function: str):
        namespace = runpy.run_path(self.root / "_cso_bindings" / f"{module}.py")
        return namespace[function]

    def edit(self, name: str, before: str, after: str):
        path = self.root / name
        source = path.read_text()
        self.assertIn(before, source)
        path.write_text(source.replace(before, after))

    def assert_run_state_matches(self, actual: Execution, expected: Execution):
        self.assertEqual(actual.observations, expected.observations)
        self.assertEqual(
            [inv.record for inv in actual.planner.invocations],
            [inv.record for inv in expected.planner.invocations],
        )
        self.assertEqual(
            [inv.output_records for inv in actual.planner.invocations],
            [inv.output_records for inv in expected.planner.invocations],
        )
        self.assertEqual(actual.planner.sections, expected.planner.sections)

    def test_reuses_execution_and_refreshes_complete_run_evidence(self):
        handle = self.handle("defaulted_step", "adjust")
        self.assertEqual(handle(amount=2), {"adjusted": 5, "original": 2})
        execution = handle._execution

        self.assertEqual(handle(amount=5), {"adjusted": 8, "original": 5})
        self.assertIs(handle._execution, execution)

        fresh = Execution(self.root / "defaulted_step.cso.py", "adjust", {"amount": 5})
        fresh.run_root({"amount": 5})
        self.assert_run_state_matches(handle._execution, fresh)
        binding = handle._execution.root.record["inputBindings"][0]
        self.assertEqual(binding, {**binding, "value": 5})
        input_symbol = handle._execution.root.parameter_symbols["amount"]
        self.assertEqual(
            input_symbol.cso["valueTree"]["nodes"][0]["literal"]["value"], 5
        )

    def test_reuse_refreshes_legacy_given_input_literals(self):
        (self.root / "legacy.cso.py").write_text(
            """from typing import Annotated
from cso_python import calculation, section, symbol, given

@calculation(id="legacy", title="Legacy input")
@section(id="legacy", title="Legacy input", root=True)
def calculate(amount: float):
    supplied: Annotated[float, symbol(glyph="Q_{in}", description="Input", unit="m")] = given(amount)
    doubled: Annotated[float, symbol(glyph="Q_{out}", description="Output", unit="m")] = supplied * 2
    return {"doubled": doubled}
"""
        )
        generate(self.root)
        handle = self.handle("legacy", "calculate")
        self.assertEqual(handle(amount=2), {"doubled": 4})
        execution = handle._execution
        self.assertEqual(handle(amount=5), {"doubled": 10})
        self.assertIs(handle._execution, execution)
        symbol = execution.root.parameter_symbols["amount"]
        self.assertEqual(symbol.cso["valueTree"]["nodes"][0]["literal"]["value"], 5)

    def test_rebuilds_for_input_shape_and_captured_source_changes(self):
        defaulted = self.handle("defaulted_step", "adjust")
        defaulted(amount=2)
        omitted_default = defaulted._execution
        defaulted(amount=2, increment=3)
        self.assertIsNot(defaulted._execution, omitted_default)
        supplied_default = defaulted._execution
        defaulted(amount=4, increment=3)
        self.assertIs(defaulted._execution, supplied_default)

        forwarded = self.handle("forwarded_output", "forward")
        self.assertEqual(forwarded(amount=2), {"total": 10})
        original = forwarded._execution
        source = self.root / "defaulted_step.cso.py"
        source_stat = source.stat()
        self.edit(
            "defaulted_step.cso.py",
            "amount + increment",
            "amount * increment",
        )
        os.utime(source, ns=(source_stat.st_atime_ns, source_stat.st_mtime_ns))
        self.assertEqual(source.stat().st_size, source_stat.st_size)
        self.assertEqual(source.stat().st_mtime_ns, source_stat.st_mtime_ns)
        self.assertEqual(forwarded(amount=2), {"total": 12})
        self.assertIsNot(forwarded._execution, original)

        changed_source = forwarded._execution
        binding = self.root / "_cso_bindings/defaulted_step.py"
        binding.write_text(binding.read_text() + "# changed binding bytes\n")
        self.assertEqual(forwarded(amount=2), {"total": 12})
        self.assertIsNot(forwarded._execution, changed_source)

    def test_nested_reuse_matches_a_fresh_execution(self):
        handle = self.handle("forwarded_output", "forward")
        self.assertEqual(handle(amount=2), {"total": 10})
        execution = handle._execution
        self.assertEqual(handle(amount=5), {"total": 16})
        self.assertIs(handle._execution, execution)

        fresh = Execution(
            self.root / "forwarded_output.cso.py", "forward", {"amount": 5}
        )
        fresh.run_root({"amount": 5})
        self.assert_run_state_matches(execution, fresh)

    def test_warm_handle_rechecks_the_generated_fingerprint(self):
        handle = self.handle("defaulted_step", "adjust")
        self.assertEqual(handle(amount=2), {"adjusted": 5, "original": 2})
        self.edit("metadata.py", 'description="Amount"', 'description="Changed"')

        with self.assertRaises(SourceError) as raised:
            handle(amount=2)
        self.assertEqual(raised.exception.diagnostic["code"], "STALE_BINDINGS")
        self.assertIsNone(handle._execution)

    def test_rebuilds_when_a_dependency_symlink_retargets(self):
        metadata = self.root / "metadata.py"
        first = self.root / "metadata-first.py"
        second = self.root / "metadata-second.py"
        metadata.rename(first)
        shutil.copy(first, second)
        metadata.symlink_to(first.name)
        generate(self.root)

        handle = self.handle("defaulted_step", "adjust")
        self.assertEqual(handle(amount=2), {"adjusted": 5, "original": 2})
        original = handle._execution
        metadata.unlink()
        metadata.symlink_to(second.name)
        self.assertEqual(handle(amount=2), {"adjusted": 5, "original": 2})
        self.assertIsNot(handle._execution, original)

    def test_rebuilds_when_the_entry_symlink_retargets(self):
        first = self.root / "entry_first.cso.py"
        second = self.root / "entry_second.cso.py"
        linked = self.root / "entry.cso.py"
        shutil.copy(self.root / "defaulted_step.cso.py", first)
        shutil.copy(first, second)
        source = second.read_text().replace("amount + increment", "amount * increment")
        second.write_text(source)
        linked.symlink_to(first.name)
        generate(self.root)

        handle = self.handle("entry", "adjust")
        self.assertEqual(handle(amount=2), {"adjusted": 5, "original": 2})
        original = handle._execution
        linked.unlink()
        linked.symlink_to(second.name)
        self.assertEqual(handle(amount=2), {"adjusted": 6, "original": 2})
        self.assertIsNot(handle._execution, original)

    def test_rebuilds_for_changed_or_missing_assets(self):
        asset = self.root / "diagram.svg"
        asset.write_text('<svg xmlns="http://www.w3.org/2000/svg"/>\n')
        (self.root / "figure.cso.py").write_text(
            """from typing import Annotated
from cso_python import calculation, section, symbol, figure

@calculation(id="figure", title="Figure")
@section(id="figure", title="Figure", root=True)
def calculate(amount: Annotated[float, symbol(glyph="Q_{in}", description="Input", unit="m")]):
    figure(id="diagram", path="diagram.svg", media_type="image/svg+xml", caption="Diagram", alt="Diagram")
    doubled: Annotated[float, symbol(glyph="Q_{out}", description="Output", unit="m")] = amount * 2
    return {"doubled": doubled}
"""
        )
        generate(self.root)
        handle = self.handle("figure", "calculate")
        self.assertEqual(handle(amount=2), {"doubled": 4})
        original = handle._execution

        asset.write_text('<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>\n')
        self.assertEqual(handle(amount=2), {"doubled": 4})
        self.assertIsNot(handle._execution, original)

        asset.unlink()
        with self.assertRaises(SourceError) as raised:
            handle(amount=2)
        self.assertEqual(raised.exception.diagnostic["code"], "INVALID_ASSET_PATH")
        asset.write_text('<svg xmlns="http://www.w3.org/2000/svg"><circle/></svg>\n')
        self.assertEqual(handle(amount=3), {"doubled": 6})

    def test_failed_calls_do_not_poison_later_calls(self):
        self.edit("defaulted_step.cso.py", "amount + increment", "amount / increment")
        generate(self.root)
        handle = self.handle("defaulted_step", "adjust")
        self.assertEqual(handle(amount=4, increment=2), {"adjusted": 2, "original": 4})

        with self.assertRaises(SourceError) as raised:
            handle(amount=4, increment=0)
        self.assertEqual(raised.exception.diagnostic["code"], "EXECUTION_FAILED")
        self.assertIsNone(handle._execution)
        self.assertEqual(handle(amount=6, increment=2), {"adjusted": 3, "original": 6})

        with self.assertRaises(SourceError) as raised:
            handle(amount=True, increment=2)
        self.assertEqual(raised.exception.diagnostic["code"], "UNSUPPORTED_RESULT")
        self.assertEqual(raised.exception.diagnostic["stage"], "usage")

    def test_interrupted_module_initialization_does_not_leave_a_partial_cache(self):
        handle = self.handle("defaulted_step", "adjust")
        original = builtins.exec
        interrupted = False

        def interrupt_once(code, globals, locals=None):
            nonlocal interrupted
            if globals.get("__name__") == "_cso_captured_module" and not interrupted:
                interrupted = True
                raise KeyboardInterrupt
            return original(code, globals, locals)

        with patch("builtins.exec", interrupt_once):
            with self.assertRaises(KeyboardInterrupt):
                handle(amount=2)
        self.assertIsNone(handle._execution)
        self.assertEqual(handle(amount=3), {"adjusted": 6, "original": 3})

    def test_concurrent_calls_do_not_share_mutable_run_state(self):
        handle = self.handle("defaulted_step", "adjust")
        active = 0
        maximum = 0
        state_lock = threading.Lock()
        original = Execution._run

        def overlap(execution, invocation, inputs):
            nonlocal active, maximum
            if invocation.parent is not None:
                return original(execution, invocation, inputs)
            with state_lock:
                active += 1
                maximum = max(maximum, active)
            time.sleep(0.01)
            try:
                return original(execution, invocation, inputs)
            finally:
                with state_lock:
                    active -= 1

        with patch.object(Execution, "_run", overlap):
            with ThreadPoolExecutor(max_workers=8) as executor:
                results = list(executor.map(lambda value: handle(amount=value), range(8)))

        self.assertEqual(
            results,
            [{"adjusted": value + 3, "original": value} for value in range(8)],
        )
        self.assertEqual(maximum, 1)

    def test_cold_and_warm_handles_survive_pickle_roundtrips(self):
        cold = self.handle("defaulted_step", "adjust")
        restored_cold = pickle.loads(pickle.dumps(cold))
        self.assertEqual(restored_cold(amount=2), {"adjusted": 5, "original": 2})

        warm = self.handle("defaulted_step", "adjust")
        self.assertEqual(warm(amount=2), {"adjusted": 5, "original": 2})
        execution = warm._execution
        serialized_warm = pickle.dumps(warm)
        self.assertIs(warm._execution, execution)
        restored_warm = pickle.loads(serialized_warm)
        self.assertEqual(restored_warm(amount=5), {"adjusted": 8, "original": 5})

        labeled = LabeledCalculationHandle(cold.path, "worker")
        self.assertEqual(labeled(amount=3), {"adjusted": 6, "original": 3})
        restored_labeled = pickle.loads(pickle.dumps(labeled))
        self.assertEqual(restored_labeled.label, "worker")
        self.assertEqual(
            restored_labeled(amount=6), {"adjusted": 9, "original": 6}
        )

    def test_restored_handle_reads_current_source_and_checks_fingerprint(self):
        handle = self.handle("defaulted_step", "adjust")
        self.assertEqual(handle(amount=2), {"adjusted": 5, "original": 2})
        serialized = pickle.dumps(handle)
        self.edit("defaulted_step.cso.py", "amount + increment", "amount * increment")
        restored = pickle.loads(serialized)
        self.assertEqual(restored(amount=2), {"adjusted": 6, "original": 2})

        serialized = pickle.dumps(restored)
        self.edit("metadata.py", 'description="Amount"', 'description="Changed"')
        restored = pickle.loads(serialized)
        with self.assertRaises(SourceError) as raised:
            restored(amount=2)
        self.assertEqual(raised.exception.diagnostic["code"], "STALE_BINDINGS")

    def test_handles_run_in_a_spawned_process_pool(self):
        cold = self.handle("defaulted_step", "adjust")
        warm = self.handle("defaulted_step", "adjust")
        self.assertEqual(warm(amount=2), {"adjusted": 5, "original": 2})

        context = multiprocessing.get_context("spawn")
        with ProcessPoolExecutor(max_workers=1, mp_context=context) as executor:
            results = list(
                executor.map(
                    run_handle,
                    [(cold, {"amount": 4}), (warm, {"amount": 7})],
                )
            )
        self.assertEqual(
            results,
            [
                {"adjusted": 7, "original": 4},
                {"adjusted": 10, "original": 7},
            ],
        )


if __name__ == "__main__":
    unittest.main()
