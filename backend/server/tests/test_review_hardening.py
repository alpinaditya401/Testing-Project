import json
import subprocess
from pathlib import Path
from api_integration import HttpTestCase


class ReviewHardeningTests(HttpTestCase):
    def test_sensor_calendar_range_and_security_headers(self):
        self.login()
        for stamp in ['0000-01-01T00:00:00Z','9999-12-31T23:59:59-12:00']:
            status, _, payload=self.request('POST','/api/devices/AQS-KOLAM-01/readings',
                dict(created_at=stamp,ph=7,temperature=28,turbidity=10),headers={'X-Device-Key':self.device_key})
            self.assertEqual(status,422,payload)
        _, headers, _=self.request('GET','/api/devices')
        policy=headers.get('Content-Security-Policy','')
        self.assertIn("script-src 'self';",policy)
        self.assertNotIn('cdn.jsdelivr',policy)

    def test_register_and_ingestion_local_limits(self):
        for _ in range(10):
            self.assertEqual(self.request('POST','/api/auth/register',{})[0],422)
        status, headers, _=self.request('POST','/api/auth/register',{})
        self.assertEqual(status,429)
        self.assertGreater(int(headers['Retry-After']),0)
        for _ in range(240):
            self.assertEqual(self.request('POST','/api/devices/AQS-KOLAM-01/readings',{})[0],401)
        self.assertEqual(self.request('POST','/api/devices/AQS-KOLAM-01/readings',{})[0],429)

    def test_legacy_rule_checks_emit_parseable_current_contract(self):
        root=Path(__file__).resolve().parents[1]
        for name in ['test_simple_rules.php','test_api_rules.php','test_standalone.php','test_hash.php','minimal_test.php']:
            result=subprocess.run(['php',str(root/name)],cwd=self.tmpdir,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            payload=json.loads(result.stdout)
            self.assertEqual(payload['version'],'threshold-rules-v2')
            self.assertEqual(len(payload['rule']['source_sha256']),64)
