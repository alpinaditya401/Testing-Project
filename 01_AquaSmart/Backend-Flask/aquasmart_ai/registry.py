"""Model registry (FR-18 sampai FR-20): latih kandidat, validasi, aktivasi, rollback."""
from datetime import datetime, timezone
import hashlib
import json
import secrets

import joblib

from . import db, ml
from .config import DEFAULT_THRESHOLDS, RULES_VERSION


class RegistryError(Exception):
    def __init__(self, code, message, status=409):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def _sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def validate(metrics, config):
    """Kriteria aktivasi. Model yang gagal tetap tercatat sebagai kandidat, tetapi tidak bisa diaktifkan."""
    model, rule = metrics['model'], metrics['rule_baseline']
    gap = model['macro_f1'] - rule['macro_f1']
    checks = [
        {'kriteria': f"macro F1 holdout >= {config.min_macro_f1}", 'nilai': model['macro_f1'],
         'lulus': model['macro_f1'] >= config.min_macro_f1},
        {'kriteria': f"recall alarm >= {config.min_recall_alarm}", 'nilai': model['recall_alarm'],
         'lulus': model['recall_alarm'] >= config.min_recall_alarm},
        {'kriteria': f"selisih macro F1 terhadap aturan ambang >= -{config.max_gap_vs_rule}", 'nilai': gap,
         'lulus': gap >= -config.max_gap_vs_rule},
    ]
    return {'passed': all(c['lulus'] for c in checks), 'checks': checks,
            'beats_rule_baseline': gap > 0}


def train_candidate(conn, config, dataset, sensors, params, run_cv=True):
    path = config.datasets.get(dataset)
    if path is None:
        raise RegistryError('unknown_dataset', 'Dataset tidak terdaftar di layanan.', 422)
    bins = ml.load_bins(path)
    rules = {k: DEFAULT_THRESHOLDS[k] for k in ('ph_min', 'ph_max', 'temperature_min', 'temperature_max')}
    model, features, metrics = ml.train(bins, sensors, rules, params, run_cv)
    validation = validate(metrics, config)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')
    version = f'rf-{stamp}-{secrets.token_hex(3)}'
    models_dir = config.data_dir / 'models'
    models_dir.mkdir(parents=True, exist_ok=True)
    artifact = models_dir / f'{version}.joblib'
    joblib.dump(model, artifact)
    with db.write(conn):
        conn.execute(
            'INSERT INTO model_versions(version,algorithm,sensors,features,params,metrics,validation,dataset,'
            'dataset_sha256,rules_version,artifact,artifact_sha256,status,trained_at) '
            'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (version, 'RandomForestClassifier', json.dumps(sensors), json.dumps(features),
             json.dumps({**ml.DEFAULT_PARAMS, **params}), json.dumps(metrics), json.dumps(validation),
             dataset, _sha256(path), RULES_VERSION, artifact.name, _sha256(artifact), 'candidate', db.now()))
        db.audit(conn, 'model.trained', 'model_version', version, dataset=dataset,
                 passed=validation['passed'])
    return db.model_dto(conn.execute('SELECT * FROM model_versions WHERE version=?', (version,)).fetchone())


def _switch_active(conn, version, action):
    with db.write(conn):
        row = conn.execute('SELECT * FROM model_versions WHERE version=?', (version,)).fetchone()
        if row is None:
            raise RegistryError('model_not_found', 'Versi model tidak ditemukan.', 404)
        if not json.loads(row['validation'])['passed']:
            raise RegistryError('validation_failed', 'Model tidak memenuhi kriteria validasi dan tidak dapat diaktifkan.')
        if row['status'] == 'active':
            return
        conn.execute("UPDATE model_versions SET status='retired' WHERE status='active'")
        conn.execute("UPDATE model_versions SET status='active', activated_at=? WHERE version=?", (db.now(), version))
        conn.execute('INSERT INTO activations(version,action,created_at) VALUES(?,?,?)', (version, action, db.now()))
        db.audit(conn, 'model.' + ('activated' if action == 'activate' else 'rolled_back'), 'model_version', version)


def activate(conn, version):
    _switch_active(conn, version, 'activate')


def rollback(conn):
    """Kembali ke versi aktif sebelumnya (TC-18)."""
    current = conn.execute("SELECT version FROM model_versions WHERE status='active'").fetchone()
    if current is None:
        raise RegistryError('no_active_model', 'Belum ada model aktif untuk di-rollback.')
    history = [r['version'] for r in conn.execute('SELECT version FROM activations ORDER BY id DESC')]
    previous = next((v for v in history if v != current['version']), None)
    if previous is None:
        raise RegistryError('no_previous_model', 'Tidak ada versi aktif sebelumnya.')
    _switch_active(conn, previous, 'rollback')
    return previous


_cache = {}


def active_model(conn, config):
    """Muat model aktif. Artefak diperiksa hash-nya karena joblib memuat pickle."""
    row = conn.execute("SELECT * FROM model_versions WHERE status='active'").fetchone()
    if row is None:
        return None, None
    key = (str(config.data_dir), row['version'])
    if key not in _cache:
        artifact = config.data_dir / 'models' / row['artifact']
        if not artifact.exists() or _sha256(artifact) != row['artifact_sha256']:
            raise RegistryError('artifact_invalid', 'Artefak model aktif hilang atau berubah.', 500)
        _cache[key] = joblib.load(artifact)
    return _cache[key], db.model_dto(row)
