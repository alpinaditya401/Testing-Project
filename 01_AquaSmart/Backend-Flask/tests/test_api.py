from datetime import datetime, timedelta, timezone

from conftest import ADMIN, SERVICE


def readings(count=24, ph=7.2, temperature=27.5, end=None, **extra):
    end = end or datetime.now(timezone.utc).replace(microsecond=0)
    rows = []
    for i in range(count):
        stamp = end - timedelta(minutes=5 * (count - 1 - i))
        rows.append({'time': stamp.strftime('%Y-%m-%dT%H:%M:%SZ'), 'ph': ph, 'temperature': temperature, **extra})
    return rows


def predict(client, rows, **extra):
    return client.post('/api/predict', json={'device_id': 'AQS-KOLAM-01', 'readings': rows, **extra}, headers=SERVICE)


def activate_trained(client, algorithm='ph-gated-logistic-v2'):
    models = client.get('/api/models', headers=ADMIN).json['models']
    version = next(m['version'] for m in models if m['algorithm'] == algorithm)
    assert client.post(f'/api/models/{version}/activate', headers=ADMIN).status_code == 200
    return version


def chattering(count=48):
    """pH naik-turun melintasi 6,5 dengan suhu dalam ambang; pembacaan terakhir dalam ambang."""
    rows = readings(count=count)
    for i, row in enumerate(rows):
        row['ph'] = 6.4 if (count - 1 - i) % 2 else 6.6
    return rows


def test_health_reports_active_model(make_client):
    client = make_client()
    assert client.get('/api/health').json['active_model'] is None
    version = activate_trained(client)
    assert client.get('/api/health').json['active_model'] == version


def test_keys_are_required_and_fail_closed(make_client):
    client = make_client()
    assert client.post('/api/predict', json={}).status_code == 401
    assert client.post('/api/predict', json={}, headers={'X-AquaSmart-AI-Key': 'x' * 30}).status_code == 401
    # Kunci layanan tidak boleh mengelola model.
    assert client.get('/api/models', headers=SERVICE).status_code == 401
    unconfigured = make_client(copy_trained=False, service_key='', admin_key='')
    assert unconfigured.post('/api/predict', json={}, headers=SERVICE).status_code == 503


def test_without_active_model_rules_decide(make_client):
    client = make_client()
    response = predict(client, readings())
    assert response.status_code == 200, response.json
    rec = response.json['recommendation']
    assert (rec['condition'], rec['source'], rec['model'], rec['confidence']) == ('normal', 'aturan', None, None)
    assert rec['actuation'] is False


def test_v1_prediction_is_explained_and_versioned(make_client):
    client = make_client()
    version = activate_trained(client, 'rf-v1')
    rec = predict(client, readings(tds=400.0))
    rec = rec.json['recommendation']
    assert rec['model']['version'] == version and rec['model']['algorithm'] == 'rf-v1'
    assert rec['model']['rules_version'] == 'threshold-rules-v2'
    assert rec['source'] == 'model' and 0.5 <= rec['confidence'] <= 1
    assert rec['condition'] in ('normal', 'waspada')
    assert len(rec['factors']) == 3 and all('importance' in f for f in rec['factors'])
    assert rec['missing_features'] == [] and rec['predicted_for']


def test_v2_defers_to_rule_when_status_is_stable(make_client):
    client = make_client()
    version = activate_trained(client)
    assert version.startswith('v2-')
    rec = predict(client, readings()).json['recommendation']
    assert (rec['condition'], rec['source'], rec['confidence']) == ('normal', 'aturan', None)
    assert rec['model']['algorithm'] == 'ph-gated-logistic-v2'
    assert rec['factors'][0]['feature'] == 'flips36'
    assert any('sering berganti' in reason for reason in rec['reasons'])


def test_v2_judges_chattering_ph_with_local_explanation(make_client):
    client = make_client()
    activate_trained(client)
    rec = predict(client, chattering()).json['recommendation']
    assert rec['source'] == 'model' and 0.5 <= rec['confidence'] <= 1
    assert rec['condition'] in ('normal', 'waspada')
    assert rec['missing_features'] == []
    assert rec['factors'] and all(f['direction'] in ('menaikkan', 'menurunkan') for f in rec['factors'])


def test_missing_tds_is_disclosed_for_v1(make_client):
    client = make_client()
    activate_trained(client, 'rf-v1')
    rec = predict(client, readings()).json['recommendation']
    assert rec['missing_features'] == ['tds']
    assert any('tds' in reason for reason in rec['reasons'])


def test_out_of_range_reading_always_overrides_model(make_client):
    client = make_client()
    activate_trained(client)
    rows = readings()
    rows[-1]['ph'] = 9.4
    rec = predict(client, rows).json['recommendation']
    assert (rec['condition'], rec['source']) == ('di_luar_ambang', 'aturan')
    assert rec['breaches'][0]['parameter'] == 'ph'
    assert rec['actuation'] is False


def test_workspace_thresholds_are_applied(make_client):
    client = make_client()
    strict = {'ph_min': 7.3, 'ph_max': 7.4, 'temperature_min': 25, 'temperature_max': 30, 'turbidity_max': 50}
    rec = predict(client, readings(ph=7.2), thresholds=strict).json['recommendation']
    assert rec['condition'] == 'di_luar_ambang'
    bad = dict(strict, ph_min=8)
    assert predict(client, readings(), thresholds=bad).status_code == 422


def test_input_validation(make_client):
    client = make_client()
    assert predict(client, readings(count=2)).status_code == 422
    rows = readings()
    rows[0]['ph'] = 15
    assert predict(client, rows).status_code == 422
    rows = readings()
    rows[0]['time'] = '2026-10-01 10:00'
    assert predict(client, rows).status_code == 422
    rows = readings()
    rows[0]['temperature'] = True
    assert predict(client, rows).status_code == 422
    assert client.post('/api/predict', data='x', headers=SERVICE).status_code == 415
    assert client.post('/api/predict', data='{', headers=SERVICE, content_type='application/json').status_code == 400
    huge = '{"readings": "' + 'x' * 300_000 + '"}'
    assert client.post('/api/predict', data=huge, headers=SERVICE, content_type='application/json').status_code == 413


def test_feedback_is_stored_and_updatable(make_client):
    client = make_client()
    rec_id = predict(client, readings()).json['recommendation']['id']
    url = f'/api/recommendations/{rec_id}/feedback'
    assert client.post(url, json={'helpful': True}, headers=SERVICE).status_code == 200
    response = client.post(url, json={'helpful': False, 'note': 'Sensor sedang dikalibrasi'}, headers=SERVICE)
    assert response.json['feedback']['helpful'] is False
    assert client.post(url, json={'helpful': 'ya'}, headers=SERVICE).status_code == 422
    assert client.post('/api/recommendations/tidak-ada/feedback', json={'helpful': True}, headers=SERVICE).status_code == 404


def test_model_failing_criteria_cannot_be_activated(make_client):
    # TC-17: kriteria lebih ketat dari kemampuan model -> kandidat tersimpan tetapi ditolak saat aktivasi.
    client = make_client(min_macro_f1=0.99)
    response = client.post('/api/models/train', json={'algorithm': 'rf-v1', 'params': {'n_estimators': 20},
                                                      'cross_validation': False}, headers=ADMIN)
    assert response.status_code == 201
    model = response.json['model']
    assert model['validation']['passed'] is False and model['status'] == 'candidate'
    response = client.post(f"/api/models/{model['version']}/activate", headers=ADMIN)
    assert (response.status_code, response.json['error']['code']) == (409, 'validation_failed')


def test_rollback_restores_previous_model(make_client):
    # TC-18
    client = make_client()
    assert client.post('/api/models/rollback', headers=ADMIN).status_code == 409
    first = activate_trained(client)
    second = client.post('/api/models/train', json={'params': {'gate_k': 5}, 'cross_validation': False},
                         headers=ADMIN).json['model']['version']
    assert client.post(f'/api/models/{second}/activate', headers=ADMIN).status_code == 200
    response = client.post('/api/models/rollback', headers=ADMIN)
    assert response.json['model']['version'] == first
    statuses = {m['version']: m['status'] for m in client.get('/api/models', headers=ADMIN).json['models']}
    assert statuses[first] == 'active' and statuses[second] == 'retired'
    assert list(statuses.values()).count('active') == 1


def test_training_input_is_restricted(make_client):
    client = make_client(copy_trained=False)
    assert client.post('/api/models/train', json={'dataset': '../../etc/passwd'}, headers=ADMIN).status_code == 422
    assert client.post('/api/models/train', json={'sensors': ['tds']}, headers=ADMIN).status_code == 422
    assert client.post('/api/models/train', json={'params': {'n_estimators': 100000}}, headers=ADMIN).status_code == 422
    assert client.post('/api/models/train', json={'algorithm': 'svm'}, headers=ADMIN).status_code == 422
    assert client.post('/api/models/train', json={'params': {'C': 0}}, headers=ADMIN).status_code == 422
    assert client.post('/api/models/train', json={'params': {'gate_k': 2.5}}, headers=ADMIN).status_code == 422
    assert client.post('/api/models/abc/activate', headers=ADMIN).status_code == 404


def test_tampered_artifact_is_refused(make_client):
    client = make_client()
    version = activate_trained(client)
    data_dir = client.application.config['AQUASMART'].data_dir
    artifact = data_dir / 'models' / f'{version}.joblib'
    artifact.write_bytes(artifact.read_bytes() + b'tamper')
    from aquasmart_ai import registry
    registry._cache.clear()
    assert predict(client, readings()).status_code == 500
