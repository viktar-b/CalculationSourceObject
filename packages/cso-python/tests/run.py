"""Run the package-local Python suite using the selected installed package."""

import unittest
from pathlib import Path

if __name__ == "__main__":
    suite = unittest.TestLoader().discover(
        str(Path(__file__).resolve().parent), pattern="test_*.py"
    )
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
