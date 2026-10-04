"""Endpoint HTTP layanan AI. Bentuk error sama dengan backend PHP: {"error": {"code", "message"}}."""
from datetime import datetime, timezone
from functools import wraps
import hmac
import json
import math
import re
import uuid

import numpy as np
from flask import Blueprint, current_app, g, jsonify, request

from . import db, ml, registry, rules
from .config import DEFAULT_THRESHOLDS, RULES_VERSION

api = Blueprint('api', __name__, url_prefix='/api')
ISO_TIME = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$')
DEVICE_ID = re.compile(r'^[A-Za-z0-9_-]{1,128}$')
VERSION = re.compile(r'^rf-\d{14}-[0-9a-f]{6}$')
NOTICE = ('Rekomendasi bersifat saran dan tidak menggerakkan aktuator. Perintah tetap melalui otorisasi '
          'dan interlock backend; pembacaan di luar ambang selalu mengalahkan model.')


class ApiError(Exception):
    def __init__(self, code, message, status=422):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def error(code, message, status):
    return jsonify({'error': {'code': code, 'message': message}}), status


def config():
    return current_app.config['AQUASMART']


def require_key(kind):
    """kind 'service' untuk backend PHP, 'admin' untuk pengelola model. Kunci admin juga boleh memanggil service."""
    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            cfg = config()
            keys = [cfg.admin_key] if kind == 'admin' else [cfg.service_key, cfg.admin_key]
            keys = [k for k in keys if len(k) >= 16]
            if not keys:
                return error('not_configured', 'Kunci layanan AI belum dikonfigurasi di server.', 503)
            given = request.headers.get('X-AquaSmart-AI-Key', '').encode()
            if not any(hmac.compare_digest(given, k.encode()) for k in keys):
                return error('unauthorized', 'Kunci layanan AI tidak valid.', 401)
            return view(*args, **kwargs)
        return wrapper
    return decorator


def body():
    if request.mimetype != 'application/json':
        raise ApiError('unsupported_media_type', 'Content-Type harus application/json.', 415)
    data = request.get_json(silent=True)
    if data is None:
        raise ApiError('invalid_json', 'Body JSON rusak.', 400)
    if not isinstance(data, dict):
        raise ApiError('validation_error', 'Body harus objek JSON.')
    return data


def number(value, low=None, high=None, nullable=False):
    if value is None and nullable:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ApiError('validation_error', 'Nilai sensor harus angka valid.')
    if (low is not None and value < low) or (high is not None and value > high):
        raise ApiError('validation_error', 'Rentang nilai sensor tidak valid.')
    return float(value)


def parse_readings(raw):
    limit = config().max_readings
    if not isinstance(raw, list) or not 3 <= len(raw) <= limit:
        raise ApiError('validation_error', f'readings harus daftar berisi 3 sampai {limit} pembacaan.')
    readings = []
    for item in raw:
        if not isinstance(item, dict) or not isinstance(item.get('time'), str) or not ISO_TIME.match(item['time']):
            raise ApiError('validation_error', 'Setiap pembacaan butuh time ISO-8601 dengan zona waktu.')
        try:
            stamp = datetime.fromisoformat(item['time'].replace('Z', '+00:00'))
        except ValueError:
            raise ApiError('validation_error', 'Tanggal pembacaan tidak valid.') from None
        readings.append({'time': stamp.astimezone(timezone.utc),
                         'ph': number(item.get('ph'), 0, 14),
                         'temperature': number(item.get('temperature'), -50, 100),
                         'tds': number(item.get('tds'), 0, None, nullable=True),
                         'turbidity': number(item.get('turbidity'), 0, None, nullable=True)})
    return sorted(readings, key=lambda r: r['time'])


def parse_thresholds(raw):
    if raw is None:
        return dict(DEFAULT_THRESHOLDS)
    if not isinstance(raw, dict) or set(raw) != set(DEFAULT_THRESHOLDS):
        raise ApiError('validation_error', 'thresholds harus memuat ph_min, ph_max, temperature_min, temperature_max, turbidity_max.')
    values = {k: number(raw[k]) for k in DEFAULT_THRESHOLDS}
    if values['ph_min'] >= values['ph_max'] or values['temperature_min'] >= values['temperature_max']:
        raise ApiError('validation_error', 'Batas minimum harus lebih kecil dari maksimum.')
    return values


def model_factors(model, frame, limit=3):
    """Faktor utama: importance global Random Forest beserta nilai fitur saat ini (NFR-12)."""
    names = model.named_steps['preprocessing'].get_feature_names_out()
    importances = model.named_steps['model'].feature_importances_
    factors = []
    for index in np.argsort(importances)[::-1]:
        name = names[index].removeprefix('numeric__')
        if name.startswith('missingindicator_'):
            continue
        value = frame.iloc[0][name]
        factors.append({'feature': name, 'importance': round(float(importances[index]), 4),
                        'value': None if math.isnan(value) else round(float(value), 4)})
        if len(factors) == limit:
            break
    return factors


@api.before_request
def open_db():
    g.conn = db.connect(config().data_dir / 'registry.sqlite')


@api.teardown_request
def close_db(_exc):
    conn = g.pop('conn', None)
    if conn is not None:
        conn.close()


@api.get('/health')
def health():
    row = g.conn.execute("SELECT version FROM model_versions WHERE status='active'").fetchone()
    return jsonify({'status': 'ok', 'service': 'aquasmart-ai', 'rules_version': RULES_VERSION,
                    'active_model': row['version'] if row else None})


@api.post('/predict')
@require_key('service')
def predict():
    data = body()
    device = data.get('device_id')
    if device is not None and (not isinstance(device, str) or not DEVICE_ID.match(device)):
        raise ApiError('validation_error', 'device_id tidak valid.')
    readings = parse_readings(data.get('readings'))
    thresholds = parse_thresholds(data.get('thresholds'))
    latest = readings[-1]
    model, meta = registry.active_model(g.conn, config())
    model_alarm = confidence = None
    factors, missing, predicted_for = [], [], None
    if model is not None:
        bins = ml.readings_to_bins([{k: v for k, v in r.items()} for r in readings])
        frame, upcoming = ml.next_interval_features(bins, meta['sensors'])
        frame = frame[meta['features']]
        probabilities = model.predict_proba(frame)[0]
        alarm_probability = float(probabilities[list(model.classes_).index(1)])
        model_alarm = alarm_probability >= 0.5
        confidence = alarm_probability if model_alarm else 1 - alarm_probability
        missing = [s for s in meta['sensors'] if math.isnan(frame.iloc[0][s + '_lag1'])]
        factors = model_factors(model, frame)
        predicted_for = upcoming.strftime('%Y-%m-%dT%H:%M:%SZ')
    decision = rules.decide(latest, thresholds, model_alarm, confidence or 0.0)
    if missing:
        decision['reasons'].append(f"Sensor {', '.join(missing)} tidak dikirim; nilainya diisi median data latih, "
                                   'jadi keyakinan model lebih lemah.')
    rec_id = str(uuid.uuid4())
    with db.write(g.conn):
        g.conn.execute('INSERT INTO recommendations(id,device_id,model_version,source,condition,confidence,reasons,created_at) '
                       'VALUES(?,?,?,?,?,?,?,?)',
                       (rec_id, device, meta['version'] if meta else None, decision['source'],
                        decision['condition'], confidence, json.dumps(decision['reasons'], ensure_ascii=False), db.now()))
    age = (datetime.now(timezone.utc) - latest['time']).total_seconds()
    return jsonify({'recommendation': {
        'id': rec_id, 'device_id': device, 'condition': decision['condition'], 'source': decision['source'],
        'confidence': None if confidence is None else round(confidence, 4),
        'reasons': decision['reasons'], 'actions': decision['actions'], 'breaches': decision['breaches'],
        'factors': factors, 'missing_features': missing, 'predicted_for': predicted_for,
        'data_age_seconds': round(age), 'thresholds': thresholds,
        'model': None if meta is None else {'version': meta['version'], 'algorithm': meta['algorithm'],
                                            'rules_version': meta['rules_version'],
                                            'beats_rule_baseline': meta['validation']['beats_rule_baseline']},
        'actuation': False, 'notice': NOTICE}})


@api.post('/recommendations/<rec_id>/feedback')
@require_key('service')
def feedback(rec_id):
    data = body()
    helpful, note = data.get('helpful'), data.get('note')
    if not isinstance(helpful, bool) or (note is not None and (not isinstance(note, str) or len(note) > 500)):
        raise ApiError('validation_error', 'helpful harus boolean; note teks maksimal 500 karakter.')
    with db.write(g.conn):
        if g.conn.execute('SELECT 1 FROM recommendations WHERE id=?', (rec_id,)).fetchone() is None:
            raise ApiError('not_found', 'Rekomendasi tidak ditemukan.', 404)
        g.conn.execute('INSERT INTO feedback(recommendation_id,helpful,note,created_at) VALUES(?,?,?,?) '
                       'ON CONFLICT(recommendation_id) DO UPDATE SET helpful=excluded.helpful, note=excluded.note, '
                       'created_at=excluded.created_at', (rec_id, int(helpful), note, db.now()))
    return jsonify({'feedback': {'recommendation_id': rec_id, 'helpful': helpful, 'note': note}})


def criteria():
    cfg = config()
    return {'min_macro_f1': cfg.min_macro_f1, 'min_recall_alarm': cfg.min_recall_alarm,
            'max_gap_vs_rule': cfg.max_gap_vs_rule}


@api.get('/models')
@require_key('admin')
def list_models():
    rows = g.conn.execute('SELECT * FROM model_versions ORDER BY id DESC').fetchall()
    models = [db.model_dto(r) for r in rows]
    active = next((m['version'] for m in models if m['status'] == 'active'), None)
    return jsonify({'models': models, 'active_version': active, 'criteria': criteria(),
                    'datasets': sorted(config().datasets)})


@api.post('/models/train')
@require_key('admin')
def train():
    data = body()
    dataset = data.get('dataset', 'aquasmart-5menit')
    sensors = data.get('sensors', ml.SENSORS)
    params = data.get('params', {})
    run_cv = data.get('cross_validation', True)
    if not isinstance(dataset, str) or not isinstance(run_cv, bool):
        raise ApiError('validation_error', 'dataset harus teks dan cross_validation boolean.')
    if (not isinstance(sensors, list) or not all(isinstance(s, str) for s in sensors)
            or not set(sensors) <= set(ml.SENSORS) or not ml.REQUIRED_SENSORS <= set(sensors)):
        raise ApiError('validation_error', 'sensors harus subset dari ph, tds, temp dan memuat ph serta temp.')
    bounds = {'n_estimators': (10, 500), 'max_depth': (2, 30), 'min_samples_leaf': (1, 50)}
    if not isinstance(params, dict) or not set(params) <= set(bounds) or any(
            isinstance(v, bool) or not isinstance(v, int) or not bounds[k][0] <= v <= bounds[k][1]
            for k, v in params.items()):
        raise ApiError('validation_error', 'params hanya n_estimators 10–500, max_depth 2–30, min_samples_leaf 1–50.')
    model = registry.train_candidate(g.conn, config(), dataset, [s for s in ml.SENSORS if s in sensors], params, run_cv)
    return jsonify({'model': model, 'criteria': criteria()}), 201


@api.post('/models/<version>/activate')
@require_key('admin')
def activate(version):
    if not VERSION.match(version):
        raise ApiError('model_not_found', 'Versi model tidak ditemukan.', 404)
    registry.activate(g.conn, version)
    return jsonify({'model': db.model_dto(g.conn.execute('SELECT * FROM model_versions WHERE version=?', (version,)).fetchone())})


@api.post('/models/rollback')
@require_key('admin')
def rollback():
    version = registry.rollback(g.conn)
    return jsonify({'model': db.model_dto(g.conn.execute('SELECT * FROM model_versions WHERE version=?', (version,)).fetchone())})
