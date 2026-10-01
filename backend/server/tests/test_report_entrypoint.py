"""Regression for the old report entry point: importing must never start a server."""
from pathlib import Path
import runpy
import subprocess
import unittest
from unittest.mock import patch


class ReportEntrypointTests(unittest.TestCase):
    def load_entrypoint(self):
        with patch('subprocess.Popen', side_effect=AssertionError('Import must not launch a process')):
            return runpy.run_path(str(Path(__file__).with_name('run_report_test.py')))

    def test_import_does_not_launch_or_attach_to_server(self):
        namespace = self.load_entrypoint()
        self.assertTrue(callable(namespace.get('main')))

    def test_legacy_launcher_preserves_child_failure_exit_code(self):
        namespace = self.load_entrypoint()
        with patch('subprocess.run', return_value=subprocess.CompletedProcess([], 7)) as run:
            self.assertEqual(namespace['main'](), 7)
        args = run.call_args.args[0]
        self.assertEqual(args[1], '-B')
        self.assertEqual(Path(args[2]).name, 'test_reports.py')


if __name__ == '__main__':
    unittest.main(verbosity=2)
