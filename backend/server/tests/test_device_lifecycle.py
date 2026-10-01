from contextlib import closing
import hashlib
import sqlite3
import unittest
from test_workspace import WorkspaceTests


class DeviceLifecycleTests(WorkspaceTests):
    def test_claim_edit_and_duplicate_are_owned_and_audited(self):
        admin = self.login()
        headers = {'X-CSRF-Token': admin['csrf_token']}
        payload = {'serial_number': self.unclaimed_device_serial}
        self.assertEqual(self.request('POST', '/api/devices', payload)[0], 403)
        self.assertEqual(self.request('POST', '/api/devices', {'serial_number':'AQS-MISSING'}, headers=headers)[0], 422)
        self.assertEqual(self.request('POST', '/api/devices', payload, headers=headers)[0], 201)
        self.assertEqual(self.request('POST', '/api/devices', payload, headers=headers)[0], 409)
        path = '/api/devices/' + self.unclaimed_device_serial
        self.assertEqual(self.request('PATCH', path, {'name':'Kolam baru','location':'Lokasi lokal'}, headers=headers)[0], 200)
        self.assertEqual(self.request('PATCH', path, {'name':'','location':'Lokasi'}, headers=headers)[0], 422)
        actions = {row['action'] for row in self.request('GET','/api/audit-logs')[2]['audit_logs']}
        self.assertTrue({'device.claimed','device.updated'} <= actions)
        self.new_client()
        other = self.register('other-lifecycle@example.test')
        other_headers = {'X-CSRF-Token':other['csrf_token']}
        self.assertEqual(self.request('PATCH', path, {'name':'Cross user','location':'Denied'}, headers=other_headers)[0], 404)
        self.assertEqual(self.request('POST', path + '/key', {}, headers=other_headers)[0], 404)

    def test_heartbeat_does_not_create_reading_and_keys_are_scoped_rotatable(self):
        admin = self.login()
        csrf = {'X-CSRF-Token':admin['csrf_token']}
        path = '/api/devices/AQS-KOLAM-01'
        self.assertEqual(self.request('POST',path+'/key',{})[0],403)
        status, _, issued = self.request('POST',path+'/key',{},headers=csrf)
        self.assertEqual(status,200)
        key = issued['device_key']
        before = self.request('GET',path+'/readings')[2]
        self.assertEqual(self.request('POST',path+'/heartbeat',{})[0],401)
        self.assertEqual(self.request('POST',path+'/heartbeat',{},headers={'X-Device-Key':self.device_key})[0],401)
        self.assertEqual(self.request('POST',path+'/heartbeat',{},headers={'X-Device-Key':key})[0],200)
        self.assertEqual(self.request('GET',path+'/readings')[2],before)
        self.assertEqual(self.request('POST','/api/devices/AQS-AQUA-02/heartbeat',{},headers={'X-Device-Key':key})[0],401)
        with closing(sqlite3.connect(self.tmpdir/'test.sqlite')) as db:
            stored = db.execute('SELECT key_hash FROM device_credentials WHERE device_id=?',('AQS-KOLAM-01',)).fetchone()[0]
            self.assertEqual(stored,hashlib.sha256(key.encode()).hexdigest())
            self.assertNotIn(key, str(db.execute('SELECT metadata FROM audit_logs').fetchall()))
        new_key = self.request('POST',path+'/key',{},headers=csrf)[2]['device_key']
        self.assertNotEqual(key,new_key)
        self.assertEqual(self.request('POST',path+'/heartbeat',{},headers={'X-Device-Key':key})[0],401)
        self.assertEqual(self.request('POST',path+'/heartbeat',{},headers={'X-Device-Key':new_key})[0],200)

    def test_viewer_cannot_claim_edit_or_rotate_key(self):
        _, _, viewer, _ = self.invite_viewer()
        headers = {'X-CSRF-Token':viewer['csrf_token']}
        for method, path, body in [
            ('POST','/api/devices',{'serial_number':self.unclaimed_device_serial}),
            ('PATCH','/api/devices/AQS-KOLAM-01',{'name':'Denied','location':'Denied'}),
            ('POST','/api/devices/AQS-KOLAM-01/key',{})]:
            self.assertEqual(self.request(method,path,body,headers=headers)[0],403)


if __name__ == '__main__':
    unittest.main(verbosity=2)
