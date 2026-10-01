"""Run the maintained backend suites once per declared test, without scratch scripts.

Every HTTP fixture owns a temporary database/process. The compatibility
report launcher is covered by test_report_entrypoint without duplicating tests.
"""
from pathlib import Path
from datetime import datetime
import importlib
import inspect
import json
import subprocess
import sys
import unittest


def main():
    app = Path(__file__).resolve().parents[2]
    output = app / 'test-output' / ('backend-regression-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
    output.mkdir(parents=True, exist_ok=False)
    modules = ['api_integration', 'test_workspace', 'test_monitoring',
               'test_operations', 'test_command_http', 'test_growth',
               'test_security_review', 'test_reports', 'test_report_entrypoint',
               'test_simulator_validation', 'test_completion_validation', 'test_seed_local',
               'test_device_lifecycle', 'test_operability', 'test_export', 'test_rule_versions', 'test_review_hardening', 'test_hardware_api', 'test_provenance_migration', 'test_provenance_outputs']
    modules.append('test_threshold_contract')
    modules.append('test_product_policy')
    modules.append('test_product_api')
    checks = []
    for path in (app / 'server').rglob('*.php'):
        result = subprocess.run(['php', '-l', str(path)], capture_output=True, text=True)
        checks.append({'path': str(path.relative_to(app)), 'exit_code': result.returncode,
                       'output': result.stdout + result.stderr})
    suite = unittest.TestSuite()
    names = []
    for module_name in modules:
        module = importlib.import_module(module_name)
        for _, cls in inspect.getmembers(module, inspect.isclass):
            if cls.__module__ != module_name or not issubclass(cls, unittest.TestCase):
                continue
            # Inherited workspace tests already run in WorkspaceTests. This
            # excludes duplicates, not distinct test functions or assertions.
            for method in sorted(name for name in cls.__dict__ if name.startswith('test_')):
                test = cls(method)
                names.append(test.id())
                suite.addTest(test)
    if not names or len(names) != len(set(names)):
        raise RuntimeError('Missing or duplicate test identities')
    with (output / 'tests.log').open('w', encoding='utf-8') as log:
        result = unittest.TextTestRunner(stream=log, verbosity=2).run(suite)
    report = {'tests_run': result.testsRun, 'planned_tests': len(names), 'test_ids': names,
              'failures': [(test.id(), text) for test, text in result.failures],
              'errors': [(test.id(), text) for test, text in result.errors],
              'skipped': [(test.id(), text) for test, text in result.skipped],
              'php_lint': checks}
    (output / 'results.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    passed = result.wasSuccessful() and result.testsRun == len(names) and not result.skipped and all(x['exit_code'] == 0 for x in checks)
    print(json.dumps({'passed': passed, 'tests_run': result.testsRun, 'planned_tests': len(names),
                      'failures': len(result.failures), 'errors': len(result.errors),
                      'skipped': len(result.skipped), 'php_files_checked': len(checks),
                      'output': output.as_posix()}, indent=2))
    if not passed:
        print((output / 'tests.log').read_text(encoding='utf-8'))
    return 0 if passed else 1


if __name__ == '__main__':
    sys.exit(main())
