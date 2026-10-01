"""Downloads exercise the real session, ownership, filters and CSV encoder."""
import csv
import io
import sqlite3
from contextlib import closing
from urllib.parse import urlencode
from api_integration import HttpTestCase


class ExportTests(HttpTestCase):
    def download(self, **overrides):
        query = dict(device_id='AQS-KOLAM-01', date='2020-01-01', period='day', kind='readings', format='json')
        query.update(overrides)
        return self.request('GET', '/api/export?' + urlencode(query))

    def test_auth_ownership_and_validation(self):
        self.assertEqual(self.download()[0], 401)
        self.login()
        self.assertEqual(self.download(device_id='NOT-OWNED')[0], 404)
        for query in [dict(kind='users'), dict(period='year'), dict(date='2020-02-30'), dict(format='html'), dict(device_id="' OR 1=1--")]:
            self.assertEqual(self.download(**query)[0], 422)
        self.assertEqual(self.request('GET', '/api/export?device_id[]=AQS-KOLAM-01')[0], 422)
        with closing(sqlite3.connect(self.tmpdir/'test.sqlite')) as db:
            db.execute("UPDATE users SET role='viewer' WHERE username=?", (self.seed_username,))
            db.commit()
        self.assertEqual(self.download()[0], 200)

    def test_calendar_source_and_csv_contract(self):
        self.login()
        for stamp in ['2019-12-31T23:59:59Z','2020-01-01T00:00:00Z','2020-01-02T00:00:00Z']:
            status, _, body = self.request('POST','/api/devices/AQS-KOLAM-01/readings',
                dict(created_at=stamp,ph=7,temperature=-1,turbidity=10,simulation=True),headers={'X-Device-Key':self.device_key})
            self.assertEqual(status,201,body)
        status, headers, body = self.download()
        self.assertEqual(status,200,body)
        self.assertIn('no-store',headers.get('Cache-Control',''))
        self.assertEqual(len(body['rows']),1)
        self.assertTrue(body['rows'][0]['simulation'])
        self.assertFalse(body['meta']['hardware_verified'])
        self.assertEqual(len(self.download(period='week')[2]['rows']),3)
        self.assertEqual(len(self.download(period='month')[2]['rows']),2)
        _, headers, body = self.download(format='csv')
        self.assertEqual(headers.get_content_type(),'text/csv')
        rows = list(csv.DictReader(io.StringIO(body['raw'])))
        self.assertEqual(len(rows),1)
        self.assertEqual(float(rows[0]['temperature']),-1)
        self.assertEqual(rows[0]['simulation'],'true')
        self.assertEqual(self.download(kind='reports')[2]['rows'][0]['cnt'],1)

    def test_all_kinds_empty_and_formula_injection(self):
        self.login()
        for kind in ['readings','alerts','commands','feeding_logs','reports']:
            self.assertEqual(self.download(kind=kind)[2]['rows'],[])
            status, _, body = self.download(kind=kind,format='csv')
            self.assertEqual(status,200,body)
            self.assertEqual(len(list(csv.reader(io.StringIO(body['raw'])))),1)
        with closing(sqlite3.connect(self.tmpdir/'test.sqlite')) as db:
            db.execute("INSERT INTO alerts(device_id,severity,message,created_at) VALUES(?,?,?,?)",
                       ('AQS-KOLAM-01','warning','=HYPERLINK("https://invalid")','2020-01-01T00:00:00Z'))
            db.commit()
        status, _, body = self.download(kind='alerts',format='csv')
        self.assertEqual(status,200,body)
        row = list(csv.DictReader(io.StringIO(body['raw'])))[0]
        self.assertTrue(row['message'].startswith("'="))
        self.assertEqual(row['source'],'LEGACY / UNVERIFIED')
        self.assertEqual(row['provenance'],'legacy_unverified')

    def test_command_feeding_filters_and_other_workspace(self):
        user=self.login()
        with closing(sqlite3.connect(self.tmpdir/'test.sqlite')) as db:
            for index, (actuator,status,stamp) in enumerate([
                ('feeder','succeeded',1577836800),('feeder','failed',1577840400),
                ('feeder','timeout',1577844000),('aerator','succeeded',1577847600),
                ('feeder','pending',1577851200),('feeder','failed',1577923200)]):
                db.execute('INSERT INTO actuator_commands(id,device_id,user_id,actuator,value,duration,request_id,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
                    (str(index).zfill(32),'AQS-KOLAM-01',user['user']['id'],actuator,1,8 if actuator=='feeder' else 0,str(index),status,stamp,stamp+60))
            db.commit()
        self.assertEqual(len(self.download(kind='commands')[2]['rows']),5)
        rows=self.download(kind='feeding_logs')[2]['rows']
        self.assertEqual([r['status'] for r in rows],['succeeded','failed','timeout'])
        self.new_client()
        import secrets
        password=secrets.token_urlsafe(24)
        self.assertEqual(self.request('POST','/api/auth/register',dict(name='Other',contact='other@example.com',password=password,password_confirmation=password))[0],201)
        for kind in ['readings','alerts','commands','feeding_logs','reports']:
            self.assertEqual(self.download(kind=kind)[0],404)
