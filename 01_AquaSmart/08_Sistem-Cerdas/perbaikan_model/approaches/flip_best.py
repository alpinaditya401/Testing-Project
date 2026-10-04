"""Transition (flip) model - best variant (flip_v4 / flip_v7 family, constants frozen).

Idea. The persistence rule predicts status(t) = status(t-1); its only errors are status flips. This module
estimates P(flip at t | past) and outputs status(t-1) XOR (P(flip) > threshold[status(t-1)]).

Almost every status flip in the data is pH crossing 6.5 / 8.5 while the temperature sits inside 25-30 C
(the temperature is smooth and crosses 25 C only ~26 times in the training split). Status flips are rare
(229 in the training split) but pH crossings are not (~1300, most of them while a cold temperature keeps the
status at 1 anyway), so the flip probability is built from two sub-models:

  P(pH out at t)   monotone-constrained HistGradientBoosting on past-only pH margin features
                   (distance of lags / rolling means / medians / EWMAs to the nearest pH bound, the same
                   margins divided by the local noise level, recent out-of-range fractions, noise level,
                   crossing counts, margin trend, hour of day of t). It is trained on ALL training rows;
                   its label php(t) is read from the NEXT training row's php1 column (pH status of t-1),
                   i.e. it learns only from X_train (y_train==0 also implies php=0).
                   Monotonic constraints: deeper inside the range -> less likely out; more recent
                   out-of-range bins -> more likely out (stops odd extrapolation, e.g. after data gaps).
  P(temp out at t) persistence of the temperature status, except when temp(t-1) sits on the quantised
                   boundary (25.00 / 24.94 C, 30.00 / 30.06 C), where a smoothed crossing rate estimated
                   from the training rows is used.
  P(status(t)=1)   = 1 - (1 - P_ph) * (1 - P_temp)
  P(flip)          = P(status(t) != status(t-1))

Thresholds (fixed constants chosen from the training-split CV, no holdout involved):
  THR_TO0 = 0.5  alarm -> normal flips when a return into range is more likely than not
                 (CV plateau 0.4-0.5; macro-F1 theory gives F1*/2 ~ 0.45, 0.5 is the conservative end).
  THR_TO1 = 0.8  normal -> alarm flips only on a very confident prediction (CV: 0->1 flips never helped at
                 thresholds <= 0.7; 0.8 keeps macro F1 equal to "never" and recovers a little alarm recall).
"""
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from threadpoolctl import threadpool_limits

THR_TO0 = 0.5
THR_TO1 = 0.8
MAX_FEATURES = 1.0   # no feature subsampling: the model is deterministic, seeds give identical results
N_BAG = 1            # >1 averages seed-derived models (only useful with MAX_FEATURES < 1)


def _margin(level, lo, hi):
    """Signed distance to the nearest bound, positive inside [lo, hi]."""
    return np.minimum(level - lo, hi - level)


def build_features(bins, rules):
    f = pd.DataFrame(index=bins.index)
    ph, temp = bins.ph, bins.temp
    lo, hi = rules['ph_min'], rules['ph_max']
    tlo, thi = rules['temperature_min'], rules['temperature_max']
    php = (~ph.between(lo, hi)).astype(float).where(ph.notna())
    tp = (~temp.between(tlo, thi)).astype(float).where(temp.notna())
    st = 1 - (1 - php) * (1 - tp)
    # everything below uses values up to t-1 only (shift >= 1); hour of day of t is known in advance
    f['s1'] = st.shift(1)
    f['php1'] = php.shift(1)
    f['tp1'] = tp.shift(1)

    p1 = ph.shift(1)
    for k in range(1, 7):
        f[f'phm_lag{k}'] = _margin(ph.shift(k), lo, hi)
    levels = {'m3': p1.rolling(3, min_periods=1).mean(),
              'm6': p1.rolling(6, min_periods=2).mean(),
              'm12': p1.rolling(12, min_periods=3).mean(),
              'md5': p1.rolling(5, min_periods=2).median(),
              'md9': p1.rolling(9, min_periods=3).median(),
              'ew2': p1.ewm(alpha=0.2, ignore_na=True).mean(),
              'ew4': p1.ewm(alpha=0.4, ignore_na=True).mean()}
    sig12 = p1.diff().rolling(12, min_periods=4).std() / np.sqrt(2)
    sig36 = p1.diff().rolling(36, min_periods=6).std() / np.sqrt(2)
    f['phs_sig12'] = sig12
    f['phs_sig36'] = sig36
    sig = sig12.clip(lower=0.03)
    for k, L in levels.items():
        m = _margin(L, lo, hi)
        f['phm_' + k] = m
        f['phz_' + k] = m / sig
    f['phf_frac6'] = php.shift(1).rolling(6, min_periods=1).mean()
    f['phf_frac12'] = php.shift(1).rolling(12, min_periods=1).mean()
    f['phf_frac36'] = php.shift(1).rolling(36, min_periods=1).mean()
    chp = ((php != php.shift(1)) & php.notna() & php.shift(1).notna()).astype(float)
    f['phs_nch12'] = chp.shift(1).rolling(12, min_periods=1).sum()
    f['phs_nvalid12'] = p1.notna().astype(float).rolling(12, min_periods=1).sum()
    f['phs_mtrend'] = _margin(levels['m3'], lo, hi) - _margin(p1.shift(3).rolling(3, min_periods=1).mean(), lo, hi)

    t1 = temp.shift(1)
    f['tm_l1'] = _margin(t1, tlo, thi)
    hr = bins.index.hour + bins.index.minute / 60
    f['hsin'] = np.sin(2 * np.pi * hr / 24)
    f['hcos'] = np.cos(2 * np.pi * hr / 24)
    return f


def _ph_cols(X):
    cols, mono = [], []
    for c in X.columns:
        if c.startswith('phm_') or c.startswith('phz_'):
            cols.append(c); mono.append(-1)
        elif c.startswith('phf_') or c == 'php1':
            cols.append(c); mono.append(1)
        elif c.startswith('phs_') or c in ('hsin', 'hcos'):
            cols.append(c); mono.append(0)
    return cols, mono


def make_model(seed, mono=None):
    return HistGradientBoostingClassifier(max_iter=250, learning_rate=0.04, max_leaf_nodes=15, min_samples_leaf=40,
                                          l2_regularization=1.0, max_features=MAX_FEATURES, monotonic_cst=mono,
                                          random_state=seed)


def _next(X, col):
    """Value of `col` in the training row 5 minutes later (NaN when that row is not in X)."""
    nxt = X[col].reindex(X.index + pd.Timedelta(minutes=5))
    return pd.Series(nxt.to_numpy(), index=X.index)


def ph_out_proba(make_model, seed, X_train, y_train, X_eval):
    cols, mono = _ph_cols(X_train)
    tgt = _next(X_train, 'php1')
    tgt[tgt.isna() & (y_train == 0)] = 0.0
    ok = tgt.notna()
    out = []
    with threadpool_limits(limits=1):
        for b in range(N_BAG):
            m = make_model(seed * 1000 + b, mono).fit(X_train.loc[ok, cols], tgt[ok].astype(int))
            out.append(m.predict_proba(X_eval[cols])[:, 1])
    return np.mean(out, axis=0)


def temp_out_proba(X_train, X_eval):
    p = X_eval['tp1'].to_numpy().astype(float)
    tgt = _next(X_train, 'tp1')
    for side in (0, 1):
        def at_boundary(X):
            m = X['tm_l1']
            near = (m < 0.035) if side == 0 else (m > -0.07)   # one quantisation step from the bound
            return (X['tp1'] == side) & near
        bt = at_boundary(X_train) & tgt.notna()
        rate = (float((tgt[bt] != side).sum()) + 0.5) / (bt.sum() + 5.0)
        p[at_boundary(X_eval).to_numpy()] = rate if side == 0 else 1 - rate
    return p


def flip_proba(make_model, seed, X_train, y_train, X_eval):
    p_ph = ph_out_proba(make_model, seed, X_train, y_train, X_eval)
    p_t = temp_out_proba(X_train, X_eval)
    p1 = 1 - (1 - p_ph) * (1 - p_t)
    s1 = X_eval['s1'].to_numpy().astype(int)
    return np.where(s1 == 1, 1 - p1, p1), s1


def fit_predict(make_model, seed, X_train, y_train, X_eval):
    pflip, s1 = flip_proba(make_model, seed, X_train, y_train, X_eval)
    thr = np.where(s1 == 1, THR_TO0, THR_TO1)
    return np.where(pflip > thr, 1 - s1, s1)
