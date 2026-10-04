"""Fitur, label, pipeline, dan evaluasi untuk dua algoritma.

- rf-v1: sama persis dengan 08_Sistem-Cerdas/mandiri.py dan 02_baseline.ipynb (Random Forest
  pada 12 fitur lag/rolling). Disalin, bukan diimpor, karena mandiri.py membaca berkas PHP dan
  membuat folder saat diimpor; layanan harus berdiri sendiri saat di-deploy.
- ph-gated-logistic-v2 (bawaan): lihat model_v2.py.

Keduanya memprediksi status proksi pH/suhu pada interval lima menit berikutnya, dievaluasi
pada baris dan pembagian latih/uji yang sama dengan notebook.
"""
import math

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score, recall_score
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from . import model_v2

SENSORS = ['ph', 'tds', 'temp']
REQUIRED_SENSORS = {'ph', 'temp'}
SEED = 42
DEFAULT_PARAMS = {'n_estimators': 160, 'max_depth': 10, 'min_samples_leaf': 5}
RF_V1 = 'rf-v1'
DEFAULT_ALGORITHM = model_v2.NAME
ALGORITHM_DEFAULTS = {RF_V1: DEFAULT_PARAMS, model_v2.NAME: model_v2.DEFAULT_PARAMS}
# Rentang parameter yang boleh diminta lewat API: (min, max, tipe).
PARAM_BOUNDS = {
    RF_V1: {'n_estimators': (10, 500, int), 'max_depth': (2, 30, int), 'min_samples_leaf': (1, 50, int)},
    model_v2.NAME: {'C': (0.01, 100.0, float), 'gate_k': (1, 20, int)},
}


def canonical(algorithm):
    """Nama algoritma di registry. Model lama tercatat sebagai 'RandomForestClassifier'."""
    return model_v2.NAME if algorithm == model_v2.NAME else RF_V1


def load_bins(path):
    bins = pd.read_csv(path, index_col='timestamp', parse_dates=['timestamp'], float_precision='round_trip')
    missing = REQUIRED_SENSORS - set(bins.columns)
    if missing:
        raise ValueError(f'Dataset tidak memiliki kolom {sorted(missing)}.')
    return bins


def label_status(ph, temp, rules):
    known = ph.notna() & temp.notna()
    result = pd.Series(np.nan, index=ph.index, name='target_proxy')
    result.loc[known] = (~ph.loc[known].between(rules['ph_min'], rules['ph_max'])
                         | ~temp.loc[known].between(rules['temperature_min'], rules['temperature_max'])).astype(int)
    return result


def feature_frame(bins, sensors):
    """Fitur setiap baris hanya dari interval sebelumnya (shift(1))."""
    features = pd.DataFrame(index=bins.index)
    for col in sensors:
        series = bins[col] if col in bins else pd.Series(np.nan, index=bins.index)
        past = series.shift(1)
        features[col + '_lag1'] = past
        features[col + '_lag2'] = series.shift(2)
        features[col + '_mean12'] = past.rolling(12, min_periods=3).mean()
        features[col + '_std12'] = past.rolling(12, min_periods=3).std()
    return features


def algorithm_features(algorithm, bins, sensors, rules):
    if canonical(algorithm) == model_v2.NAME:
        return model_v2.build_features(bins, rules)
    return feature_frame(bins, sensors)


def make_features(bins, sensors, rules, algorithm=RF_V1):
    features = algorithm_features(algorithm, bins, sensors, rules)
    y = label_status(bins.ph, bins.temp, rules)
    # Prediksi butuh pH dan suhu interval sebelumnya; label kosong tidak diimputasi.
    # Baris yang dievaluasi sama untuk semua algoritma (sama dengan notebook).
    eligible = bins.ph.shift(1).notna() & bins.temp.shift(1).notna()
    eligible &= y.notna()
    eligible &= np.arange(len(bins)) >= 12
    return features.loc[eligible], y.loc[eligible].astype(int)


def chronological_split(X, y):
    cut = int(len(X) * .8)
    boundary = X.index[cut]
    # Purge satu jendela rolling penuh di batas holdout.
    train_mask = X.index < boundary - pd.Timedelta(minutes=60)
    test_mask = X.index >= boundary
    return X.loc[train_mask], X.loc[test_mask], y.loc[train_mask], y.loc[test_mask]


def pipeline(columns, params=None):
    params = {**DEFAULT_PARAMS, **(params or {})}
    numeric = Pipeline([('imputer', SimpleImputer(strategy='median', add_indicator=True)),
                        ('scale', StandardScaler())])
    preprocess = ColumnTransformer([('numeric', numeric, list(columns))], remainder='drop')
    model = RandomForestClassifier(class_weight='balanced', random_state=SEED, n_jobs=2, **params)
    return Pipeline([('preprocessing', preprocess), ('model', model)])


def score(y, pred):
    return {'macro_f1': float(f1_score(y, pred, labels=[0, 1], average='macro', zero_division=0)),
            'balanced_accuracy': float(balanced_accuracy_score(y, pred)),
            'recall_alarm': float(recall_score(y, pred, pos_label=1, zero_division=0)),
            'accuracy': float(accuracy_score(y, pred))}


def fit(algorithm, X_train, y_train, rules, params=None):
    params = {**ALGORITHM_DEFAULTS[canonical(algorithm)], **(params or {})}
    if canonical(algorithm) == model_v2.NAME:
        return model_v2.GatedPhModel(rules, **params).fit(X_train)
    return pipeline(X_train.columns, params).fit(X_train, y_train)


def cross_validate(algorithm, X_train, y_train, rules, params=None):
    folds = []
    for fold, (tr, va) in enumerate(TimeSeriesSplit(n_splits=5, gap=12).split(X_train), 1):
        candidate = fit(algorithm, X_train.iloc[tr], y_train.iloc[tr], rules, params)
        folds.append({'fold': fold, 'kelas_valid': int(y_train.iloc[va].nunique()),
                      **score(y_train.iloc[va], candidate.predict(X_train.iloc[va]))})
    two_class = [f['macro_f1'] for f in folds if f['kelas_valid'] == 2]
    values = [f['macro_f1'] for f in folds]
    return {'folds': folds, 'macro_f1_mean': float(np.mean(values)),
            'macro_f1_std': float(np.std(values, ddof=1)),
            'two_class_macro_f1_mean': float(np.mean(two_class)) if two_class else None}


def train(bins, sensors, rules, params=None, run_cv=True, algorithm=RF_V1):
    """Latih kandidat dan hitung metrik holdout, baseline aturan, serta CV temporal."""
    X, y = make_features(bins, sensors, rules, algorithm)
    X_train, X_test, y_train, y_test = chronological_split(X, y)
    if y_train.nunique() < 2:
        raise ValueError('Data latih hanya memiliki satu kelas; model tidak dapat dilatih.')
    cv = cross_validate(algorithm, X_train, y_train, rules, params) if run_cv else None
    model = fit(algorithm, X_train, y_train, rules, params)
    # Aturan persistensi: status interval t-1, dari bin langsung (tidak bergantung pada fitur algoritma).
    rule_pred = label_status(bins.ph.shift(1), bins.temp.shift(1), rules).loc[X_test.index].astype(int).to_numpy()
    metrics = {
        'model': score(y_test, model.predict(X_test)),
        'rule_baseline': score(y_test, rule_pred),
        'cv': cv,
        'split': {'train': len(X_train), 'test': len(X_test),
                  'train_start': str(X_train.index.min()), 'train_end': str(X_train.index.max()),
                  'test_start': str(X_test.index.min()), 'test_end': str(X_test.index.max())},
    }
    return model, list(X.columns), metrics


def readings_to_bins(readings):
    """Pembacaan mentah -> median per interval lima menit (UTC), seperti data latih."""
    frame = pd.DataFrame(readings)
    frame['time'] = pd.to_datetime(frame['time'], utc=True).dt.tz_localize(None)
    frame = frame.rename(columns={'temperature': 'temp'}).set_index('time').sort_index()
    for col in SENSORS:
        if col not in frame:
            frame[col] = np.nan
    return frame[SENSORS].astype(float).resample('5min').median()


def next_interval_features(bins, sensors, rules=None, algorithm=RF_V1):
    """Fitur untuk interval sesudah bin terakhir, memakai fungsi fitur yang sama dengan pelatihan."""
    upcoming = bins.index[-1] + pd.Timedelta(minutes=5)
    extended = pd.concat([bins, pd.DataFrame(index=[upcoming], columns=bins.columns, dtype=float)])
    return algorithm_features(algorithm, extended, sensors, rules).iloc[[-1]], upcoming


def _rf_factors(model, frame, limit=3):
    """Faktor utama RF: importance global beserta nilai fitur saat ini."""
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


def explain(model, meta, frame):
    """Keputusan model untuk satu baris fitur (NFR-12).

    alarm None berarti model tidak memberi pendapat (v2 di luar periode fluktuasi) sehingga
    aturan ambang yang memutuskan.
    """
    if canonical(meta['algorithm']) == model_v2.NAME:
        flips = frame.iloc[0][model_v2.GATE_COL]
        if not model.chattering(frame)[0]:
            return {'alarm': None, 'confidence': None, 'missing': [], 'gated': True,
                    'factors': [{'feature': model_v2.GATE_COL, 'importance': None,
                                 'value': None if math.isnan(flips) else float(flips)}]}
        p = float(model.alarm_probability(frame)[0])
        alarm = p >= model_v2.THRESHOLD
        return {'alarm': alarm, 'confidence': p if alarm else 1 - p, 'missing': [], 'gated': False,
                'factors': model.contributions(frame)}
    columns = meta['features']
    frame = frame[columns]
    probabilities = model.predict_proba(frame)[0]
    p = float(probabilities[list(model.classes_).index(1)])
    alarm = p >= 0.5
    missing = [s for s in meta['sensors'] if math.isnan(frame.iloc[0][s + '_lag1'])]
    return {'alarm': alarm, 'confidence': p if alarm else 1 - p, 'missing': missing, 'gated': False,
            'factors': _rf_factors(model, frame)}
