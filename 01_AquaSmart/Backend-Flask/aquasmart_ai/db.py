"""Penyimpanan SQLite: model registry, rekomendasi, umpan balik, dan audit log.

SQLite dipakai seperti backend PHP (lihat docs/CR-001_Basis_Data_SQLite.md). Tulis
selalu memakai BEGIN IMMEDIATE agar beberapa worker gunicorn mengantre lewat busy
timeout, bukan gagal "database is locked".
"""
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS model_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL UNIQUE,
    algorithm TEXT NOT NULL,
    sensors TEXT NOT NULL,
    features TEXT NOT NULL,
    params TEXT NOT NULL,
    metrics TEXT NOT NULL,
    validation TEXT NOT NULL,
    dataset TEXT NOT NULL,
    dataset_sha256 TEXT NOT NULL,
    rules_version TEXT NOT NULL,
    artifact TEXT NOT NULL,
    artifact_sha256 TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('candidate','active','retired')),
    trained_at TEXT NOT NULL,
    activated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_model ON model_versions(status) WHERE status = 'active';
CREATE TABLE IF NOT EXISTS activations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL REFERENCES model_versions(version),
    action TEXT NOT NULL CHECK (action IN ('activate','rollback')),
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recommendations (
    id TEXT PRIMARY KEY,
    device_id TEXT,
    model_version TEXT,
    source TEXT NOT NULL,
    condition TEXT NOT NULL,
    confidence REAL,
    reasons TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback (
    recommendation_id TEXT PRIMARY KEY REFERENCES recommendations(id),
    helpful INTEGER NOT NULL CHECK (helpful IN (0,1)),
    note TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    metadata TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def now():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def connect(path):
    conn = sqlite3.connect(path, timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode = WAL')
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def migrate(path):
    with connect(path) as conn:
        conn.executescript(SCHEMA)


@contextmanager
def write(conn):
    conn.execute('BEGIN IMMEDIATE')
    try:
        yield conn
        conn.execute('COMMIT')
    except BaseException:
        conn.execute('ROLLBACK')
        raise


def audit(conn, action, entity, entity_id=None, **metadata):
    conn.execute('INSERT INTO audit_logs(action,entity,entity_id,metadata,created_at) VALUES(?,?,?,?,?)',
                 (action, entity, entity_id, json.dumps(metadata, ensure_ascii=False), now()))


def model_dto(row):
    if row is None:
        return None
    data = dict(row)
    for key in ('sensors', 'features', 'params', 'metrics', 'validation'):
        data[key] = json.loads(data[key])
    data.pop('artifact', None)
    return data
