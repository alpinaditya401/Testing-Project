import unittest, os
from test_workspace import WorkspaceTests

class CommandHttpTests(WorkspaceTests):
    def test_cli_failure_and_timeout_outcomes(self):
        import subprocess, sys, sqlite3
        from contextlib import closing
        from api_integration import ROOT
        user=self.login();headers={'X-CSRF-Token':user['csrf_token']}
        for outcome in ('failed','timeout'):
            status,_,body=self.request('POST','/api/devices/AQS-KOLAM-01/control',
                {'actuator':'feeder','value':True,'duration':1,'request_id':'outcome-'+outcome},headers=headers)
            self.assertEqual(status,200)
            result=subprocess.run([sys.executable,'server/simulator_device.py','--base-url',self.base_url,
                '--device-id','AQS-KOLAM-01','--once','--outcome',outcome],cwd=ROOT,
                env={**os.environ,'AQUASMART_DEVICE_KEY':self.device_key},capture_output=True,text=True,timeout=10)
            self.assertEqual(result.returncode,0,result.stderr)
            if outcome=='timeout':
                with closing(sqlite3.connect(self.tmpdir/'test.sqlite')) as db:
                    db.execute('UPDATE actuator_commands SET expires_at=0 WHERE id=?',(body['command']['id'],));db.commit()
                expired=subprocess.run(['php','server/operations_tick.php'],cwd=ROOT,
                    env={**os.environ,'AQUASMART_DB_PATH':str(self.tmpdir/'test.sqlite'),
                         'AQUASMART_APP_ENV':'test','AQUASMART_SIMULATOR_ENABLED':'1'},capture_output=True,text=True)
                self.assertEqual(expired.returncode,0,expired.stderr)
            logs=self.request('GET','/api/devices/AQS-KOLAM-01/feeding-logs')[2]['feeding_logs']
            self.assertEqual(next(row for row in logs if row['id']==body['command']['id'])['status'],outcome)

    @classmethod
    def setUpClass(cls):
        cls.old_sim=os.environ.get('AQUASMART_SIMULATOR_ENABLED');os.environ['AQUASMART_SIMULATOR_ENABLED']='1'
        super().setUpClass()
        if cls.old_sim is None:os.environ.pop('AQUASMART_SIMULATOR_ENABLED',None)
        else:os.environ['AQUASMART_SIMULATOR_ENABLED']=cls.old_sim

    def test_http_command_delivery_and_ack(self):
        user=self.login();h={'X-CSRF-Token':user['csrf_token']};device='AQS-KOLAM-01'
        payload={'actuator':'feeder','value':True,'request_id':'http-r1','duration':8}
        status,_,body=self.request('POST',f'/api/devices/{device}/control',payload,headers=h)
        self.assertEqual(status,200,body);self.assertIn('command',body);cmd=body['command']
        self.assertEqual(self.request('POST',f'/api/devices/{device}/control',payload,headers=h)[2]['command']['id'],cmd['id'])
        self.assertEqual(self.request('GET',f'/api/simulator/devices/{device}/commands')[0],401)
        key={'X-Device-Key':self.device_key}
        rows=self.request('GET',f'/api/simulator/devices/{device}/commands',headers=key)[2]['commands']
        self.assertEqual(rows[0]['id'],cmd['id']);self.assertTrue(rows[0]['simulation'])
        self.assertEqual(self.request('POST',f'/api/simulator/devices/{device}/commands/{cmd["id"]}/ack',{'status':'succeeded'},headers=key)[0],200)
        logs=self.request('GET',f'/api/devices/{device}/feeding-logs')[2]['feeding_logs'];self.assertEqual(logs[0]['status'],'succeeded')
        self.assertEqual(self.request('GET',f'/api/simulator/devices/{device}/commands',headers=key)[2]['commands'],[])

    def test_simulator_cli_and_scheduler_use_explicit_temporary_db(self):
        import subprocess, sys
        user=self.login();h={'X-CSRF-Token':user['csrf_token']}
        device='AQS-KOLAM-01'
        self.assertEqual(self.request('POST',f'/api/devices/{device}/control',{'actuator':'feeder','value':True,'duration':1,'request_id':'cli-test'},headers=h)[0],200)
        result=subprocess.run([sys.executable,'server/simulator_device.py','--base-url',__import__('api_integration').BASE_URL,'--device-id',device,'--once'],cwd=__import__('api_integration').ROOT,env={**os.environ,'AQUASMART_DEVICE_KEY':self.device_key},capture_output=True,text=True,timeout=10)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertEqual(self.request('GET',f'/api/devices/{device}/feeding-logs')[2]['feeding_logs'][0]['status'],'succeeded')
        env={**os.environ,'AQUASMART_APP_ENV':'test','AQUASMART_SIMULATOR_ENABLED':'1','AQUASMART_DB_PATH':str(self.tmpdir/'test.sqlite')}
        result=subprocess.run(['php','server/operations_tick.php'],cwd=__import__('api_integration').ROOT,env=env,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        env.pop('AQUASMART_DB_PATH')
        refused=subprocess.run(['php','server/operations_tick.php'],cwd=__import__('api_integration').ROOT,env=env,capture_output=True,text=True)
        self.assertNotEqual(refused.returncode,0)

if __name__=='__main__':unittest.main(verbosity=2)
