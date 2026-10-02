"""Data and evaluation helpers for the Hari 1 AquaSmart assignment."""
from pathlib import Path
import hashlib
import json
import re

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score, recall_score

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RAW = HERE / 'data/pond_iot_2023_raw.csv'
OUT = HERE / 'tugas_mandiri'
OUT.mkdir(exist_ok=True)
SENSORS = ['ph', 'tds', 'temp']
SEED = 42
# Label proksi bergantung pada ambang aplikasi. Hasil yang dilaporkan dihitung
# dengan versi ini; versi lain akan mengubah target dan skor tanpa peringatan.
RULES_VERSION = 'threshold-rules-v2'


def read_rules():
    source = ROOT / '01_AquaSmart/01_Aplikasi-Web/server/src/ThresholdRules.php'
    text = source.read_text(encoding='utf-8')
    version = re.search(r"const VERSION = '([^']+)';", text)[1]
    if version != RULES_VERSION:
        raise RuntimeError(f'ThresholdRules.php berversi {version}, sedangkan hasil tugas ini memakai '
                           f'{RULES_VERSION}. Perbarui RULES_VERSION dan laporkan ulang skornya.')
    rules = {k: float(re.search(r'const ' + k + r' = ([\d.]+);', text)[1])
             for k in ['PH_MIN', 'PH_MAX', 'TEMP_MIN', 'TEMP_MAX']}
    return rules


RULES = read_rules()


def read_raw():
    if not RAW.exists():
        raise FileNotFoundError(f'Dataset belum tersedia: {RAW}. Baca README_MANDIRI.md.')
    return pd.read_csv(RAW, encoding='utf-8-sig')


def clean_data(raw):
    df = raw.rename(columns={'water_pH': 'ph', 'TDS': 'tds', 'water_temp': 'temp'}).copy()
    df['timestamp'] = pd.to_datetime(df.created_date.astype(str).str.strip(),
                                   format='%m/%d/%Y %H:%M', errors='coerce')
    for col in SENSORS:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    invalid = {'ph': ~df.ph.between(0, 14) & df.ph.notna(),
               'tds': (df.tds < 0) & df.tds.notna(),
               'temp': ~df.temp.between(0, 100) & df.temp.notna()}
    counts = {col: int(mask.sum()) for col, mask in invalid.items()}
    for col, mask in invalid.items():
        df.loc[mask, col] = np.nan
    invalid_time = int(df.timestamp.isna().sum())
    df = df.dropna(subset=['timestamp'])
    # Minute-resolution repeated measurements cannot be proven duplicate events.
    # Collapse identical timestamp/value tuples to avoid over-weighting repeats.
    duplicate = int(df.duplicated(['timestamp'] + SENSORS).sum())
    df = df.drop_duplicates(['timestamp'] + SENSORS).sort_values('timestamp')
    bins = df.set_index('timestamp')[SENSORS].resample('5min').median()
    audit = {'raw_rows': len(raw), 'raw_columns': len(raw.columns),
             'exact_duplicates': int(raw.duplicated().sum()),
             'repeated_measurements_collapsed': duplicate, 'invalid_timestamp': invalid_time,
             'impossible_values': counts, 'unique_measurements': len(df),
             'grid_bins': len(bins), 'empty_bins': int(bins.isna().all(axis=1).sum()),
             'raw_sha256': hashlib.sha256(RAW.read_bytes()).hexdigest()}
    return bins, audit


def load_bins():
    """Bin lima menit dari CSV mentah, atau dari turunan yang di-commit bila mentah tidak ada.

    data_bersih_5menit.csv adalah keluaran clean_data() yang disimpan 01_eda. Seluruh
    metrik 02_baseline terbukti identik bila dihitung dari berkas ini. Audit data mentah
    diambil dari eda.json karena tidak dapat dihitung ulang tanpa CSV mentah.
    """
    if RAW.exists():
        return clean_data(read_raw())
    derived = OUT / 'data_bersih_5menit.csv'
    if not derived.exists():
        raise FileNotFoundError(f'Dataset belum tersedia: {RAW} maupun {derived}. Baca README_MANDIRI.md.')
    print('CSV mentah tidak ada; memakai data_bersih_5menit.csv yang di-commit.')
    bins = pd.read_csv(derived, index_col='timestamp', parse_dates=['timestamp'],
                       float_precision='round_trip')
    bins.index.freq = '5min'
    audit = json.loads((OUT / 'eda.json').read_text(encoding='utf-8'))['audit']
    return bins, audit


def label_status(ph, temp):
    known = ph.notna() & temp.notna()
    result = pd.Series(np.nan, index=ph.index, name='target_proxy')
    result.loc[known] = (~ph.loc[known].between(RULES['PH_MIN'], RULES['PH_MAX']) |
                         ~temp.loc[known].between(RULES['TEMP_MIN'], RULES['TEMP_MAX'])).astype(int)
    return result


def make_features(bins):
    features = pd.DataFrame(index=bins.index)
    for col in SENSORS:
        past = bins[col].shift(1)
        features[col + '_lag1'] = past
        features[col + '_lag2'] = bins[col].shift(2)
        features[col + '_mean12'] = past.rolling(12, min_periods=3).mean()
        features[col + '_std12'] = past.rolling(12, min_periods=3).std()
    # A prediction requires pH and temperature from the immediately prior bin.
    # This is a deployment availability rule, not imputation with future data.
    eligible = features[['ph_lag1', 'temp_lag1']].notna().all(axis=1)
    eligible &= label_status(bins.ph, bins.temp).notna()
    eligible &= np.arange(len(bins)) >= 12
    y = label_status(bins.ph, bins.temp)
    return features.loc[eligible], y.loc[eligible].astype(int)


def chronological_split(X, y):
    cut = int(len(X) * .8)
    boundary = X.index[cut]
    # Purge one full rolling window at the holdout boundary.
    train_mask = X.index < boundary - pd.Timedelta(minutes=60)
    test_mask = X.index >= boundary
    return X.loc[train_mask], X.loc[test_mask], y.loc[train_mask], y.loc[test_mask]


def pipeline(columns, estimator=None):
    numeric = Pipeline([('imputer', SimpleImputer(strategy='median', add_indicator=True)),
                        ('scale', StandardScaler())])
    preprocess = ColumnTransformer([('numeric', numeric, list(columns))], remainder='drop')
    model = estimator if estimator is not None else RandomForestClassifier(
        n_estimators=160, max_depth=10, min_samples_leaf=5,
        class_weight='balanced', random_state=SEED, n_jobs=2)
    return Pipeline([('preprocessing', preprocess), ('model', model)])


def score(y, pred):
    return {'macro_f1': f1_score(y, pred, labels=[0, 1], average='macro', zero_division=0),
            'balanced_accuracy': balanced_accuracy_score(y, pred),
            'recall_alarm': recall_score(y, pred, pos_label=1, zero_division=0),
            'accuracy': accuracy_score(y, pred)}
