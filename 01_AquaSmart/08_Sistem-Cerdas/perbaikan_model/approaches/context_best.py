"""Context approach (best variant): regime-gated, decomposed pH-out model.

Idea
- status(t) = temp_out(t) OR ph_out(t). Almost all persistence-rule errors on the training split are pH crossings
  while temperature is inside 25-30 C, but temperature is below 25 C ~82% of the time, which hides pH crossings
  from the status label. So the pH component is learned on ALL training rows with an auxiliary target
  ph_out(t), read from the next training row's ph_lag1 (training slice only; rows whose next bin is not in
  X_train are dropped, so nothing from the evaluation block or the purge gap is used).
- pH model: logistic regression on multi-scale context features of past pH: signed threshold margins of the last
  value / rolling median and mean (3, 6, 12, 36 bins) / EWMA (spans 3, 12), Gaussian P(next value outside the
  band) from rolling level and spread (6, 12, 36 bins), pH-out history (fractions, run length), rolling std and
  the last change.
- temp component: persistence (temp_out at t-1); a learned temp model did not help in CV.
- P(alarm) = 1 - (1 - P(ph_out)) * (1 - temp_out(t-1)), decision threshold 0.5 (fixed, not tuned).
- Context gate: use the model only in a chattering regime (>= 4 status flips in the last 36 bins = 3 h);
  otherwise keep the persistence decision (status at t-1). Gate constants were chosen from training-split CV
  (k = 3..8 all give delta ~+0.011..+0.014; k = 4 kept).

All sensor-derived features use shift(1) or more; nothing from interval t is used.
"""
import numpy as np
import pandas as pd
from scipy.stats import norm
from threadpoolctl import threadpool_limits
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

threadpool_limits(limits=1)  # shared CPU box: avoid thread oversubscription

WINDOWS = (3, 6, 12, 36)
SPANS = (3, 12)
GAUSS_WINDOWS = (6, 12, 36)
GATE_COL, GATE_K = 'flips36', 4
THRESHOLD = 0.5
RULES_ = {'ph_min': 6.5, 'ph_max': 8.5, 'temperature_min': 25.0, 'temperature_max': 30.0}
PH_PREFIXES = ('ph_margin', 'gp_ph', 'ph_out', 'ph_std', 'ph_d1')


def _status(ph, temp, rules):
    known = ph.notna() & temp.notna()
    out = (~ph.between(rules['ph_min'], rules['ph_max'])
           | ~temp.between(rules['temperature_min'], rules['temperature_max'])).astype(float)
    return out.where(known)


def _run_length(s):
    """Bins since the value of s last changed (s already shifted); NaN breaks runs."""
    vals = s.to_numpy()
    out = np.full(len(vals), np.nan)
    run, prev = 0, np.nan
    for i, v in enumerate(vals):
        if np.isnan(v):
            run, prev = 0, np.nan
            continue
        run = run + 1 if v == prev else 1
        prev = v
        out[i] = run
    return pd.Series(out, index=s.index)


def build_features(bins, rules):
    lo, hi = rules['ph_min'], rules['ph_max']
    tlo, thi = rules['temperature_min'], rules['temperature_max']
    ph = bins['ph'].shift(1)
    temp = bins['temp'].shift(1)

    def m_ph(x):
        return np.minimum(x - lo, hi - x)

    f = {'ph_lag1': ph, 'ph_d1': ph - bins['ph'].shift(2)}
    for w in WINDOWS:
        f[f'ph_std{w}'] = ph.rolling(w, min_periods=max(2, w // 3)).std()
    # signed distance to the nearest pH threshold (negative = outside) at several smoothing levels
    f['ph_margin1'] = m_ph(ph)
    f['ph_margin_lo'] = ph - lo
    f['ph_margin_hi'] = hi - ph
    for w in WINDOWS:
        r = ph.rolling(w, min_periods=max(2, w // 3))
        f[f'ph_margin_med{w}'] = m_ph(r.median())
        f[f'ph_margin_mean{w}'] = m_ph(r.mean())
    for s in SPANS:
        f[f'ph_margin_ewm{s}'] = m_ph(ph.ewm(span=s, ignore_na=True, min_periods=1).mean())
    # status / pH-out history
    st = _status(ph, temp, rules)
    ph_out = (~ph.between(lo, hi)).astype(float).where(ph.notna())
    f['status1'] = st
    f['ph_out1'] = ph_out
    f['temp_out1'] = (~temp.between(tlo, thi)).astype(float).where(temp.notna())
    for w in WINDOWS:
        f[f'ph_out_frac{w}'] = ph_out.rolling(w, min_periods=max(2, w // 3)).mean()
    flip = (st != st.shift(1)).astype(float).where(st.notna() & st.shift(1).notna())
    f['flips36'] = flip.rolling(36, min_periods=12).sum()
    f['ph_out_run'] = _run_length(ph_out)
    # Gaussian P(next pH outside band) from rolling level (mixed with last value) and spread
    for w in GAUSS_WINDOWS:
        r = ph.rolling(w, min_periods=max(3, w // 3))
        mu = 0.5 * r.mean() + 0.5 * ph
        sd = r.std().clip(lower=0.05)
        f[f'gp_ph{w}'] = norm.cdf((lo - mu) / sd) + norm.sf((hi - mu) / sd)
    return pd.DataFrame(f, index=bins.index).astype(float)


def make_model(seed):
    """pH-out component model (deterministic; seed unused by lbfgs logistic regression)."""
    return Pipeline([('imp', SimpleImputer(strategy='median', add_indicator=True)), ('sc', StandardScaler()),
                     ('m', LogisticRegression(C=1.0, max_iter=3000))])


def _ph_cols(X):
    return [c for c in X.columns if c.startswith(PH_PREFIXES)]


def fit_predict(make_model, seed, X_train, y_train, X_eval):
    persist = X_eval['status1'].to_numpy().astype(int)
    # auxiliary target ph_out(t) from the next training row's lag-1 pH (training slice only)
    ph_t = X_train['ph_lag1'].reindex(X_train.index + pd.Timedelta(minutes=5)).to_numpy()
    ok = ~np.isnan(ph_t)
    target = ((ph_t < RULES_['ph_min']) | (ph_t > RULES_['ph_max'])).astype(int)
    if ok.sum() < 50 or len(np.unique(target[ok])) < 2:
        return persist
    cols = _ph_cols(X_train)
    model = make_model(seed).fit(X_train.loc[ok, cols], target[ok])
    p_ph = model.predict_proba(X_eval[cols])[:, list(model.classes_).index(1)]
    p_alarm = 1 - (1 - p_ph) * (1 - X_eval['temp_out1'].to_numpy())
    decision = (p_alarm >= THRESHOLD).astype(int)
    chattering = np.nan_to_num(X_eval[GATE_COL].to_numpy(), nan=0.0) >= GATE_K
    return np.where(chattering, decision, persist)
