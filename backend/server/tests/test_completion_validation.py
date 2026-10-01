"""HTTP regressions for registration/login consistency and finite thresholds."""
import secrets
import unittest
from test_workspace import WorkspaceTests


class CompletionValidationTests(WorkspaceTests):
    def test_claimed_serial_has_distinct_registration_error(self):
        password = secrets.token_urlsafe(24)
        payload = {'name':'Serial owner','contact':'serial-owner@example.test',
                   'password':password,'password_confirmation':password,
                   'serial_number':self.unclaimed_device_serial}
        self.assertEqual(self.request('POST','/api/auth/register',payload)[0],201)
        status, _, error = self.request('POST','/api/auth/register',{
            **payload,'contact':'serial-second@example.test'})
        self.assertEqual(status,409)
        self.assertEqual(error['error']['code'],'device_already_claimed')

    def test_registration_contact_can_login_with_same_format(self):
        password = secrets.token_urlsafe(24)
        for contact in ('MixedCase@example.test', '0812-3456-7890'):
            status, _, _ = self.request('POST', '/api/auth/register', {
                'name': 'Local test', 'contact': contact, 'password': password,
                'password_confirmation': password})
            self.assertEqual(status, 201)
            self.assertEqual(self.request('POST', '/api/auth/login', {
                'username': contact, 'password': password})[0], 200)

    def test_registration_rejects_unbounded_name(self):
        password = secrets.token_urlsafe(24)
        self.assertEqual(self.request('POST', '/api/auth/register', {
            'name': 'x' * 101, 'contact': 'bounded@example.test',
            'password': password, 'password_confirmation': password})[0], 422)

    def test_threshold_overflow_is_rejected_without_mutation(self):
        user = self.login()
        before = self.request('GET', '/api/settings/thresholds')[2]
        payload = {'ph_min': 6.5, 'ph_max': 8.5, 'temperature_min': 25,
                   'temperature_max': 30, 'turbidity_max': '1e999'}
        status = self.request('PATCH', '/api/settings/thresholds', payload,
                              headers={'X-CSRF-Token': user['csrf_token']})[0]
        self.assertEqual(status, 422)
        self.assertEqual(self.request('GET', '/api/settings/thresholds')[2], before)


if __name__ == '__main__':
    unittest.main(verbosity=2)
