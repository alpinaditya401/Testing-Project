"""Model v2 "ph-gated-logistic-v2": model pH berpagar regime.

Dipilih dari lima pendekatan lewat validasi silang temporal pada data latih saja
(08_Sistem-Cerdas/perbaikan_model/). Fitur dan aturan keputusan identik dengan modul
eksperimen `approaches/context_best.py`; tests/test_ml_parity.py membuktikannya.

- status(t) = suhu_keluar(t) ATAU pH_keluar(t). Hampir semua kesalahan aturan persistensi
  di data latih adalah pH yang naik-turun melintasi 6,5/8,5 saat suhu dalam ambang.
- Komponen pH: regresi logistik pada fitur konteks pH masa lalu (margin ambang beberapa
  tingkat penghalusan, EWMA, peluang Gauss keluar pita, riwayat pH keluar, simpangan).
  Target bantu pH_keluar(t) diambil dari baris latih berikutnya, hanya di dalam data latih.
- Komponen suhu: persistensi (suhu keluar pada t-1).
- Pagar regime: model hanya dipakai saat status berganti >= 4 kali dalam 36 interval (3 jam);
  di luar itu keputusan = persistensi (status t-1), sama dengan aturan ambang.

Hasil (holdout, dievaluasi sekali setelah pemilihan dikunci): macro F1 0,9081 lawan Random
Forest v1 0,8951 dan aturan persistensi 0,9158. Model ini lebih baik dari v1 tetapi belum
terbukti mengungguli aturan (selisih -0,0077, CI 95% [-0,025; +0,007]).
"""
import numpy as np
import pandas as pd
from scipy.stats import norm
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

NAME = 'ph-gated-logistic-v2'
WINDOWS = (3, 6, 12, 36)
SPANS = (3, 12)
GAUSS_WINDOWS = (6, 12, 36)
GATE_COL = 'flips36'
THRESHOLD = 0.5
PH_PREFIXES = ('ph_margin', 'gp_ph', 'ph_out', 'ph_std', 'ph_d1')
DEFAULT_PARAMS = {'C': 1.0, 'gate_k': 4}


def _status(ph, temp, rules):
    known = ph.notna() & temp.notna()
    out = (~ph.between(rules['ph_min'], rules['ph_max'])
           | ~temp.between(rules['temperature_min'], rules['temperature_max'])).astype(float)
    return out.where(known)


def _run_length(s):
    """Jumlah interval sejak nilai s (sudah digeser) terakhir berubah; NaN memutus rangkaian."""
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
    """Semua fitur memakai shift(1) atau lebih; tidak ada informasi dari interval t."""
    lo, hi = rules['ph_min'], rules['ph_max']
    tlo, thi = rules['temperature_min'], rules['temperature_max']
    ph = bins['ph'].shift(1)
    temp = bins['temp'].shift(1)

    def m_ph(x):
        return np.minimum(x - lo, hi - x)

    f = {'ph_lag1': ph, 'ph_d1': ph - bins['ph'].shift(2)}
    for w in WINDOWS:
        f[f'ph_std{w}'] = ph.rolling(w, min_periods=max(2, w // 3)).std()
    f['ph_margin1'] = m_ph(ph)
    f['ph_margin_lo'] = ph - lo
    f['ph_margin_hi'] = hi - ph
    for w in WINDOWS:
        r = ph.rolling(w, min_periods=max(2, w // 3))
        f[f'ph_margin_med{w}'] = m_ph(r.median())
        f[f'ph_margin_mean{w}'] = m_ph(r.mean())
    for s in SPANS:
        f[f'ph_margin_ewm{s}'] = m_ph(ph.ewm(span=s, ignore_na=True, min_periods=1).mean())
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
    for w in GAUSS_WINDOWS:
        r = ph.rolling(w, min_periods=max(3, w // 3))
        mu = 0.5 * r.mean() + 0.5 * ph
        sd = r.std().clip(lower=0.05)
        f[f'gp_ph{w}'] = norm.cdf((lo - mu) / sd) + norm.sf((hi - mu) / sd)
    return pd.DataFrame(f, index=bins.index).astype(float)


def ph_columns(columns):
    return [c for c in columns if c.startswith(PH_PREFIXES)]


class GatedPhModel:
    """Model terlatih v2. Disimpan dengan joblib; kelas ini harus tetap bisa diimpor."""

    def __init__(self, rules, C=1.0, gate_k=4):
        self.rules, self.C, self.gate_k = dict(rules), float(C), int(gate_k)
        self.ph_model = None
        self.columns = []

    def fit(self, X_train):
        # Target bantu pH_keluar(t) dari ph_lag1 baris latih berikutnya; baris yang baris
        # berikutnya tidak ada di data latih dibuang, jadi tidak ada yang berasal dari data uji.
        ph_t = X_train['ph_lag1'].reindex(X_train.index + pd.Timedelta(minutes=5)).to_numpy()
        ok = ~np.isnan(ph_t)
        target = ((ph_t < self.rules['ph_min']) | (ph_t > self.rules['ph_max'])).astype(int)
        self.columns = ph_columns(X_train.columns)
        if ok.sum() < 50 or len(np.unique(target[ok])) < 2:
            self.ph_model = None
            return self
        self.ph_model = Pipeline([('imp', SimpleImputer(strategy='median', add_indicator=True)),
                                  ('sc', StandardScaler()),
                                  ('m', LogisticRegression(C=self.C, max_iter=3000))]).fit(X_train.loc[ok, self.columns],
                                                                                           target[ok])
        return self

    def chattering(self, X):
        return np.nan_to_num(X[GATE_COL].to_numpy(), nan=0.0) >= self.gate_k

    def alarm_probability(self, X):
        """P(alarm) dari model pH dan persistensi suhu, sebelum pagar regime."""
        if self.ph_model is None:
            return X['status1'].to_numpy(dtype=float)
        classes = list(self.ph_model.classes_)
        p_ph = self.ph_model.predict_proba(X[self.columns])[:, classes.index(1)]
        return 1 - (1 - p_ph) * (1 - X['temp_out1'].to_numpy())

    def predict(self, X):
        persist = X['status1'].to_numpy().astype(int)
        decision = (self.alarm_probability(X) >= THRESHOLD).astype(int)
        return np.where(self.chattering(X), decision, persist)

    def contributions(self, X, limit=3):
        """Kontribusi lokal fitur pH: koefisien x nilai terstandar (positif = menaikkan risiko alarm)."""
        if self.ph_model is None:
            return []
        prepared = self.ph_model[:-1].transform(X[self.columns])[0]
        names = self.ph_model[:-1].get_feature_names_out(self.columns)
        coef = self.ph_model[-1].coef_[0]
        order = np.argsort(np.abs(coef * prepared))[::-1]
        out = []
        for i in order:
            if names[i].startswith('missingindicator_'):
                continue
            value = X.iloc[0][names[i]]
            out.append({'feature': names[i], 'importance': round(float(abs(coef[i] * prepared[i])), 4),
                        'direction': 'menaikkan' if coef[i] * prepared[i] > 0 else 'menurunkan',
                        'value': None if np.isnan(value) else round(float(value), 4)})
            if len(out) == limit:
                break
        return out
