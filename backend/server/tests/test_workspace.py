"""HTTP workspace contracts using the shared isolated runtime and real migrations."""
from contextlib import closing
import hashlib
import json
import sqlite3
import unittest

from api_integration import HttpTestCase


class WorkspaceTests(HttpTestCase):
    def register(self, contact="viewer@example.com", **extra):
        password = "EphemeralTest123!"
        status, _, data = self.request("POST", "/api/auth/register", {
            "name": "Invited Person", "contact": contact,
            "password": password, "password_confirmation": password, **extra,
        })
        self.assertEqual(status, 201, data)
        return data

    def test_registration_is_admin_of_own_workspace_and_safe_dto(self):
        registered = self.register(role="viewer", workspace_owner_id=1)
        self.assertEqual(registered["user"]["role"], "admin")
        self.assertIsNone(registered["user"]["workspace_owner_id"])
        self.assertNotIn("password", json.dumps(registered).lower())
        status, _, me = self.request("GET", "/api/auth/me")
        self.assertEqual(status, 200)
        self.assertEqual(me["user"], registered["user"])
        self.new_client()
        status, _, logged_in = self.request("POST", "/api/auth/login", {
            "username": "viewer@example.com", "password": "EphemeralTest123!",
        })
        self.assertEqual(status, 200)
        self.assertEqual(logged_in["user"], registered["user"])


    def invite_viewer(self):
        owner = self.login()
        owner_client = self.client
        status, _, invite = self.request('POST','/api/invitations',{'contact':'viewer@example.com'},headers={'X-CSRF-Token':owner['csrf_token']})
        self.assertEqual(status,201,invite)
        self.new_client()
        viewer = self.register()
        status, _, accepted = self.request('POST','/api/invitations/accept',{'token':invite['invitation']['token']},headers={'X-CSRF-Token':viewer['csrf_token']})
        self.assertEqual(status,200,accepted)
        return owner, owner_client, viewer, invite

    def test_invited_viewer_can_read_but_never_mutate_workspace(self):
        owner, client, viewer, invite = self.invite_viewer()
        status, _, data = self.request('GET','/api/devices')
        self.assertEqual(status,200)
        self.assertGreater(len(data['devices']),0)
        device = data['devices'][0]['id']
        for method, path, payload in [('POST',f'/api/devices/{device}/control',{'actuator':'feeder','value':True}),('POST',f'/api/devices/{device}/schedules',{}),('PATCH','/api/settings/thresholds',{}),('PATCH','/api/alerts/1/acknowledge',{}),('DELETE','/api/schedules/1',None),('POST','/api/invitations',{'contact':'third@example.com'})]:
            with self.subTest(path=path):
                self.assertEqual(self.request(method,path,payload,headers={'X-CSRF-Token':viewer['csrf_token']})[0],403)
        self.assertEqual(self.request('PATCH','/api/profile',{'name':'Viewer Baru','phone':'081234567890'},headers={'X-CSRF-Token':viewer['csrf_token']})[0],200)
        self.client = client
        self.assertNotEqual(self.request('GET','/api/auth/me')[2]['user']['name'],'Viewer Baru')

    def test_invite_bound_to_contact_csrf_and_hashed(self):
        owner=self.login()
        self.assertEqual(self.request('POST','/api/invitations',{'contact':'viewer@example.com'})[0],403)
        status,_,payload=self.request('POST','/api/invitations',{'contact':'viewer@example.com'},headers={'X-CSRF-Token':owner['csrf_token']})
        self.assertEqual(status,201,payload)
        token=payload['invitation']['token']
        with closing(sqlite3.connect(self.tmpdir/'test.sqlite')) as db:
            row=db.execute('SELECT token_hash FROM workspace_invitations').fetchone()
            self.assertEqual(row[0],hashlib.sha256(token.encode()).hexdigest())
        self.new_client(); user=self.register('thief@example.com')
        self.assertEqual(self.request('POST','/api/invitations/accept',{'token':token},headers={'X-CSRF-Token':user['csrf_token']})[0],422)
        self.assertEqual(self.request('GET','/api/devices')[2]['devices'],[])

    def test_revoke_member_immediately_removes_access(self):
        owner, client, viewer, invite=self.invite_viewer(); viewer_client=self.client
        self.client=client
        self.assertEqual(self.request('DELETE',f'/api/workspace/members/{viewer["user"]["id"]}',headers={'X-CSRF-Token':owner['csrf_token']})[0],200)
        self.client=viewer_client
        self.assertEqual(self.request('GET','/api/devices')[2]['devices'],[])

if __name__ == "__main__":
    unittest.main(verbosity=2)

