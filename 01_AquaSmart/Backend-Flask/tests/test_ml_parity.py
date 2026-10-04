"""Model layanan harus identik dengan hasil notebook 02_baseline (evaluasi_mandiri.json)."""
import json

import pytest

import hashlib

from aquasmart_ai.config import DEFAULT_DATASET, REPO_AQUASMART

EXPECTED = json.loads((REPO_AQUASMART / '08_Sistem-Cerdas' / 'tugas_mandiri' / 'evaluasi_mandiri.json').read_text())


def test_training_reproduces_notebook_results(trained):
    _, model = trained
    results = {row['model']: row for row in EXPECTED['results']}
    for ours, theirs in [('model', 'Random Forest'), ('rule_baseline', 'Ambang terakhir non AI')]:
        for metric in ('macro_f1', 'balanced_accuracy', 'recall_alarm', 'accuracy'):
            assert model['metrics'][ours][metric] == pytest.approx(results[theirs][metric], abs=1e-12), (ours, metric)
    assert model['metrics']['split']['train'] == EXPECTED['split'][0]['jumlah']
    assert model['metrics']['split']['test'] == EXPECTED['split'][1]['jumlah']
    assert model['metrics']['cv']['macro_f1_mean'] == pytest.approx(EXPECTED['cv_macro_f1_mean'], abs=1e-12)
    assert model['features'] == EXPECTED['features']


def test_validation_reports_rule_baseline_honestly(trained):
    _, model = trained
    # Notebook: Random Forest kalah 0,0207 macro F1 dari aturan ambang terakhir.
    assert model['validation']['beats_rule_baseline'] is False
    assert model['validation']['passed'] is True


def test_bundled_dataset_is_identical_to_notebook_output():
    original = REPO_AQUASMART / '08_Sistem-Cerdas' / 'tugas_mandiri' / 'data_bersih_5menit.csv'
    digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()  # noqa: E731
    assert digest(DEFAULT_DATASET) == digest(original)
