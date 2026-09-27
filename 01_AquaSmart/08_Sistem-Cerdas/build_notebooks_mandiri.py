"""Build executable assignment notebooks without altering the completed practicum."""
from pathlib import Path
import textwrap
import nbformat as nbf

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'notebooks'
DEST.mkdir(exist_ok=True)


def md(text):
    return nbf.v4.new_markdown_cell(textwrap.dedent(text).strip())


def code(text):
    return nbf.v4.new_code_cell(textwrap.dedent(text).strip())


setup = '''
from pathlib import Path
import sys, json
import numpy as np
import pandas as pd
from IPython.display import display
ROOT = next(p for p in [Path.cwd(), *Path.cwd().parents]
            if (p / '01_AquaSmart/08_Sistem-Cerdas/mandiri.py').exists())
sys.path.insert(0, str(ROOT / '01_AquaSmart/08_Sistem-Cerdas'))
from mandiri import *
pd.set_option('display.max_columns', 20)
pd.set_option('display.width', 140)
'''

framing = '''
# Tugas Mandiri Hari 1 AquaSmart AIoT
Python untuk Sistem Cerdas • Alpin Aditya Pratama (V3925004) dan Dimas Aryo Sejati (V3925022)

## Soal 1 Project framing
**Project, sektor, pengguna.** AquaSmart AIoT, akuakultur. Pengguna utama adalah pembudidaya kolam skala kecil yang memantau kualitas air melalui dashboard. Kode ini merupakan eksperimen offline, belum terhubung ke kendali perangkat.

**Masalah terukur.** Memprediksi apakah median pH atau suhu pada interval lima menit berikutnya akan keluar dari ambang aplikasi. Prediksi dibuat pada awal interval t; input terakhir berasal dari interval t−1 yang sudah selesai. Keberhasilan dinilai terhadap baseline persistensi ambang pada periode uji yang lebih akhir. Tidak ditetapkan target skor tanpa dasar.

**Input dan output.** Input berupa riwayat pH, TDS, suhu, dan timestamp pada CSV sensor kolam yang sudah ada di project. Output berupa kelas 0 (pH dan suhu dalam ambang) atau 1 (salah satu di luar ambang). Ini adalah status parsial, bukan jaminan air aman: kekeruhan dan oksigen terlarut tidak tersedia. TDS bukan kekeruhan.

**Tipe AI.** Klasifikasi berurutan waktu untuk peringatan dini lima menit, menggunakan Random Forest sesuai tabel AquaSmart pada modul. Target diturunkan dari median pembacaan pada interval mendatang menggunakan ambang `ThresholdRules.php`. Label ini adalah proksi aturan, bukan hasil penilaian ahli atau label kesehatan ikan.

**Alasan dan baseline non AI.** Pola perubahan historis mungkin membantu memperkirakan pelanggaran ambang berikutnya. Aturan ambang pada pembacaan terakhir merupakan baseline non-AI (asumsi persistensi). AI hanya layak dilanjutkan bila unggul secara terukur. Mengklasifikasikan nilai saat ini dengan label dari aturan yang sama hanya meniru aturan; karena itu eksperimen ini memakai fitur masa lalu untuk target interval mendatang. Dummy kelas mayoritas menjadi pembanding tambahan.

**Metrik.** Macro F1 menjadi metrik utama agar dua kelas diberi bobot sama; recall alarm menunjukkan berapa banyak pelanggaran proksi yang terdeteksi. Balanced accuracy dan confusion matrix melengkapi evaluasi; accuracy tidak dipakai sendirian karena kemungkinan ketimpangan kelas. Semua metrik berlaku terhadap label proksi, bukan kejadian kerusakan nyata.

**Bias dan privasi.** Satu sumber kolam, rentang waktu terbatas, drift sensor, dan perbedaan ambang suhu antara aplikasi dan dataset dapat menyebabkan bias. Evaluasi berurutan waktu, distribusi per periode, serta pelaporan kedua kelas mengurangi salah tafsir, tetapi belum membuktikan generalisasi ke kolam lain. Tidak ada nama, nomor telepon, atau data akun pada CSV; ID baris dibuang dari fitur. Pada pengumpulan internal berikutnya, pseudonimkan ID kolam, batasi akses dan retensi, serta jangan sertakan kredensial perangkat. Pembudidaya tetap memeriksa alarm sebelum tindakan.

**Ruang lingkup lima hari.** Hari 1: audit data, pembersihan, fitur historis, dan baseline. Hari 2: analisis kesalahan dan validasi temporal. Hari 3: peninjauan label bersama domain expert bila tersedia. Hari 4: uji integrasi prediksi offline. Hari 5: dokumentasi dan demonstrasi. Di luar lingkup: pelatihan ulang firmware, kalibrasi fisik, aktuasi aerator otomatis, uji lintas kolam, dan klaim kelayakan produksi. Hari 2–5 adalah rencana, bukan pekerjaan yang diklaim selesai.

### Sumber dan batas provenance
CSV lokal sudah digunakan pada bagian `08_Sistem-Cerdas`. README project mengatribusikannya ke Boby Siswanto, *A Simple Dataset of Aquaponic Fish Pond Water Quality Measurement using Internet of Things devices*, Mendeley Data, versi 2, DOI 10.17632/yd36bx6f8f.2, CC BY 4.0: https://data.mendeley.com/datasets/yd36bx6f8f/2.
Halaman sumber menyebut 118.286 baris yang telah difilter, sedangkan file lokal memiliki lebih banyak baris. Identitas file lokal dicatat dengan SHA-256; kesetaraan dengan berkas unduhan versi 2 belum diverifikasi. Eksperimen ini menggunakan file lokal apa adanya dan tidak mengklaim jumlahnya sama dengan deskripsi publik.
'''

eda = [md(framing), code(setup), code('''
print('Project: AquaSmart AIoT | Prediksi status proksi pH dan suhu lima menit')
print('Ambang diambil langsung dari aplikasi:', RULES)
print('Baseline: aturan ambang pembacaan terakhir vs Random Forest')
'''), md('## Soal 2 EDA dataset project'), code('''
raw = read_raw()
print('Ukuran data:', raw.shape)
display(raw.head())
raw.info()
display(raw.describe(include='all').T)
print('Missing value mentah:')
display(raw.isna().sum().to_frame('jumlah'))
print('Duplikat seluruh kolom:', raw.duplicated().sum())
print('Variasi kategori: tidak ada kolom kategorik substantif; created_date adalah waktu, id adalah ID baris.')
print('Contoh variasi string tanggal:', raw.created_date.astype(str).head().tolist())
bins, audit = clean_data(raw)
display(pd.Series(audit, name='hasil audit'))
'''), md('''
### Distribusi label dan grafik
Dataset tidak memiliki label asli. Distribusi berikut adalah label proksi yang dibuat dari pH dan suhu hasil agregasi untuk tujuan tugas. Nilai sensor interval t hanya membentuk target t, tidak dimasukkan sebagai fitur prediksi t. EDA seluruh rekaman bersifat deskriptif; parameter model sudah ditetapkan dan tidak disetel menggunakan data uji.
'''), code('''
import matplotlib.pyplot as plt
import seaborn as sns
sns.set_theme(style='whitegrid', font_scale=1.0)
labels = label_status(bins.ph, bins.temp)
counts = labels.value_counts().reindex([0, 1], fill_value=0)
distribution = pd.DataFrame({'jumlah': counts, 'persen': counts / counts.sum() * 100})
distribution.index = ['Dalam ambang', 'Di luar ambang']
display(distribution.round(2))
print('Bin tanpa label (pH/suhu kosong):', labels.isna().sum())
fig, axes = plt.subplots(2, 2, figsize=(12, 8), constrained_layout=True)
distribution['jumlah'].plot.bar(ax=axes[0, 0], color=['#356b68', '#a94f36'], rot=0)
axes[0, 0].set(title='Distribusi label proksi pH dan suhu', xlabel='Status proksi', ylabel='Jumlah interval 5 menit')
bins.ph.dropna().plot.hist(bins=35, ax=axes[0, 1], color='#356b68')
axes[0, 1].set(title='Sebaran median pH per interval', xlabel='pH', ylabel='Jumlah interval 5 menit')
bins.temp.resample('D').mean().plot(ax=axes[1, 0], color='#356b68')
axes[1, 0].set(title='Rata rata suhu harian', xlabel='Tanggal rekaman', ylabel='Suhu air (°C)')
sns.heatmap(bins[SENSORS].corr(), annot=True, fmt='.2f', vmin=-1, vmax=1, cmap='BrBG', ax=axes[1, 1])
axes[1, 1].set(title='Korelasi Pearson sensor per interval', xlabel='Sensor', ylabel='Sensor')
fig.savefig(OUT / 'soal_2_grafik.png', dpi=160)
plt.show()
'''), code('''
daily_ph = bins.ph.resample('D').median().dropna()
corr = bins.ph.corr(bins.tds)
insights = [
    f'Kelas di luar ambang mencakup {distribution.loc["Di luar ambang", "persen"]:.2f}% label. Dampak: gunakan macro F1, balanced accuracy, dan baseline dummy; accuracy saja tidak cukup.',
    f'Median pH harian berkisar {daily_ph.min():.2f}–{daily_ph.max():.2f}. Dampak: evaluasi harus berurutan waktu karena perubahan kondisi atau drift sensor tidak boleh tercampur secara acak.',
    f'Korelasi pH dengan TDS sebesar {corr:.3f}. Dampak: keduanya dipertahankan untuk baseline, tetapi korelasi tidak membuktikan kausalitas atau menjadikan TDS pengganti kekeruhan.',
    f'Ada {audit["empty_bins"]} interval kosong dari {len(bins)} interval lima menit. Dampak: pertahankan grid waktu, jangan menghubungkan lag melintasi jeda seolah pengukuran berurutan.'
]
for n, insight in enumerate(insights, 1):
    print(f'{n}. {insight}')
(OUT / 'eda.json').write_text(json.dumps({'audit': audit, 'insights': insights,
    'distribution': distribution.to_dict()}, indent=2, ensure_ascii=False), encoding='utf-8')
'''), md('''
## Soal 3 Pembersihan dan feature engineering
Tanggal dibersihkan dari spasi dan dikonversi dengan format eksplisit. Angka yang tidak dapat diparsing menjadi missing. pH di luar 0–14, TDS negatif, dan suhu di luar 0–100 °C ditandai missing sebagai pemeriksaan kewajaran fisik umum air cair pada konteks kolam, bukan ambang optimal budidaya. Tidak digunakan batas TDS atas tanpa spesifikasi sensor. Pembacaan di luar ambang budidaya tetap dipertahankan sebagai kandidat alarm.

Timestamp hanya beresolusi menit sehingga pembacaan dengan waktu dan nilai sama belum tentu duplikasi peristiwa. Kebijakan di sini menggabungkan tuple identik agar tidak mendapat bobot berlebih; ID unik tidak dipakai untuk menyembunyikan repetisi pengukuran. Data diagregasi median pada grid lima menit. Bin kosong tetap ada; tidak ada interpolasi atau backward fill.

Untuk setiap sensor dibuat lag satu dan dua interval, rata-rata dan simpangan baku 12 interval terakhir. Semua rolling memakai `shift(1)`. Minimal tiga pembacaan diperlukan untuk rolling; nilai fitur kosong ditangani imputer pada Pipeline setelah split. Prediksi hanya dievaluasi jika pH dan suhu interval sebelumnya dan target tersedia, dengan pemanasan 12 interval. Label kosong tidak diimputasi. Semua fitur numerik sehingga encoding kategori tidak diperlukan; scaling disertakan di Pipeline meskipun Random Forest tidak mensyaratkannya.
'''), code('''
X, y = make_features(bins)
display(bins.isna().sum().to_frame('missing setelah cleaning'))
print('Fitur yang digunakan:', X.columns.tolist())
print('Sampel dapat dievaluasi:', len(X), '| Bin tidak dievaluasi:', len(bins) - len(X))
display(X.head().round(4))
display(y.value_counts().sort_index().to_frame('jumlah'))
bins.to_csv(OUT / 'data_bersih_5menit.csv', index_label='timestamp')
X.join(y).to_csv(OUT / 'fitur_dan_target.csv', index_label='timestamp')
print('Data bersih dan fitur disimpan di:', OUT)
''')]

baseline = [md('''
# Baseline dan pemeriksaan data leakage AquaSmart
## Soal 4 Baseline project
Target dan framing mengikuti `01_eda.ipynb`. Kelas target interval t adalah status proksi pH/suhu pada interval t, diprediksi sebelum pembacaan interval itu tersedia. Baseline non-AI menerapkan ambang aplikasi ke pembacaan t−1, lalu mengasumsikan status bertahan. Semua model diuji pada baris yang sama. Tidak ada label anomali suntikan pada eksperimen ini.
'''), code(setup), code('''
from sklearn.dummy import DummyClassifier
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import confusion_matrix, ConfusionMatrixDisplay
from sklearn.base import clone
import joblib
raw = read_raw()
bins, audit = clean_data(raw)
X, y = make_features(bins)
X_train, X_test, y_train, y_test = chronological_split(X, y)
split = pd.DataFrame([
    ['Latih', len(X_train), str(X_train.index.min()), str(X_train.index.max()), int((y_train == 0).sum()), int((y_train == 1).sum())],
    ['Uji', len(X_test), str(X_test.index.min()), str(X_test.index.max()), int((y_test == 0).sum()), int((y_test == 1).sum())]
], columns=['bagian', 'jumlah', 'awal', 'akhir', 'kelas 0', 'kelas 1'])
display(split)
print('Split kronologis sekitar 80:20; satu jam sebelum awal uji dikeluarkan dari latih.')
print('Urutan: split -> fit imputer/scaler/model pada latih -> predict pada uji.')
'''), md('''
### Validasi temporal pada data latih
TimeSeriesSplit lima fold dengan gap 12 sampel, setidaknya satu jam pada grid ini. Pipeline di-fit ulang pada setiap fold. Hyperparameter Random Forest tetap: 160 pohon, kedalaman maksimum 10, minimum 5 sampel daun, class_weight balanced, seed 42. Holdout tidak digunakan memilih hyperparameter. Fold yang hanya memiliki satu kelas dilaporkan dan tidak dianggap bukti kualitas dua kelas.
'''), code('''
rf = pipeline(X.columns)
cv_rows = []
for fold, (tr, va) in enumerate(TimeSeriesSplit(n_splits=5, gap=12).split(X_train), 1):
    candidate = clone(rf).fit(X_train.iloc[tr], y_train.iloc[tr])
    metrics = score(y_train.iloc[va], candidate.predict(X_train.iloc[va]))
    cv_rows.append({'fold': fold, 'n_train': len(tr), 'n_valid': len(va),
                    'kelas_valid': y_train.iloc[va].nunique(), **metrics})
cv = pd.DataFrame(cv_rows)
display(cv.round(4))
print('Macro F1 CV rata-rata:', round(cv.macro_f1.mean(), 4), '| simpangan:', round(cv.macro_f1.std(ddof=1), 4))
cv.to_csv(OUT / 'cross_validation.csv', index=False)
'''), code('''
dummy = pipeline(X.columns, DummyClassifier(strategy='most_frequent')).fit(X_train, y_train)
rf.fit(X_train, y_train)
predictions = {
    'Dummy mayoritas': dummy.predict(X_test),
    'Ambang terakhir non AI': label_status(X_test.ph_lag1, X_test.temp_lag1).astype(int).to_numpy(),
    'Random Forest': rf.predict(X_test)
}
results = pd.DataFrame([{'model': name, **score(y_test, pred)} for name, pred in predictions.items()])
display(results.round(4))
results.to_csv(OUT / 'perbandingan_baseline.csv', index=False)
gap = results.loc[2, 'macro_f1'] - results.loc[1, 'macro_f1']
conclusion = (f'Selisih macro F1 Random Forest terhadap aturan persistensi adalah {gap:+.4f}. '
              + ('Random Forest unggul pada holdout ini, tetapi belum tervalidasi lintas kolam.' if gap > 0 else
                 'Random Forest belum mengungguli aturan persistensi; baseline non-AI tetap menjadi pilihan awal.'))
print(conclusion)
print('Hasil hanya terhadap label proksi ambang pH/suhu, bukan validasi kualitas air penuh atau kesehatan ikan.')
joblib.dump(rf, OUT / 'pipeline_random_forest.joblib')
saved = joblib.load(OUT / 'pipeline_random_forest.joblib')
assert np.array_equal(saved.predict(X_test), predictions['Random Forest'])
print('Pipeline tersimpan dan prediksi hasil muat ulang identik.')
'''), code('''
import matplotlib.pyplot as plt
fig, axes = plt.subplots(1, 3, figsize=(13, 4), constrained_layout=True)
for ax, (name, pred) in zip(axes, predictions.items()):
    ConfusionMatrixDisplay(confusion_matrix(y_test, pred, labels=[0, 1]),
                           display_labels=['Dalam', 'Luar']).plot(ax=ax, colorbar=False, cmap='Greens')
    ax.set(title=name, xlabel='Prediksi status proksi', ylabel='Status proksi aktual')
fig.savefig(OUT / 'soal_4_confusion_matrix.png', dpi=160)
plt.show()
'''), md('''
## Soal 5 Pemeriksaan data leakage
**Daftar fitur.** Dua belas kolom tercetak di bawah: pH, TDS dan suhu masing-masing memiliki lag1, lag2, mean12 dan std12. Seluruhnya tersedia sebelum interval target dimulai. ID baris, timestamp mentah, nilai sensor interval target, target_proxy, keputusan aktuator dan hasil tindakan tidak menjadi fitur. Pembacaan pada interval target baru diketahui sesudah prediksi dan hanya dipakai membentuk label.

**Preprocessing.** Agregasi median per interval dan pemeriksaan batas fisik tidak belajar parameter dari data. Fitur historis dibentuk sebelum split karena operasi kausal tanpa fit; setiap baris hanya menggunakan timestamp lebih lama. Imputasi median dan scaling belajar dari latih di dalam ColumnTransformer dan Pipeline; hal yang sama dilakukan ulang pada setiap fold. Target tidak diimputasi. Tidak ada encoding karena tidak ada prediktor kategorik.

**Objek yang sama.** CSV tidak memuat ID sensor/kolam terpisah dan README mengacu pada satu sumber kolam. Karena itu latih dan uji diasumsikan berasal dari sumber sensor yang sama. Ini sesuai tujuan memprediksi masa depan kolam yang sama, tetapi tidak dapat membuktikan generalisasi ke sensor atau kolam baru. Purge satu jam menjaga batas holdout dari tumpang tindih jendela fitur; untuk klaim lintas kolam diperlukan data beberapa kolam dan GroupKFold/holdout kolam.

**Risiko yang tersisa.** Autokorelasi dan perubahan distribusi masih mungkin. Label proksi berasal dari aturan tetap, sehingga skor tinggi tidak membuktikan label ahli. Suhu kolam sumber dapat berbeda dari rentang aplikasi; kelas alarm bisa dominan. EDA seluruh rekaman dilaporkan transparan dan bukan dasar tuning pada holdout. Data uji di sini bukan uji lapangan independen.
'''), code('''
feature_audit = pd.DataFrame({'fitur': X.columns, 'tersedia_saat_prediksi': True,
                              'baru_diketahui_setelah_hasil': False})
display(feature_audit)
assert X_train.index.max() < X_test.index.min() - pd.Timedelta(minutes=60)
assert not X_train.index.intersection(X_test.index).size
assert set(X.columns) == {f'{s}_{suffix}' for s in SENSORS for suffix in ['lag1', 'lag2', 'mean12', 'std12']}
imputer = rf.named_steps['preprocessing'].named_transformers_['numeric'].named_steps['imputer']
assert np.allclose(imputer.statistics_, X_train.median().to_numpy(), equal_nan=True)
# Changing current/future sensor readings must not change features at prediction time.
probe = bins.index[len(bins) // 2]
changed = bins.copy()
changed.loc[probe:, SENSORS] = changed.loc[probe:, SENSORS] + 0.1
changed_X, _ = make_features(changed)
common = X.index.intersection(changed_X.index)
before = common[common <= probe]
pd.testing.assert_frame_equal(X.loc[before], changed_X.loc[before])
checks = {'urutan_waktu_dan_purge': True, 'timestamp_latih_uji_terpisah': True,
          'fitur_hanya_masa_lalu': True, 'imputer_hanya_latih': True,
          'model_reload_identik': True,
          'sumber_sensor_sama': 'Ya, diasumsikan satu kolam; bukan validasi lintas objek'}
print(json.dumps(checks, indent=2, ensure_ascii=False))
(OUT / 'evaluasi_mandiri.json').write_text(json.dumps({
    'seed': SEED, 'rules': RULES, 'split': split.to_dict(orient='records'),
    'features': X.columns.tolist(), 'cv_macro_f1_mean': cv.macro_f1.mean(),
    'cv_macro_f1_std': cv.macro_f1.std(ddof=1), 'results': results.to_dict(orient='records'),
    'checks': checks, 'conclusion': conclusion}, indent=2, ensure_ascii=False), encoding='utf-8')
'''), md('''
## Bukti dan kontribusi tim
Output notebook ini berasal dari eksekusi kode. Tangkapan layar tiap soal disediakan pada folder `tugas_mandiri/bukti`. Modul mewajibkan kedua anggota melakukan commit. Commit harus dibuat masing-masing anggota dengan identitas Git sendiri setelah meninjau pekerjaan; notebook ini tidak mengklaim syarat tersebut sudah terpenuhi dan tidak membuat commit atas nama Dimas atau Alpin.
''')]

for name, cells in [('01_eda', eda), ('02_baseline', baseline)]:
    notebook = nbf.v4.new_notebook(cells=cells)
    notebook.metadata.kernelspec = {'display_name': 'Python 3', 'language': 'python', 'name': 'python3'}
    notebook.metadata.language_info = {'name': 'python', 'version': '3.12'}
    nbf.write(notebook, DEST / f'{name}.ipynb')
    print(DEST / f'{name}.ipynb')
