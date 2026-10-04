"""Baseline from notebooks/02_baseline.ipynb (mandiri.py): 12 lag/rolling features + Random Forest."""
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

SENSORS = ['ph', 'tds', 'temp']
COLUMNS = [f'{s}_{k}' for s in SENSORS for k in ('lag1', 'lag2', 'mean12', 'std12')]


def build_features(bins, rules):
    f = pd.DataFrame(index=bins.index)
    for col in SENSORS:
        past = bins[col].shift(1)
        f[col + '_lag1'] = past
        f[col + '_lag2'] = bins[col].shift(2)
        f[col + '_mean12'] = past.rolling(12, min_periods=3).mean()
        f[col + '_std12'] = past.rolling(12, min_periods=3).std()
    return f


def make_model(seed):
    numeric = Pipeline([('imputer', SimpleImputer(strategy='median', add_indicator=True)), ('scale', StandardScaler())])
    pre = ColumnTransformer([('numeric', numeric, COLUMNS)], remainder='drop')
    model = RandomForestClassifier(n_estimators=160, max_depth=10, min_samples_leaf=5, class_weight='balanced',
                                   random_state=seed, n_jobs=2)
    return Pipeline([('preprocessing', pre), ('model', model)])
