"""Generated binding bytes must remain portable and detect file drift."""

import runpy
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


if __name__ == "__main__":
    unittest.main()
