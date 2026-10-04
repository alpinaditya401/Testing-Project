"""Boosting approach for AquaSmart next-interval alarm prediction.

Model: HistGradientBoostingClassifier (native NaN handling) on 72 past-only features
(status lags / rolling status / flip counts / run length, sensor lags, diffs, multi-window rolling
mean/std/median/EWM, signed margins to the pH and temperature thresholds, gap count).

Decision: hysteresis around persistence. The model may only depart from the persistence answer
(status at t-1) when it is confident in the flip: P(flip) >= HYST. HYST = 0.8 is a fixed constant
chosen from training-split TimeSeriesSplit CV (grid 0.5-0.9; 0.7-0.9 all beat the rule). No
holdout rows are used for anything.

All features use shift(1) or more; only the timestamp of t would be allowed beyond that and it is
not used (hour-of-day features hurt CV).
"""
import numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

SENSORS = ['ph', 'tds', 'temp']
HYST = 0.8


def _status(ph, temp, rules):
    known = ph.notna() & temp.notna()
    s = ((ph < rules['ph_min']) | (ph > rules['ph_max']) | (temp < rules['temperature_min'])
         | (temp > rules['temperature_max'])).astype(float)
    return s.where(known)


def _margin(x, lo, hi):
    """Signed distance inside [lo, hi]: positive = inside, negative = outside."""
    return np.minimum(x - lo, hi - x)


def build_features(bins, rules):
    f = pd.DataFrame(index=bins.index)
    ph, temp = bins.ph, bins.temp
    p1, t1 = ph.shift(1), temp.shift(1)
    st = _status(ph, temp, rules)          # status at t: only ever used shifted
    s1 = st.shift(1)
    f['status_lag1'] = s1
    f['status_lag2'] = st.shift(2)
    f['status_lag3'] = st.shift(3)
    for w in (3, 6, 12, 36):
        f[f'status_mean{w}'] = s1.rolling(w, min_periods=1).mean()
    flips = (s1 != s1.shift(1)).astype(float).where(s1.notna() & s1.shift(1).notna())
    for w in (6, 12, 36):
        f[f'flips{w}'] = flips.rolling(w, min_periods=1).sum()
    chg = (s1 != s1.shift(1)) & s1.notna()
    grp = chg.cumsum()
    f['run_len'] = grp.groupby(grp).cumcount() + 1   # intervals since last status change (past only)

    for col in SENSORS:
        past = bins[col].shift(1)
        f[f'{col}_lag1'] = past
        f[f'{col}_lag2'] = bins[col].shift(2)
        f[f'{col}_lag3'] = bins[col].shift(3)
        f[f'{col}_d1'] = past - bins[col].shift(2)
        f[f'{col}_d3'] = past - bins[col].shift(4)
        for w in (3, 6, 12, 36):
            f[f'{col}_mean{w}'] = past.rolling(w, min_periods=1).mean()
            f[f'{col}_std{w}'] = past.rolling(w, min_periods=2).std()
        for w in (3, 5):
            f[f'{col}_med{w}'] = past.rolling(w, min_periods=1).median()
        f[f'{col}_ewm6'] = past.ewm(span=6, ignore_na=True).mean()

    phm = _margin(p1, rules['ph_min'], rules['ph_max'])
    tm = _margin(t1, rules['temperature_min'], rules['temperature_max'])
    f['ph_margin'] = phm
    f['temp_margin'] = tm
    f['margin'] = np.minimum(phm, tm)
    f['ph_lo_dist'] = p1 - rules['ph_min']
    f['ph_hi_dist'] = p1 - rules['ph_max']
    f['temp_lo_dist'] = t1 - rules['temperature_min']
    for w in (3, 5):
        f[f'ph_med{w}_margin'] = _margin(f[f'ph_med{w}'], rules['ph_min'], rules['ph_max'])
        f[f'status_med{w}'] = _status(f[f'ph_med{w}'], f[f'temp_med{w}'], rules)
    f['ph_mean12_margin'] = _margin(f['ph_mean12'], rules['ph_min'], rules['ph_max'])
    f['temp_mean12_margin'] = _margin(f['temp_mean12'], rules['temperature_min'], rules['temperature_max'])
    miss = bins.ph.isna().astype(float).shift(1)
    f['miss12'] = miss.rolling(12, min_periods=1).sum()
    return f


def make_model(seed):
    return HistGradientBoostingClassifier(
        learning_rate=0.05, max_iter=200, max_depth=None, max_leaf_nodes=15, min_samples_leaf=50,
        l2_regularization=1.0, early_stopping=False, random_state=seed)


def fit_predict(make_model, seed, X_train, y_train, X_eval):
    model = make_model(seed).fit(X_train, y_train)
    p = model.predict_proba(X_eval)[:, list(model.classes_).index(1)]
    r = X_eval['status_lag1'].fillna(1).to_numpy()   # persistence answer (always known on eligible rows)
    # depart from persistence only when the flip has probability >= HYST
    return np.where(r == 1, p > 1 - HYST, p >= HYST).astype(int)
