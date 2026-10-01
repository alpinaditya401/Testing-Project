"""Boundary contract tests; this does not claim live endpoint integration."""
import json
from pathlib import Path
import subprocess
import unittest


class ProductPolicyTests(unittest.TestCase):
    def test_product_calculation_boundaries(self):
        app = Path(__file__).resolve().parents[2]
        result = subprocess.run(['php', 'server/tests/product_policy.php'], cwd=app,
                                capture_output=True, text=True, encoding='utf-8', timeout=15)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        report = json.loads(result.stdout)
        self.assertGreaterEqual(len(report['checks']), 40)
        self.assertTrue(report['passed'])
        for check in report['checks']:
            with self.subTest(check=check['name']):
                self.assertTrue(check['pass'])


if __name__ == '__main__':
    unittest.main()
