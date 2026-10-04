"""calib_best: decision-calibrated RF+ExtraTrees ensemble layered on the persistence rule.

Features (all past-only: built from shift(1) or more; only the clock time of interval t is used directly):
  persistence status at t-1 (+ pH/temp parts), signed margins to the pH/temp thresholds at t-1, 1-step deltas,
  6-bin temp trend, robust pH level (rolling medians) and its margin, pH deviation from its 6-bin median,
  pH 6-bin std, status at t-2/t-3, rolling alarm fractions (3/6/12/36), status changes and NaN count in 12 bins,
  gap flag, hour-of-day (sin/cos) of interval t.

Model: mean of RandomForest and ExtraTrees probabilities (300 trees each, depth 8/10, min_samples_leaf 5).

Decision calibration (inside X_train only, see fit_predict):
  1. Expanding-window, time-ordered inner OOF on X_train (5 equal chunks, the first ~4 used as successive
     validation blocks, 12-row purge gap, at least 300 training rows) -> out-of-fold P(alarm).
  2. Two thresholds chosen on those OOF rows to maximise macro F1:
       persistence says alarm  -> keep alarm unless P(alarm) <  t1
       persistence says normal -> keep normal unless P(alarm) > t0
     Pure persistence (t1=0, t0=1) is in the search and wins ties, so the model only overrides persistence
     where that helped out-of-fold.
  3. Refit on all of X_train and apply (t1, t0) to X_eval.
"""
import numpy as np
import pandas as pd
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline

INNER_SPLITS, INNER_GAP, INNER_MIN_ROWS, GRID = 4, 12, 300, np.linspace(0, 1, 41)


def _status(ph, temp, r):
    known = ph.notna() & temp.notna()
    out = pd.Series(np.nan, index=ph.index)
    out[known] = ((ph[known] < r['ph_min']) | (ph[known] > r['ph_max'])
                  | (temp[known] < r['temperature_min']) | (temp[known] > r['temperature_max'])).astype(float)
    return out


def build_features(bins, rules):
    f = pd.DataFrame(index=bins.index)
    ph1, t1 = bins.ph.shift(1), bins.temp.shift(1)
    ph2, t2 = bins.ph.shift(2), bins.temp.shift(2)
    s = _status(bins.ph, bins.temp, rules)            # status of each interval; only used shifted
    s1 = s.shift(1)
    phs = (~bins.ph.between(rules['ph_min'], rules['ph_max'])).astype(float).where(bins.ph.notna())
    ts = (~bins.temp.between(rules['temperature_min'], rules['temperature_max'])).astype(float).where(bins.temp.notna())
    f['rule'] = s1                                      # persistence rule (status of t-1)
    f['ph_out1'] = phs.shift(1)
    f['t_out1'] = ts.shift(1)
    f['t_lo_m'] = t1 - rules['temperature_min']        # signed margins: positive = inside the safe band
    f['t_hi_m'] = rules['temperature_max'] - t1
    f['ph_lo_m'] = ph1 - rules['ph_min']
    f['ph_hi_m'] = rules['ph_max'] - ph1
    f['ph_m'] = np.minimum(f['ph_lo_m'], f['ph_hi_m'])
    f['t_m'] = np.minimum(f['t_lo_m'], f['t_hi_m'])
    f['m'] = np.minimum(f['ph_m'], f['t_m'])
    f['t_d1'] = t1 - t2
    f['ph_d1'] = ph1 - ph2
    tmed6 = t1.rolling(6, min_periods=2).median()
    phmed6 = ph1.rolling(6, min_periods=2).median()
    phmed3 = ph1.rolling(3, min_periods=2).median()
    f['t_trend6'] = t1 - t1.shift(6)
    f['t_med6_m'] = tmed6 - rules['temperature_min']
    f['ph_dev6'] = ph1 - phmed6
    f['ph_med6_m'] = np.minimum(phmed6 - rules['ph_min'], rules['ph_max'] - phmed6)
    f['ph_med3_m'] = np.minimum(phmed3 - rules['ph_min'], rules['ph_max'] - phmed3)
    f['ph_std6'] = ph1.rolling(6, min_periods=2).std()
    f['s2'] = s.shift(2)
    f['s3'] = s.shift(3)
    for w in (3, 6, 12, 36):
        f[f'sfrac{w}'] = s1.rolling(w, min_periods=1).mean()
    f['ph_frac12'] = phs.shift(1).rolling(12, min_periods=1).mean()
    f['nchg12'] = s1.diff().abs().rolling(12, min_periods=1).sum()
    f['nan12'] = bins.ph.shift(1).isna().rolling(12, min_periods=1).sum()
    f['gap1'] = bins.ph.shift(2).isna().astype(float)
    hour = bins.index.hour + bins.index.minute / 60.0  # clock time of interval t: known in advance
    f['hsin'] = np.sin(2 * np.pi * hour / 24)
    f['hcos'] = np.cos(2 * np.pi * hour / 24)
    return f


class _MeanEnsemble:
    def __init__(self, models):
        self.models = models

    def fit(self, X, y):
        for m in self.models:
            m.fit(X, y)
        self.classes_ = np.array([0, 1])
        return self

    def predict_proba(self, X):
        p = np.mean([_proba(m, X) for m in self.models], axis=0)
        return np.column_stack([1 - p, p])


def make_model(seed):
    imp = lambda: SimpleImputer(strategy='median', add_indicator=True)
    rf = RandomForestClassifier(n_estimators=300, max_depth=8, min_samples_leaf=5, random_state=seed, n_jobs=1)
    et = ExtraTreesClassifier(n_estimators=300, max_depth=10, min_samples_leaf=5, random_state=seed, n_jobs=1)
    return _MeanEnsemble([Pipeline([('imp', imp()), ('rf', rf)]), Pipeline([('imp', imp()), ('et', et)])])


def _proba(model, X):
    return model.predict_proba(X)[:, list(model.classes_).index(1)]


def _fit_proba(make_model, seed, Xa, ya, Xb):
    if ya.nunique() < 2:
        return np.full(len(Xb), float(ya.iloc[0]))
    return _proba(make_model(seed).fit(Xa, ya), Xb)


def _rule(X):
    return np.nan_to_num(X['rule'].values, nan=1).astype(int)


def _macro_f1(y, q):
    tp = np.sum((q == 1) & (y == 1)); fp = np.sum((q == 1) & (y == 0)); fn = np.sum((q == 0) & (y == 1))
    tn = len(y) - tp - fp - fn
    f1_alarm = 2 * tp / (2 * tp + fp + fn) if tp + fp + fn else 0.0
    f1_normal = 2 * tn / (2 * tn + fn + fp) if tn + fp + fn else 0.0
    return (f1_alarm + f1_normal) / 2


def _decide(p, r, t1, t0):
    return np.where(r == 1, (p >= t1).astype(int), (p > t0).astype(int))


def _inner_oof(make_model, seed, X, y):
    """Expanding-window, time-ordered out-of-fold P(alarm) computed inside X_train only."""
    edges = np.linspace(0, len(X), INNER_SPLITS + 2).astype(int)[1:]
    P, Y, R = [], [], []
    for i in range(len(edges) - 1):
        a_end, b0, b1 = edges[i], edges[i] + INNER_GAP, edges[i + 1]
        if a_end < INNER_MIN_ROWS or b0 >= b1:
            continue
        P.append(_fit_proba(make_model, seed, X.iloc[:a_end], y.iloc[:a_end], X.iloc[b0:b1]))
        Y.append(y.iloc[b0:b1].values)
        R.append(_rule(X.iloc[b0:b1]))
    if not P:
        return None
    return np.concatenate(P), np.concatenate(Y), np.concatenate(R)


def choose_thresholds(make_model, seed, X_train, y_train):
    oof = _inner_oof(make_model, seed, X_train, y_train)
    if oof is None:
        return 0.0, 1.0
    p, y, r = oof
    best = (_macro_f1(y, r), 0.0, 1.0)                # start from pure persistence
    for t1 in GRID:
        for t0 in GRID:
            sc = _macro_f1(y, _decide(p, r, t1, t0))
            if sc > best[0] + 1e-12:
                best = (sc, t1, t0)
    return best[1], best[2]


def fit_predict(make_model, seed, X_train, y_train, X_eval):
    t1, t0 = choose_thresholds(make_model, seed, X_train, y_train)
    p = _fit_proba(make_model, seed, X_train, y_train, X_eval)
    return _decide(p, _rule(X_eval), t1, t0)
