"""Bangun notebooks/03_perbaikan_model.ipynb (tanpa output; jalankan lalu simpan dengan nbclient atau Jupyter)."""
from pathlib import Path
import textwrap
import nbformat as nbf

ROOT = Path(__file__).resolve().parents[2]


def md(text):
    return nbf.v4.new_markdown_cell(textwrap.dedent(text).strip())


def code(text):
    return nbf.v4.new_code_cell(textwrap.dedent(text).strip())


cells = [md('''
# Perbaikan model AquaSmart: dapatkah model mengungguli aturan persistensi?
Python untuk Sistem Cerdas • lanjutan Tugas Mandiri Hari 1 • 4 Oktober 2026

Random Forest di `02_baseline.ipynb` kalah dari aturan persistensi (status interval sebelumnya):
macro F1 holdout 0,8951 lawan 0,9158. Notebook ini menguji lima pendekatan perbaikan dengan protokol
tetap di `08_Sistem-Cerdas/perbaikan_model/harness.py`:

1. Baris yang dievaluasi dan pembagian latih/uji sama persis dengan notebook 02.
2. Pemilihan hanya lewat validasi silang temporal pada data latih, dibandingkan dengan aturan pada fold yang sama.
3. Fitur wajib kausal (diuji otomatis).
4. Holdout dievaluasi **sekali**, setelah pemilihan dikunci.
'''), code('''
from pathlib import Path
import json, sys
import numpy as np
import pandas as pd
from IPython.display import display
ROOT = next((p for p in [Path.cwd(), *Path.cwd().parents]
             if (p / '01_AquaSmart/08_Sistem-Cerdas/perbaikan_model/harness.py').exists()), None)
if ROOT is None:
    raise RuntimeError('Jalankan notebook dari akar repository atau folder notebooks.')
HERE = ROOT / '01_AquaSmart/08_Sistem-Cerdas/perbaikan_model'
sys.path.insert(0, str(HERE))
from harness import RULES, load_bins, baseline_rows, load, predict, score, causality
from sklearn.model_selection import TimeSeriesSplit
bins = load_bins()
y, rule, train, test = baseline_rows(bins)
print('Baris latih:', len(train), '| baris uji:', len(test))
'''), md('''
## Validasi silang pada data latih
Setiap pendekatan dievaluasi dengan seed 42, 0, 1, 7, 123, dan 2024 (himpunan seed terluas yang dilaporkan saat
pemilihan). Fold 5 hanya memiliki satu kelas, sehingga ukuran utama adalah rata-rata macro F1 pada fold dua kelas
dikurangi milik aturan. Dua teratas praktis seri; urutannya bergantung pada himpunan seed.
'''), code('''
APPROACHES = ['baseline', 'context_best', 'margins_best', 'flip_best', 'boost_best', 'calib_best']

def cv(mod, seed):
    feats = mod.build_features(bins, RULES)
    X_tr, y_tr = feats.loc[train], y.loc[train].astype(int)
    rows = []
    for k, (a, b) in enumerate(TimeSeriesSplit(n_splits=5, gap=12).split(X_tr), 1):
        yt = y_tr.iloc[b]
        rows.append({'fold': k, 'kelas': yt.nunique(),
                     'model': score(yt, predict(mod, seed, X_tr.iloc[a], y_tr.iloc[a], X_tr.iloc[b]))['macro_f1'],
                     'aturan': score(yt, rule.loc[yt.index].astype(int))['macro_f1']})
    return pd.DataFrame(rows)

summary = []
for name in APPROACHES:
    mod = load(str(HERE / 'approaches' / f'{name}.py'))
    deltas = []
    for seed in (42, 0, 1, 7, 123, 2024):
        two = cv(mod, seed).query('kelas == 2')
        deltas.append(two.model.mean() - two.aturan.mean())
    summary.append({'pendekatan': name, 'kausal': causality(mod, bins)[0],
                    'rata_delta_cv': np.mean(deltas), 'delta_min': np.min(deltas)})
ranking = pd.DataFrame(summary).sort_values('rata_delta_cv', ascending=False).reset_index(drop=True)
display(ranking.round(4))
'''), md('''
## Pendekatan terpilih: model pH berpagar regime (`context_best`)
Status alarm = suhu keluar ambang ATAU pH keluar ambang. Hampir semua kesalahan aturan di data latih adalah pH
yang naik-turun melintasi 6,5/8,5 saat suhu dalam ambang. Komponen pH memakai regresi logistik pada fitur konteks
pH masa lalu; komponen suhu memakai persistensi. Model hanya dipakai saat status berganti minimal 4 kali dalam
36 interval (3 jam); di luar itu keputusan sama dengan aturan. Konstanta dipilih dari CV data latih.
'''), code('''
selected = load(str(HERE / 'approaches' / 'context_best.py'))
folds = cv(selected, 42)
folds['selisih'] = folds.model - folds.aturan
display(folds.round(4))
print('Bagian keuntungan dari fold 3:', round(folds.selisih[2] / folds.query('kelas == 2').selisih.sum(), 3))
'''), md('''
## Holdout, dievaluasi sekali
Pemilihan sudah dikunci di atas. Holdout dipakai untuk pendekatan terpilih, baseline Random Forest, dan aturan.
Selisih terhadap aturan diuji dengan bootstrap blok berpasangan (blok 12 baris, 2000 sampel ulang).
'''), code('''
def holdout(mod):
    feats = mod.build_features(bins, RULES)
    pred = predict(mod, 42, feats.loc[train], y.loc[train].astype(int), feats.loc[test])
    return pred, score(y.loc[test].astype(int), pred)

y_te = y.loc[test].astype(int).to_numpy()
p_sel, s_sel = holdout(selected)
_, s_base = holdout(load(str(HERE / 'approaches' / 'baseline.py')))
p_rule = rule.loc[test].astype(int).to_numpy()
table = pd.DataFrame([{'model': 'Aturan persistensi', **score(y_te, p_rule)},
                      {'model': 'Terpilih (v2)', **s_sel}, {'model': 'Random Forest v1', **s_base}])
display(table.round(4))

from sklearn.metrics import f1_score
f1 = lambda a, b: f1_score(a, b, labels=[0, 1], average='macro', zero_division=0)
rng = np.random.default_rng(42)
n, block = len(y_te), 12
diffs = []
for _ in range(2000):
    starts = rng.integers(0, n - block + 1, size=int(np.ceil(n / block)))
    idx = (starts[:, None] + np.arange(block)[None, :]).ravel()[:n]
    diffs.append(f1(y_te[idx], p_sel[idx]) - f1(y_te[idx], p_rule[idx]))
lo, hi = np.percentile(diffs, [2.5, 97.5])
print(f'Selisih macro F1 terpilih - aturan: {f1(y_te, p_sel) - f1(y_te, p_rule):+.4f}, CI 95% [{lo:+.4f}; {hi:+.4f}]')
'''), md('''
### Eksplorasi pandangan kedua: `margins_best`
Sempat terjadi koreksi pemilihan yang keliru ke `margins_best` sesudah hasil holdout di atas terlihat
(`perbaikan_model/KOREKSI_PEMILIHAN.md`). Hasilnya ditampilkan agar transparan, **bukan** sebagai konfirmasi,
dan tidak dipakai untuk memilih model.
'''), code('''
p_mar, s_mar = holdout(load(str(HERE / 'approaches' / 'margins_best.py')))
display(pd.DataFrame([{'model': 'margins_best (eksplorasi)', **s_mar}]).round(4))
beda = p_mar != p_rule
print('Baris berbeda dari aturan:', int(beda.sum()), '| semuanya alarm yang ditekan:', bool((p_mar[beda] == 0).all()))
'''), md('''
## Kesimpulan
- Pendekatan terpilih **lebih baik dari Random Forest v1** pada holdout dan menjadi model bawaan Layanan AI
  (`01_AquaSmart/Backend-Flask`, algoritma `ph-gated-logistic-v2`).
- Pendekatan ini **belum terbukti mengungguli aturan persistensi**: selisih holdout negatif dan CI 95% mencakup nol.
  Keunggulan di CV sebagian besar berasal dari satu episode pH naik-turun di fold 3.
- Memilih ulang dengan melihat holdout akan merusak independensinya, jadi tidak dilakukan. Bukti yang lebih kuat
  membutuhkan data kolam atau periode lain. Di layanan AI, aturan ambang tetap menjadi pengaman utama.
- `margins_best` hanya eksplorasi: angkanya di atas aturan secara titik, tetapi CI mencakup nol dan ia hanya
  menekan alarm (recall alarm lebih rendah), sehingga tidak cocok untuk alarm keselamatan.
- Audit independen tidak menemukan kebocoran data; rinciannya di `perbaikan_model/hasil_perbaikan.json`.
''')]

notebook = nbf.v4.new_notebook(cells=cells)
notebook.metadata.kernelspec = {'display_name': 'Python 3', 'language': 'python', 'name': 'python3'}
notebook.metadata.language_info = {'name': 'python', 'version': '3.12'}
nbf.write(notebook, ROOT / 'notebooks' / '03_perbaikan_model.ipynb')
print(ROOT / 'notebooks' / '03_perbaikan_model.ipynb')
