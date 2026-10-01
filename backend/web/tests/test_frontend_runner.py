"""The isolated regression inventory must include calendar integration."""
import ast
from pathlib import Path
import unittest


class FrontendRunnerTests(unittest.TestCase):
    def test_calendar_suites_are_in_full_frontend_runner(self):
        tree = ast.parse((Path(__file__).parent / 'verify_frontend_fixes.py').read_text(encoding='utf-8'))
        names = next(ast.literal_eval(node.value) for node in tree.body
                     if isinstance(node, ast.Assign)
                     and any(isinstance(target, ast.Name) and target.id == 'names' for target in node.targets))
        self.assertIn('calendar_reports', names)
        self.assertIn('calendar_states', names)
        self.assertEqual(len(names), len(set(names)), 'Every suite should run exactly once')


if __name__ == '__main__':
    unittest.main()
