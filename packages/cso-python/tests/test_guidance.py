from __future__ import annotations

from importlib.metadata import version
from importlib.resources import files
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest


class InstalledGuidanceTest(unittest.TestCase):
    def run_guide(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, '-I', '-X', 'utf8', '-m', 'cso_python', 'authoring', *args],
            text=True, encoding='utf-8', capture_output=True, check=False,
        )

    def test_installed_contract_prints_and_exports_without_checkout_links(self) -> None:
        result = self.run_guide()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(f'cs-object {version("cs-object")}', result.stdout)
        canonical = files('cso_python').joinpath('authoring.md').read_text(encoding='utf-8')
        self.assertTrue(result.stdout.endswith(canonical))
        for target in re.findall(r'\]\(([^)]+)\)', canonical):
            self.assertTrue(target.startswith(('https://', '#')), target)
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / 'installed guide é.md'
            exported = self.run_guide('--out', str(destination))
            self.assertEqual(exported.returncode, 0, exported.stderr)
            self.assertEqual(exported.stdout, '')
            self.assertEqual(destination.read_bytes(), result.stdout.encode('utf-8'))
            destination.write_text('stale copy', encoding='utf-8')
            self.assertEqual(self.run_guide('--out', str(destination)).returncode, 0)
            self.assertEqual(destination.read_bytes(), result.stdout.encode('utf-8'))

    def test_unwritable_destination_reports_failure(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result = self.run_guide('--out', directory)
        self.assertEqual(result.returncode, 1)
        self.assertIn('error:', result.stderr)
        self.assertEqual(result.stdout, '')
