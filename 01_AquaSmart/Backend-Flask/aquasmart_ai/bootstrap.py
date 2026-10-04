"""Dijalankan sekali saat container mulai (start.sh), sebelum gunicorn.

Bila AQUASMART_AI_BOOTSTRAP=1 dan belum ada model aktif, latih model bawaan dari dataset
terdaftar dan aktifkan bila lolos kriteria validasi. Satu proses, jadi tidak ada balapan
antar-worker. Data tersimpan di volume, sehingga restart berikutnya melewati langkah ini.
"""
import os
import sys

from . import db, ml, registry
from .config import Config

DEFAULT_DATASET_NAME = 'aquasmart-5menit'


def main():
    if os.environ.get('AQUASMART_AI_BOOTSTRAP') != '1':
        return 0
    config = Config.from_env()
    config.data_dir.mkdir(parents=True, exist_ok=True)
    path = config.data_dir / 'registry.sqlite'
    db.migrate(path)
    conn = db.connect(path)
    try:
        if conn.execute("SELECT 1 FROM model_versions WHERE status='active'").fetchone():
            print('bootstrap: model aktif sudah ada, dilewati', flush=True)
            return 0
        if DEFAULT_DATASET_NAME not in config.datasets:
            print(f'bootstrap: dataset {DEFAULT_DATASET_NAME} tidak ditemukan, layanan memakai aturan saja', flush=True)
            return 0
        model = registry.train_candidate(conn, config, DEFAULT_DATASET_NAME, list(ml.SENSORS), {}, run_cv=True)
        if model['validation']['passed']:
            registry.activate(conn, model['version'])
            print(f"bootstrap: {model['version']} dilatih dan diaktifkan", flush=True)
        else:
            print(f"bootstrap: {model['version']} tidak lolos kriteria, layanan memakai aturan saja", flush=True)
        return 0
    finally:
        conn.close()


if __name__ == '__main__':
    sys.exit(main())
