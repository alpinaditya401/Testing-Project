"""margins_best: persistence-aware margin features + local Markov transition estimates + ExtraTrees.

Why: on the training split, 220 of 229 persistence-rule errors are pH flickering around 6.5/8.5 (temp mostly
gates the status to "alarm" because it sits below 25 C). The rule pays two errors per short excursion; the model
learns when an excursion is likely to revert (lag-1 vs. smoothed pH margins, flip counts) and when the local
regime keeps alarming (local transition probabilities P(alarm | previous status) over the last 12/36 steps).

Causality: every sensor-derived feature uses values at t-1 or earlier (shift(1)/shift(2) then rolling/ewm).
Decision threshold: fixed 0.5 (CV showed 0.4 ~ equal, 0.6 worse, inner-validation tuning no better).
Class weight {0: 3, 1: 1} (softer than 'balanced' ~5:1, chosen from training-split CV via the harness).
"""
import numpy as np
import pandas as pd
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline

THRESHOLD = 0.5
MARKOV_WINDOWS = (12, 36)
MARKOV_ALPHA = 2.0


def _status(ph, temp, r):
    known = ph.notna() & temp.notna()
    bad = (~ph.between(r['ph_min'], r['ph_max'])) | (~temp.between(r['temperature_min'], r['temperature_max']))
    return bad.astype(float).where(known)


def _in(x, lo, hi):
    """Signed distance to the nearest threshold; positive = inside the normal band."""
    return np.minimum(x - lo, hi - x)


def build_features(bins, rules):
    f = pd.DataFrame(index=bins.index)
    plo, phi, tlo, thi = rules['ph_min'], rules['ph_max'], rules['temperature_min'], rules['temperature_max']
    ph1, ph2 = bins.ph.shift(1), bins.ph.shift(2)
    t1, t2 = bins.temp.shift(1), bins.temp.shift(2)
    st = _status(bins.ph, bins.temp, rules)           # status at t (never used unshifted)
    s1 = st.shift(1)

    # persistence status and its recent history
    f['rule1'] = s1
    f['rule2'] = st.shift(2)
    f['rule3'] = st.shift(3)
    for k in (3, 6, 12):
        f[f'alarm_frac{k}'] = s1.rolling(k, min_periods=1).mean()
    flips = (s1 != s1.shift(1)).astype(float).where(s1.notna() & s1.shift(1).notna())
    f['flips6'] = flips.rolling(6, min_periods=1).sum()
    f['flips12'] = flips.rolling(12, min_periods=1).sum()

    # signed distances of lag-1 values to each threshold
    f['ph_lo'] = ph1 - plo
    f['ph_hi'] = phi - ph1
    f['ph_in'] = _in(ph1, plo, phi)
    f['ph2_in'] = _in(ph2, plo, phi)
    f['t_lo'] = t1 - tlo
    f['t_hi'] = thi - t1
    f['t_in'] = _in(t1, tlo, thi)

    # first differences and their rolling means
    dph, dt = ph1 - ph2, t1 - t2
    f['dph'] = dph
    f['dt'] = dt
    for k in (3, 6):
        f[f'dph_mean{k}'] = dph.rolling(k, min_periods=1).mean()
        f[f'dt_mean{k}'] = dt.rolling(k, min_periods=1).mean()

    # margins of smoothed levels, volatility, 1-hour temp change
    for k in (3, 6, 12):
        f[f'ph_med{k}_in'] = _in(ph1.rolling(k, min_periods=1).median(), plo, phi)
        f[f't_mean{k}_in'] = _in(t1.rolling(k, min_periods=1).mean(), tlo, thi)
    f['ph_std6'] = ph1.rolling(6, min_periods=2).std()
    f['ph_std12'] = ph1.rolling(12, min_periods=2).std()
    f['t_d12'] = t1 - bins.temp.shift(13)

    # pH-only out-of-band status history
    phst = (~bins.ph.between(plo, phi)).astype(float).where(bins.ph.notna())
    p1 = phst.shift(1)
    f['phbad1'] = p1
    f['phbad2'] = phst.shift(2)
    for k in (3, 6, 12):
        f[f'phbad_frac{k}'] = p1.rolling(k, min_periods=1).mean()

    # local Markov transition estimates from status pairs (s[j-1], s[j]) with j <= t-1
    a, b = st.shift(2), st.shift(1)
    ok = a.notna() & b.notna()
    for k in MARKOV_WINDOWS:
        n0 = ((a == 0) & ok).astype(float).rolling(k, min_periods=1).sum()
        n01 = ((a == 0) & (b == 1)).astype(float).rolling(k, min_periods=1).sum()
        n1 = ((a == 1) & ok).astype(float).rolling(k, min_periods=1).sum()
        n11 = ((a == 1) & (b == 1)).astype(float).rolling(k, min_periods=1).sum()
        prior = s1.rolling(k, min_periods=1).mean().fillna(0.5)
        p01 = (n01 + MARKOV_ALPHA * prior) / (n0 + MARKOV_ALPHA)
        p11 = (n11 + MARKOV_ALPHA * prior) / (n1 + MARKOV_ALPHA)
        f[f'mk_p01_{k}'] = p01
        f[f'mk_p11_{k}'] = p11
        f[f'mk_next_{k}'] = pd.Series(np.where(s1 == 1, p11, p01), index=f.index).where(s1.notna())
    return f


def make_model(seed):
    et = ExtraTreesClassifier(n_estimators=800, max_depth=8, min_samples_leaf=5, max_features='sqrt',
                              class_weight={0: 3.0, 1: 1.0}, random_state=seed, n_jobs=2)
    return Pipeline([('imp', SimpleImputer(strategy='median')), ('m', et)])
