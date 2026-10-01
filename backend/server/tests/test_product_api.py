from contextlib import closing
import json
import os
import sqlite3
import subprocess
import tempfile
import unittest
from pathlib import Path
from test_workspace import WorkspaceTests

# Anchor every subprocess to the app root. Without this the suite only
# passes when it happens to be launched from 01_Aplikasi-Web/, and fails
# with "Could not open input file" from anywhere else.
APP = Path(__file__).resolve().parents[2]


class ProductApiTests(WorkspaceTests):
    def worker(self,owner,serial,code,now=None):
        env={**os.environ,'AQUASMART_DB_PATH':str(self.tmpdir/'test.sqlite')}
        args=['php','server/tests/product_claim_worker.php']
        return args,env,json.dumps({'owner':owner,'serial':serial,'code':code,'now':now})

    def test_concurrent_claims_and_exact_expiry(self):
        seller,headers,unit=self.prepare('PRODUCT-RACE')
        self.new_client();other=self.register('race-product@example.test')
        requests=[self.worker(user['user']['id'],'PRODUCT-RACE',unit['activation_code']) for user in [seller,other]]
        processes=[subprocess.Popen(args,env=env,cwd=APP,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for args,env,_ in requests]
        for process,(_,_,data) in zip(processes,requests):process.stdin.write(data);process.stdin.close();process.stdin=None
        results=[]
        for process in processes:
            out,err=process.communicate(timeout=20);self.assertEqual(process.returncode,0,err);results.append(json.loads(out))
        self.assertEqual(sum(r['ok'] for r in results),1,results)
        self.assertEqual([r['error'] for r in results if not r['ok']],['activation_used'])
        seller,headers,expired=self.prepare('PRODUCT-BOUNDARY')
        args,env,data=self.worker(seller['user']['id'],'PRODUCT-BOUNDARY',expired['activation_code'],expired['expires_at'])
        result=subprocess.run(args,env=env,cwd=APP,input=data,capture_output=True,text=True,check=True)
        self.assertEqual(json.loads(result.stdout)['error'],'activation_expired')
        with closing(sqlite3.connect(self.tmpdir/'test.sqlite')) as db:
            self.assertIsNone(db.execute('SELECT claimed_user_id FROM device_inventory WHERE serial_number=?',('PRODUCT-BOUNDARY',)).fetchone()[0])

    def test_forced_collision_rolls_back_and_lockout_persists(self):
        seller,headers,unit=self.prepare('PRODUCT-COLLISION')
        env={**os.environ,'AQUASMART_DB_PATH':str(self.tmpdir/'test.sqlite'),'AQUASMART_DEVICE_HANDOFF_DIR':self.handoff_temp.name}
        script="""require 'server/src/Database.php'; require 'server/src/AuditRepository.php';
        $input=json_decode(stream_get_contents(STDIN),true);$pdo=Database::connection(false);
        try { ProductRepository::provision($pdo,$input['owner'],['serial_number'=>'PRODUCT-FAILED','name'=>'x','location'=>'y'],null,fn()=>$input['code']);echo 'unexpected'; }
        catch(ProductError $e){echo $e->errorCode;}"""
        result=subprocess.run(['php','-r',script],env=env,cwd=APP,input=json.dumps({'owner':seller['user']['id'],'code':unit['activation_code']}),capture_output=True,text=True,check=True)
        self.assertEqual(result.stdout,'activation_collision')
        with closing(sqlite3.connect(self.tmpdir/'test.sqlite')) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM device_inventory WHERE serial_number="PRODUCT-FAILED"').fetchone()[0],0)
        self.assertFalse((Path(self.handoff_temp.name)/'PRODUCT-FAILED.json').exists())
        for _ in range(5):
            args,env,data=self.worker(seller['user']['id'],'PRODUCT-COLLISION','wrong',100)
            response=subprocess.run(args,env=env,cwd=APP,input=data,capture_output=True,text=True,check=True)
            self.assertEqual(json.loads(response.stdout)['error'],'activation_invalid')
        args,env,data=self.worker(seller['user']['id'],'PRODUCT-COLLISION',unit['activation_code'],101)
        response=subprocess.run(args,env=env,cwd=APP,input=data,capture_output=True,text=True,check=True)
        self.assertEqual(json.loads(response.stdout)['error'],'activation_locked')

    @classmethod
    def setUpClass(cls):
        cls.handoff_temp=tempfile.TemporaryDirectory(prefix='aquasmart-handoff-')
        cls.previous=os.environ.get('AQUASMART_DEVICE_HANDOFF_DIR')
        os.environ['AQUASMART_DEVICE_HANDOFF_DIR']=cls.handoff_temp.name
        super().setUpClass()
        cls.addClassCleanup(cls.handoff_temp.cleanup)
        if cls.previous is None: os.environ.pop('AQUASMART_DEVICE_HANDOFF_DIR',None)
        else: os.environ['AQUASMART_DEVICE_HANDOFF_DIR']=cls.previous

    def prepare(self,serial):
        user=self.login();headers={'X-CSRF-Token':user['csrf_token']}
        with closing(sqlite3.connect(self.tmpdir/'test.sqlite')) as db:
            db.execute('INSERT OR IGNORE INTO seller_operators VALUES(?,0)',(user['user']['id'],));db.commit()
        status,_,data=self.request('POST','/api/seller/units',{'serial_number':serial,'name':'Kolam Lele','location':'Tambak'},headers=headers)
        self.assertEqual(status,201,data)
        return user,headers,data['unit']

    def test_provision_claim_heartbeat_and_ownership(self):
        user=self.login();headers={'X-CSRF-Token':user['csrf_token']}
        self.assertEqual(self.request('GET','/api/seller/units')[0],403)
        user,headers,unit=self.prepare('PRODUCT-A')
        self.assertNotIn('key',json.dumps(unit))
        self.assertEqual(self.request('POST','/api/devices',{'serial_number':'PRODUCT-A'},headers=headers)[0],422)
        self.new_client()
        self.assertEqual(self.request('POST','/api/auth/register',{'name':'Bypass','contact':'bypass-product@example.test','password':'SafePassword123','password_confirmation':'SafePassword123','serial_number':'PRODUCT-A'})[0],422)
        owner=self.register('product-owner@example.test');headers={'X-CSRF-Token':owner['csrf_token']}
        self.assertEqual(self.request('GET','/api/seller/units')[0],403)
        payload={'serial_number':'PRODUCT-A','activation_code':unit['activation_code']}
        status,_,claimed=self.request('POST','/api/units/claim',payload,headers=headers)
        self.assertEqual(status,201,claimed);self.assertEqual(claimed['unit']['state'],'registered_pending_connection')
        self.assertEqual(self.request('GET','/api/units/PRODUCT-A/onboarding')[2]['unit']['connection']['state'],'waiting')
        self.assertEqual(self.request('GET','/api/units/PRODUCT-A/dashboard')[2]['unit']['connection']['state'],'waiting')
        command={'actuator':'feeder','value':True,'duration':0,'channel':'simulation','request_id':'product-test'}
        self.assertEqual(self.request('POST','/api/units/PRODUCT-A/commands',command,headers=headers)[0],422)
        command['duration']=3
        response=self.request('POST','/api/units/PRODUCT-A/commands',command,headers=headers)
        self.assertEqual(response[0],201,response);self.assertTrue(response[2]['command']['simulation'])
        self.assertEqual(self.request('POST','/api/units/PRODUCT-A/commands',command,headers=headers)[2]['command']['id'],response[2]['command']['id'])
        command['channel']='hardware'
        self.assertEqual(self.request('POST','/api/units/PRODUCT-A/commands',command,headers=headers)[0],503)
        self.assertEqual(self.request('POST','/api/devices/PRODUCT-A/key',{},headers=headers)[0],404)
        key=json.loads((Path(self.handoff_temp.name)/'PRODUCT-A.json').read_text())['device_key']
        self.assertEqual(self.request('POST','/api/devices/PRODUCT-A/heartbeat',{},headers={'X-Device-Key':key})[0],200)
        self.assertEqual(self.request('GET','/api/units/PRODUCT-A/onboarding')[2]['unit']['connection']['state'],'online')
        self.assertEqual(self.request('POST','/api/units/claim',payload,headers=headers)[2]['error']['code'],'activation_used')
        self.new_client();other=self.register('other-product@example.test')
        self.assertEqual(self.request('GET','/api/units/PRODUCT-A/onboarding')[0],403)
        self.assertEqual(self.request('GET','/api/units/PRODUCT-A/dashboard')[0],403)
        self.assertEqual(self.request('POST','/api/units/PRODUCT-A/commands',command,headers={'X-CSRF-Token':other['csrf_token']})[0],403)
        self.assertEqual(self.request('POST','/api/units/claim',payload,headers={'X-CSRF-Token':other['csrf_token']})[2]['error']['code'],'activation_used')
        with closing(sqlite3.connect(self.tmpdir/'test.sqlite')) as db:
            self.assertNotIn(key,str(db.execute('SELECT metadata FROM audit_logs').fetchall()))

    def test_wrong_expired_and_ip_limit(self):
        _,headers,unit=self.prepare('PRODUCT-B')
        self.assertEqual(self.request('POST','/api/seller/units',{'serial_number':'PRODUCT-B','name':'x','location':'y'},headers=headers)[2]['error']['code'],'serial_exists')
        with closing(sqlite3.connect(self.tmpdir/'test.sqlite')) as db:db.execute('DELETE FROM api_rate_limits');db.commit()
        payload={'serial_number':'PRODUCT-B','activation_code':'ABCD-ABCD-ABCD-ABCD'}
        self.assertEqual(self.request('POST','/api/units/claim',payload,headers=headers)[2]['error']['code'],'activation_invalid')
        with closing(sqlite3.connect(self.tmpdir/'test.sqlite')) as db:db.execute('UPDATE product_units SET expires_at=0 WHERE serial=?',('PRODUCT-B',));db.commit()
        payload['activation_code']=unit['activation_code']
        self.assertEqual(self.request('POST','/api/units/claim',payload,headers=headers)[2]['error']['code'],'activation_expired')
        for _ in range(3):self.request('POST','/api/units/claim',payload,headers=headers)
        self.assertEqual(self.request('POST','/api/units/claim',payload,headers=headers)[0],429)


if __name__=='__main__':unittest.main()
