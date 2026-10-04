"""Fixed evaluation harness for AquaSmart model improvements.

Usage: python harness.py <approach.py> [--seeds 42,0,1] [--holdout]

Protocol (identical for every approach, matches notebooks/02_baseline.ipynb):
- data: 08_Sistem-Cerdas/tugas_mandiri/data_bersih_5menit.csv (5-minute median bins)
- target: threshold-rules-v2 proxy status (pH 6.5-8.5, temp 25-30) at interval t
- evaluated rows: EXACTLY the baseline eligible rows (10,672) and split (8,525 / 2,135, 60-min purge)
- selection: TimeSeriesSplit(5, gap=12) on the TRAIN split only, compared with the
  persistence rule (status of t-1) on the same folds
- holdout: only with AQUASMART_HOLDOUT_UNLOCK=1 (the orchestrator runs it once)
- causality: features at/before a probe time must not change when later sensor values change

Approach module contract:
  build_features(bins, rules) -> DataFrame indexed like bins (past-only information)
  make_model(seed) -> estimator with fit / predict_proba
  optional THRESHOLD (float, default 0.5) on P(class 1)
  optional fit_predict(make_model, seed, X_train, y_train, X_eval) -> 0/1 labels (full control,
    may only learn from X_train/y_train)
"""
import importlib.util, json, os, sys, warnings
from pathlib import Path
import numpy as np, pandas as pd
from sklearn.metrics import f1_score, balanced_accuracy_score, recall_score, accuracy_score
from sklearn.model_selection import TimeSeriesSplit

warnings.filterwarnings('ignore')
DATA = Path(__file__).resolve().parents[1] / 'tugas_mandiri' / 'data_bersih_5menit.csv'
RULES = {'ph_min': 6.5, 'ph_max': 8.5, 'temperature_min': 25.0, 'temperature_max': 30.0}


def load_bins():
    bins = pd.read_csv(DATA, index_col='timestamp', parse_dates=['timestamp'], float_precision='round_trip')
    bins.index.freq = '5min'
    return bins


def label_status(ph, temp):
    known = ph.notna() & temp.notna()
    out = pd.Series(np.nan, index=ph.index)
    out.loc[known] = (~ph.loc[known].between(RULES['ph_min'], RULES['ph_max'])
                      | ~temp.loc[known].between(RULES['temperature_min'], RULES['temperature_max'])).astype(int)
    return out


def baseline_rows(bins):
    """Eligible rows and split exactly as mandiri.make_features / chronological_split."""
    ph1, temp1 = bins.ph.shift(1), bins.temp.shift(1)
    y = label_status(bins.ph, bins.temp)
    eligible = ph1.notna() & temp1.notna() & y.notna() & (np.arange(len(bins)) >= 12)
    idx = bins.index[eligible]
    cut = int(len(idx) * .8)
    boundary = idx[cut]
    train = idx[idx < boundary - pd.Timedelta(minutes=60)]
    test = idx[idx >= boundary]
    rule = label_status(ph1, temp1)
    return y.astype('float'), rule, train, test


def score(y, p):
    return {'macro_f1': float(f1_score(y, p, labels=[0, 1], average='macro', zero_division=0)),
            'balanced_accuracy': float(balanced_accuracy_score(y, p)),
            'recall_alarm': float(recall_score(y, p, pos_label=1, zero_division=0)),
            'accuracy': float(accuracy_score(y, p))}


def load(path):
    spec = importlib.util.spec_from_file_location('approach', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def predict(mod, seed, X_tr, y_tr, X_ev):
    if hasattr(mod, 'fit_predict'):
        return np.asarray(mod.fit_predict(mod.make_model, seed, X_tr, y_tr, X_ev)).astype(int)
    model = mod.make_model(seed).fit(X_tr, y_tr)
    proba = model.predict_proba(X_ev)[:, list(model.classes_).index(1)]
    return (proba >= getattr(mod, 'THRESHOLD', 0.5)).astype(int)


def causality(mod, bins):
    feats = mod.build_features(bins, RULES)
    probe = bins.index[len(bins) // 2]
    changed = bins.copy()
    changed.loc[probe:, ['ph', 'tds', 'temp']] += 0.37
    feats2 = mod.build_features(changed, RULES)
    before = feats.index[feats.index <= probe]
    try:
        pd.testing.assert_frame_equal(feats.loc[before], feats2.loc[before])
        return True, ''
    except AssertionError as e:
        return False, str(e)[:400]


def main():
    path = sys.argv[1]
    seeds = [42]
    if '--seeds' in sys.argv:
        seeds = [int(s) for s in sys.argv[sys.argv.index('--seeds') + 1].split(',')]
    mod = load(path)
    bins = load_bins()
    y, rule, train, test = baseline_rows(bins)
    feats = mod.build_features(bins, RULES)
    assert feats.index.equals(bins.index), 'build_features must keep the bins index'
    ok, why = causality(mod, bins)
    X_tr, y_tr = feats.loc[train], y.loc[train].astype(int)
    out = {'approach': path, 'n_features': feats.shape[1], 'rows': {'train': len(train), 'test': len(test)},
           'causality_ok': ok, 'causality_detail': why, 'seeds': {}}
    for seed in seeds:
        folds = []
        for k, (a, b) in enumerate(TimeSeriesSplit(n_splits=5, gap=12).split(X_tr), 1):
            p = predict(mod, seed, X_tr.iloc[a], y_tr.iloc[a], X_tr.iloc[b])
            yt = y_tr.iloc[b]
            folds.append({'fold': k, 'classes': int(yt.nunique()), 'model': score(yt, p),
                          'rule': score(yt, rule.loc[yt.index].astype(int))})
        two = [f for f in folds if f['classes'] == 2]
        out['seeds'][seed] = {
            'folds': folds,
            'two_class_model_macro_f1': float(np.mean([f['model']['macro_f1'] for f in two])),
            'two_class_rule_macro_f1': float(np.mean([f['rule']['macro_f1'] for f in two])),
            'all_model_macro_f1': float(np.mean([f['model']['macro_f1'] for f in folds])),
            'all_rule_macro_f1': float(np.mean([f['rule']['macro_f1'] for f in folds])),
        }
        s = out['seeds'][seed]
        s['delta_two_class'] = s['two_class_model_macro_f1'] - s['two_class_rule_macro_f1']
    if '--holdout' in sys.argv:
        if os.environ.get('AQUASMART_HOLDOUT_UNLOCK') != '1':
            sys.exit('holdout is locked: selection must use CV only')
        X_te, y_te = feats.loc[test], y.loc[test].astype(int)
        out['holdout'] = {str(seed): score(y_te, predict(mod, seed, X_tr, y_tr, X_te)) for seed in seeds}
        out['holdout_rule'] = score(y_te, rule.loc[test].astype(int))
    print(json.dumps(out, indent=1))


if __name__ == '__main__':
    main()
