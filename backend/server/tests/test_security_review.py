import unittest
from test_workspace import WorkspaceTests

class SecurityReviewTests(WorkspaceTests):
    def test_json_shape_and_api_cache_headers(self):
        self.assertEqual(self.request('POST','/api/auth/login',[])[0],400)
        self.assertEqual(self.request('POST','/api/auth/login',{'username':['bad'],'password':'x'})[0],422)
        user=self.login();status,headers,_=self.request('GET','/api/devices')
        self.assertEqual(status,200);self.assertIn('no-store',headers.get('Cache-Control',''))
    def test_public_login_rate_limit(self):
        statuses=[self.request('POST','/api/auth/login',{'username':'missing','password':'invalid'})[0] for _ in range(31)]
        self.assertEqual(statuses[-1],429)
    def test_timestamp_must_be_actual_iso8601(self):
        self.login();h={'X-Device-Key':self.device_key};p={'ph':7,'temperature':28,'turbidity':20,'simulation':True}
        for date in ['tomorrow','2026-02-31T10:00:00Z','not-a-date']:
            self.assertEqual(self.request('POST','/api/devices/AQS-KOLAM-01/readings',{**p,'created_at':date},headers=h)[0],422)

if __name__=='__main__':unittest.main(verbosity=2)
