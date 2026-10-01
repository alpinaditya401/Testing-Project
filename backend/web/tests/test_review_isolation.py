"""Safety gate: E2E must never use the project SQLite database."""
from pathlib import Path
import unittest

class E2EIsolationTests(unittest.TestCase):
    def test_comprehensive_suite_uses_explicit_temporary_database(self):
        source=(Path(__file__).parent/'comprehensive_e2e_verify.mjs').read_text(encoding='utf8')
        self.assertIn('AQUASMART_DB_PATH:',source,'E2E currently uses server/data/aquasmart.sqlite: missing DB override')
        self.assertRegex(source,r'AQUASMART_DB_PATH:\s*join\(userDataDir,', 'DB must be inside unique temporary test directory')
        self.assertIn("AQUASMART_APP_ENV: 'test'",source)

if __name__=='__main__': unittest.main()
