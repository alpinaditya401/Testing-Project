"""Model layanan harus identik dengan hasil notebook 02_baseline (evaluasi_mandiri.json)."""
import json

import pytest

import hashlib

from aquasmart_ai.config import DEFAULT_DATASET, REPO_AQUASMART

EXPECTED = json.loads((REPO_AQUASMART / '08_Sistem-Cerdas' / 'tugas_mandiri' / 'evaluasi_mandiri.json').read_text())


def test_rf_v1_reproduces_notebook_results(trained):
    model = trained[1]['v1']
    assert model['algorithm'] == 'rf-v1'
    results = {row['model']: row for row in EXPECTED['results']}
    for ours, theirs in [('model', 'Random Forest'), ('rule_baseline', 'Ambang terakhir non AI')]:
        for metric in ('macro_f1', 'balanced_accuracy', 'recall_alarm', 'accuracy'):
            assert model['metrics'][ours][metric] == pytest.approx(results[theirs][metric], abs=1e-12), (ours, metric)
    assert model['metrics']['split']['train'] == EXPECTED['split'][0]['jumlah']
    assert model['metrics']['split']['test'] == EXPECTED['split'][1]['jumlah']
    assert model['metrics']['cv']['macro_f1_mean'] == pytest.approx(EXPECTED['cv_macro_f1_mean'], abs=1e-12)
    assert model['features'] == EXPECTED['features']


def test_validation_reports_rule_baseline_honestly(trained):
    model = trained[1]['v1']
    # Notebook: Random Forest kalah 0,0207 macro F1 dari aturan ambang terakhir.
    assert model['validation']['beats_rule_baseline'] is False
    assert model['validation']['passed'] is True


def test_bundled_dataset_is_identical_to_notebook_output():
    original = REPO_AQUASMART / '08_Sistem-Cerdas' / 'tugas_mandiri' / 'data_bersih_5menit.csv'
    digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()  # noqa: E731
    assert digest(DEFAULT_DATASET) == digest(original)


# Angka dari evaluasi tunggal pada holdout setelah pemilihan model dikunci
# (08_Sistem-Cerdas/perbaikan_model/hasil_perbaikan.json).
V2_HOLDOUT = {'macro_f1': 0.9080796646406775, 'balanced_accuracy': 0.9094825042780433,
              'recall_alarm': 0.9776951672862454, 'accuracy': 0.9615925058548009}
V2_CV_TWO_CLASS = 0.9333441218762921


def test_v2_reproduces_selected_experiment(trained):
    model = trained[1]['v2']
    assert model['algorithm'] == 'ph-gated-logistic-v2'
    for metric, value in V2_HOLDOUT.items():
        assert model['metrics']['model'][metric] == pytest.approx(value, abs=1e-12), metric
    two_class = [f['macro_f1'] for f in model['metrics']['cv']['folds'] if f['kelas_valid'] == 2]
    assert sum(two_class) / len(two_class) == pytest.approx(V2_CV_TWO_CLASS, abs=1e-12)
    assert model['metrics']['split']['train'] == 8525 and model['metrics']['split']['test'] == 2135


def test_v2_improves_on_v1_but_not_on_the_rule(trained):
    v1, v2 = trained[1]['v1']['metrics'], trained[1]['v2']['metrics']
    assert v2['model']['macro_f1'] > v1['model']['macro_f1']
    assert v2['model']['recall_alarm'] > v1['model']['recall_alarm']
    assert v2['model']['macro_f1'] < v2['rule_baseline']['macro_f1']
    assert trained[1]['v2']['validation']['beats_rule_baseline'] is False
