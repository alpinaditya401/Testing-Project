import unittest
from test_workspace import WorkspaceTests

class GrowthTests(WorkspaceTests):
    def test_growth_create_read_delete_and_validation(self):
        user=self.login();h={'X-CSRF-Token':user['csrf_token']}
        payload={'device_id':'AQS-KOLAM-01','observed_at':'2026-09-12','weight_g':125.5,'length_cm':18,'notes':'Sampel manual, bukan sensor.'}
        self.assertEqual(self.request('POST','/api/growth-observations',payload)[0],403)
        status,_,body=self.request('POST','/api/growth-observations',payload,headers=h)
        self.assertEqual(status,201,body); oid=body['observation']['id']
        rows=self.request('GET','/api/growth-observations')[2]['observations']
        self.assertEqual(rows[0]['weight_g'],125.5);self.assertEqual(rows[0]['notes'],payload['notes'])
        for field,value in [('weight_g',-1),('length_cm',-2),('observed_at','2026-02-31')]:
            self.assertEqual(self.request('POST','/api/growth-observations',{**payload,field:value},headers=h)[0],422)
        self.assertEqual(self.request('DELETE',f'/api/growth-observations/{oid}',headers=h)[0],200)
        self.assertEqual(self.request('GET','/api/growth-observations')[2]['observations'],[])
        actions=[x['action'] for x in self.request('GET','/api/audit-logs')[2]['audit_logs']]
        self.assertIn('growth.created',actions);self.assertIn('growth.deleted',actions)

    def test_growth_viewer_and_unowned_device(self):
        owner,client,viewer,invite=self.invite_viewer()
        payload={'device_id':'AQS-KOLAM-01','observed_at':'2026-09-12','notes':'Manual'}
        self.assertEqual(self.request('POST','/api/growth-observations',payload,headers={'X-CSRF-Token':viewer['csrf_token']})[0],403)
        self.new_client();user=self.register('other@example.com')
        self.assertEqual(self.request('POST','/api/growth-observations',payload,headers={'X-CSRF-Token':user['csrf_token']})[0],404)

if __name__=='__main__':unittest.main(verbosity=2)
