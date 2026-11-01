"""Generated binding bytes must remain portable and detect file drift."""

import runpy
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from cso_python.bindings import generate
from cso_python.source import SourceError


class BindingBytesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="cso binding café ")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        source = self.root / "élément" / "café.cso.py"
        source.parent.mkdir()
        source.write_bytes(
            '''from typing import Annotated
from cso_python import CalculationResults, calculation, section, symbol

@calculation(id="area", title="Café area")
@section(id="area", title="Area", root=True)
def calculate(width: Annotated[float, symbol(glyph="w_{pan}", description="Width", unit="m")] = 2) -> CalculationResults:
    area: Annotated[float, symbol(glyph="A_{pan}", description="Area", unit="m^2")] = width * width
    return {"café": area}
'''.encode("utf-8")
        )
        self.output = self.root / "_cso_bindings" / "élément"

    def test_nested_unicode_bindings_are_utf8_lf_and_callable(self):
        self.assertTrue(generate(self.root)["ok"])
        runtime = self.output / "café.py"
        stub = self.output / "café.pyi"
        before = {path: path.read_bytes() for path in (runtime, stub)}
        for content in before.values():
            self.assertNotIn(b"\r", content)
            self.assertFalse(content.startswith(b"\xef\xbb\xbf"))
            self.assertIn("café", content.decode("utf-8"))
        self.assertIn("../../élément/café.cso.py".encode("utf-8"), before[runtime])
        self.assertEqual(runpy.run_path(str(runtime))["calculate"](), {"café": 4})
        self.assertTrue(generate(self.root, check=True)["ok"])
        self.assertTrue(generate(self.root)["ok"])
        self.assertEqual(before, {path: path.read_bytes() for path in before})

    def test_crlf_drift_is_stale_and_regeneration_restores_exact_bytes(self):
        generate(self.root)
        for suffix in (".py", ".pyi"):
            with self.subTest(suffix=suffix):
                path = self.output / f"café{suffix}"
                expected = path.read_bytes()
                changed = expected.replace(b"\n", b"\r\n")
                self.assertNotEqual(changed, expected)
                path.write_bytes(changed)
                checked = generate(self.root, check=True)
                self.assertFalse(checked["ok"])
                self.assertIn(str(path.relative_to(self.root)), checked["stale"])
                self.assertEqual(path.read_bytes(), changed)
                self.assertTrue(generate(self.root)["ok"])
                self.assertEqual(path.read_bytes(), expected)
                self.assertTrue(generate(self.root, check=True)["ok"])

    def test_non_utf8_authored_file_is_preserved(self):
        generate(self.root)
        path = self.output / "café.py"
        authored = b"# Authored file\n\xff\n"
        path.write_bytes(authored)
        self.assertFalse(generate(self.root, check=True)["ok"])
        with self.assertRaises(SourceError) as raised:
            generate(self.root)
        self.assertEqual(raised.exception.diagnostic["code"], "BINDING_OUTPUT_CONFLICT")
        self.assertEqual(path.read_bytes(), authored)

    def test_module_package_collisions_fail_before_writing_in_both_modes(self):
        source = self.root / "élément" / "café.cso.py"
        content = source.read_bytes()
        for module, child in (
            ("sample.cso.py", "sample/child.cso.py"),
            ("group/sample.cso.py", "group/sample/child.cso.py"),
        ):
            with self.subTest(module=module):
                calculation = self.root / module
                nested = self.root / child
                calculation.parent.mkdir(parents=True, exist_ok=True)
                nested.parent.mkdir(parents=True, exist_ok=True)
                calculation.write_bytes(content)
                nested.write_bytes(content)
                for check in (False, True):
                    with self.assertRaises(SourceError) as raised:
                        generate(self.root, check=check)
                    diagnostic = raised.exception.diagnostic
                    self.assertEqual(diagnostic["code"], "BINDING_OUTPUT_CONFLICT")
                    self.assertIn(str(Path(module)), diagnostic["message"])
                    self.assertIn(str(Path(child)), diagnostic["message"])
                    self.assertFalse((self.root / "_cso_bindings").exists())
                calculation.unlink()
                nested.unlink()

    def test_collision_preserves_valid_output_and_valid_imports(self):
        source = self.root / "élément" / "café.cso.py"
        flat = self.root / "sample.cso.py"
        flat.write_bytes(source.read_bytes())
        generate(self.root)
        output = self.root / "_cso_bindings"
        saved = {
            p.relative_to(output): p.read_bytes()
            for p in output.rglob("*") if p.is_file()
        }
        # Resolve through Python's import machinery, rather than reading stub text.
        result = subprocess.run(
            [
                sys.executable, "-c",
                "from _cso_bindings.sample import calculate; "
                "from _cso_bindings.élément.café import calculate as nested; "
                "assert calculate(width=3) == nested(width=3) == {'café': 9}",
            ],
            cwd=self.root,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        nested = self.root / "sample" / "child.cso.py"
        nested.parent.mkdir()
        nested.write_bytes(source.read_bytes())
        for check in (False, True):
            with self.assertRaises(SourceError):
                generate(self.root, check=check)
            current = {
                p.relative_to(output): p.read_bytes()
                for p in output.rglob("*")
                if p.is_file() and "__pycache__" not in p.parts
            }
            self.assertEqual(current, saved)


if __name__ == "__main__":
    unittest.main()
