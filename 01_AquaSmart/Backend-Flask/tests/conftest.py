from dataclasses import replace
from pathlib import Path
import shutil
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from aquasmart_ai import create_app  # noqa: E402
from aquasmart_ai.config import Config, DEFAULT_DATASET  # noqa: E402

SERVICE_KEY = 'service-key-for-tests-0123456789'
ADMIN_KEY = 'admin-key-for-tests-0123456789'
SERVICE = {'X-AquaSmart-AI-Key': SERVICE_KEY}
ADMIN = {'X-AquaSmart-AI-Key': ADMIN_KEY}


def make_config(data_dir, **overrides):
    base = Config(data_dir=Path(data_dir), service_key=SERVICE_KEY, admin_key=ADMIN_KEY,
                  datasets={'aquasmart-5menit': DEFAULT_DATASET})
    return replace(base, **overrides)


@pytest.fixture(scope='session')
def trained(tmp_path_factory):
    """Pelatihan lengkap (dengan CV) kedua algoritma untuk seluruh sesi; dipakai uji paritas dan disalin uji API."""
    data_dir = tmp_path_factory.mktemp('trained')
    client = create_app(make_config(data_dir)).test_client()
    models = {}
    for key, body in [('v2', {}), ('v1', {'algorithm': 'rf-v1'})]:
        response = client.post('/api/models/train', json=body, headers=ADMIN)
        assert response.status_code == 201, response.json
        models[key] = response.json['model']
    return data_dir, models


@pytest.fixture
def make_client(tmp_path, trained):
    def factory(copy_trained=True, **overrides):
        data_dir = tmp_path / 'data'
        if copy_trained:
            shutil.copytree(trained[0], data_dir)
        return create_app(make_config(data_dir, **overrides)).test_client()
    return factory
