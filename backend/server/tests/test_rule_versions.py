from api_integration import HttpTestCase


class RuleVersionTests(HttpTestCase):
    def test_applied_threshold_versions_are_persisted_and_idempotent(self):
        self.assertEqual(self.request('GET','/api/rule-versions')[0],401)
        user=self.login()
        self.assertEqual(self.request('GET','/api/rule-versions')[2]['versions'],[])
        reading=dict(created_at='2020-01-01T12:00:00Z',ph=7,temperature=28,turbidity=10,simulation=True)
        for _ in range(2):
            self.assertEqual(self.request('POST','/api/devices/AQS-KOLAM-01/readings',reading,headers={'X-Device-Key':self.device_key})[0],201)
        first=self.request('GET','/api/rule-versions')[2]['versions']
        self.assertEqual(len(first),1)
        self.assertEqual(first[0]['reading_count'],1)
        thresholds=dict(ph_min=6,ph_max=9,temperature_min=24,temperature_max=31,turbidity_max=45)
        self.assertEqual(self.request('PATCH','/api/settings/thresholds',thresholds,headers={'X-CSRF-Token':user['csrf_token']})[0],200)
        reading['created_at']='2020-01-01T13:00:00Z'
        self.assertEqual(self.request('POST','/api/devices/AQS-KOLAM-01/readings',reading,headers={'X-Device-Key':self.device_key})[0],201)
        versions=self.request('GET','/api/rule-versions')[2]['versions']
        self.assertEqual(len(versions),2)
        self.assertIn(thresholds,[v['config'] for v in versions])
        self.assertEqual(sum(v['reading_count'] for v in versions),2)
        self.new_client()
        self.request('POST','/api/auth/register',dict(name='Isolated',contact='isolated@example.com',password='Ephemeral123!',password_confirmation='Ephemeral123!'))
        self.assertEqual(self.request('GET','/api/rule-versions')[2]['versions'],[])
