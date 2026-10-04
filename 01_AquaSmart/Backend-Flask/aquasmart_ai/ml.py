"""Fitur, label, pipeline, dan evaluasi.

Logikanya sama persis dengan 08_Sistem-Cerdas/mandiri.py dan 02_baseline.ipynb:
prediksi status proksi pH/suhu pada interval lima menit berikutnya dari riwayat
interval sebelumnya. Disalin, bukan diimpor, karena mandiri.py membaca berkas PHP
dan membuat folder saat diimpor; layanan harus berdiri sendiri saat di-deploy.
"""
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score, recall_score
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

SENSORS = ['ph', 'tds', 'temp']
REQUIRED_SENSORS = {'ph', 'temp'}
SEED = 42
DEFAULT_PARAMS = {'n_estimators': 160, 'max_depth': 10, 'min_samples_leaf': 5}


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


def make_features(bins, sensors, rules):
    features = feature_frame(bins, sensors)
    y = label_status(bins.ph, bins.temp, rules)
    # Prediksi butuh pH dan suhu interval sebelumnya; label kosong tidak diimputasi.
    eligible = features[['ph_lag1', 'temp_lag1']].notna().all(axis=1)
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


def cross_validate(estimator, X_train, y_train):
    folds = []
    for fold, (tr, va) in enumerate(TimeSeriesSplit(n_splits=5, gap=12).split(X_train), 1):
        candidate = clone(estimator).fit(X_train.iloc[tr], y_train.iloc[tr])
        folds.append({'fold': fold, 'kelas_valid': int(y_train.iloc[va].nunique()),
                      **score(y_train.iloc[va], candidate.predict(X_train.iloc[va]))})
    two_class = [f['macro_f1'] for f in folds if f['kelas_valid'] == 2]
    values = [f['macro_f1'] for f in folds]
    return {'folds': folds, 'macro_f1_mean': float(np.mean(values)),
            'macro_f1_std': float(np.std(values, ddof=1)),
            'two_class_macro_f1_mean': float(np.mean(two_class)) if two_class else None}


def train(bins, sensors, rules, params=None, run_cv=True):
    """Latih kandidat dan hitung metrik holdout, baseline aturan, serta CV temporal."""
    X, y = make_features(bins, sensors, rules)
    X_train, X_test, y_train, y_test = chronological_split(X, y)
    if y_train.nunique() < 2:
        raise ValueError('Data latih hanya memiliki satu kelas; model tidak dapat dilatih.')
    model = pipeline(X.columns, params)
    cv = cross_validate(model, X_train, y_train) if run_cv else None
    model.fit(X_train, y_train)
    rule_pred = label_status(X_test.ph_lag1, X_test.temp_lag1, rules).astype(int).to_numpy()
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


def next_interval_features(bins, sensors):
    """Fitur untuk interval sesudah bin terakhir, memakai fungsi fitur yang sama dengan pelatihan."""
    upcoming = bins.index[-1] + pd.Timedelta(minutes=5)
    extended = pd.concat([bins, pd.DataFrame(index=[upcoming], columns=bins.columns, dtype=float)])
    return feature_frame(extended, sensors).iloc[[-1]], upcoming
