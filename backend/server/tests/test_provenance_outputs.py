import csv
import io
import json
import sqlite3
from contextlib import closing
from test_workspace import WorkspaceTests


class ProvenanceOutputTests(WorkspaceTests):
    def test_mixed_sources_survive_dto_report_and_every_export(self):
        self.login()
        sources=['simulation','device','manual','seed','legacy_unverified']
        with closing(sqlite3.connect(self.tmpdir/'test.sqlite')) as db:
            db.execute('DELETE FROM sensor_readings')
            db.execute('DELETE FROM alerts')
            for index, source in enumerate(sources):
                stamp=f'2020-01-01T00:00:0{index}Z'
                db.execute('INSERT INTO sensor_readings(device_id,ph,temperature,turbidity,simulation,created_at,provenance,source_session) VALUES(?,?,?,?,?,?,?,?)',
                           ('AQS-KOLAM-01',7,28,20,index%2,stamp,source,'fixture-session'))
                db.execute('INSERT INTO alerts(device_id,severity,message,created_at,provenance,source_session) VALUES(?,?,?,?,?,?)',
                           ('AQS-KOLAM-01','warning','SIMULASI misleading message',stamp,source,'fixture-session'))
                owner=db.execute("SELECT user_id FROM devices WHERE id='AQS-KOLAM-01'").fetchone()[0]
                db.execute('INSERT INTO actuator_commands(id,device_id,user_id,actuator,value,duration,request_id,status,simulation,created_at,expires_at,provenance,source_session) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
                           (f'{index+1:032x}','AQS-KOLAM-01',owner,'feeder',1,2,f'mixed-{index}','succeeded',index%2,1577836800+index,1577836860,source,'fixture-session'))
            db.commit()
        readings=self.request('GET','/api/devices/AQS-KOLAM-01/readings')[2]['readings']
        self.assertEqual([r['provenance'] for r in readings],sources)
        latest=self.request('GET','/api/devices')[2]['devices'][0]['latest_reading']
        self.assertEqual(latest['provenance'],'legacy_unverified')
        alerts=self.request('GET','/api/alerts')[2]['alerts']
        self.assertEqual(alerts[0]['source'],'LEGACY / UNVERIFIED')
        for suffix in ('commands','feeding-logs'):
            result=self.request('GET',f'/api/devices/AQS-KOLAM-01/{suffix}')[2]
            rows=result['commands' if suffix=='commands' else 'feeding_logs']
            self.assertEqual({row['provenance'] for row in rows},set(sources))
        for kind in ('readings','alerts','reports','commands','feeding_logs'):
            path=f'/api/export?device_id=AQS-KOLAM-01&kind={kind}&date=2020-01-01&period=day'
            result=self.request('GET',path+'&format=json')[2]
            self.assertEqual(result['meta']['source_counts'],dict.fromkeys(sources,1))
            status,headers,body=self.request('GET',path+'&format=csv')
            self.assertEqual(status,200)
            rows=list(csv.DictReader(io.StringIO(body['raw'])))
            for source in sources:
                self.assertEqual(rows[0]['source_'+source],'1')
            self.assertEqual(json.loads(headers['X-Provenance-Counts']),dict.fromkeys(sources,1))
        report=self.request('GET','/api/reports?device_id=AQS-KOLAM-01&date=2020-01-01&period=day')[2]
        self.assertEqual(report['source_counts'],dict.fromkeys(sources,1))
        token=self.login()['csrf_token']
        self.request('PATCH',f"/api/alerts/{alerts[0]['id']}/acknowledge",{},headers={'X-CSRF-Token':token})
        with closing(sqlite3.connect(self.tmpdir/'test.sqlite')) as db:
            source, metadata=db.execute("SELECT provenance,metadata FROM audit_logs WHERE action='alert.acknowledged'").fetchone()
            self.assertEqual(source,'manual')
            self.assertEqual(json.loads(metadata)['origin_provenance'],'legacy_unverified')

    def test_diagnostic_export_preserves_raw_contract_and_empty_counts(self):
        self.login()
        from test_hardware_api import HardwareApiTests
        payload=HardwareApiTests.telemetry(self)
        payload.update(provenance='simulation',simulation=True)
        self.assertEqual(self.request('POST','/api/devices/AQS-KOLAM-01/telemetry',payload,headers={'X-Device-Key':self.device_key})[0],201)
        path='/api/export?device_id=AQS-KOLAM-01&kind=telemetry&date=2026-09-15&period=day'
        result=self.request('GET',path+'&format=json')[2]
        self.assertEqual(result['meta']['source_counts']['simulation'],1)
        self.assertFalse(result['rows'][0]['calibrated'])
        rows=list(csv.DictReader(io.StringIO(self.request('GET',path+'&format=csv')[2]['raw'])))
        self.assertEqual(rows[0]['turbidity_sensor_mv'],'2500')
        empty=self.request('GET',path.replace('2026-09-15','2000-01-01')+'&format=json')[2]
        self.assertEqual(sum(empty['meta']['source_counts'].values()),0)
