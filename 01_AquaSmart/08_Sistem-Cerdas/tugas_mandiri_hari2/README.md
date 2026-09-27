# Tugas Mandiri Hari 2 AquaSmart AIoT

Jawaban Soal 1–3 pada `MODUL_PRAKTIKUM2.pdf` (Hari 2: Evaluasi dan Perbandingan
Model), Bagian 1 — Machine Learning dan Deep Learning. Melanjutkan model Hari 1
(Random Forest untuk status ambang pH/suhu pada interval lima menit
berikutnya); tidak membuat project baru dan tidak memakai data contoh modul
(triase klinik).

**Yang dikumpulkan: `Tugas_Mandiri_Hari_2_AquaSmart.docx`** — laporan jawaban
Soal 1–3 dengan tabel dan gambar, format sama seperti
`tugas_mandiri/Tugas_Mandiri_Hari_1_AquaSmart.docx`.
`JAWABAN_TUGAS_MANDIRI_HARI_2.md` adalah sumber isinya dalam Markdown (lebih
mudah ditinjau/diedit); keduanya berisi jawaban yang sama.

## Kenapa Bagian 1, bukan Bagian 2

AquaSmart Hari 1 sudah melatih model sendiri (Random Forest) dari data sensor
tabular (pH, TDS, suhu), bukan memakai LLM pre-trained. Itu Bagian 1. Notebook
RAG/LLM (`IndexingPDF_VectorDB.ipynb`, `LLM_RAG_GenAI.ipynb`) yang juga
diunggah tim adalah latihan praktikum terpisah dengan dokumen modul sebagai
contoh, bukan bagian dari deliverable capstone AquaSmart, sehingga tidak
dipakai sebagai jawaban Tugas Mandiri di sini.

## Berkas

- `Tugas_Mandiri_Hari_2_AquaSmart.docx`: **berkas yang dikumpulkan.**
- `run_hari2.py`: skrip yang menjalankan seluruh analisis Soal 2 dan Soal 3
  (confusion matrix baseline, perbandingan model, GridSearchCV, kurva
  overfitting, threshold sweep, dan uji sekali di data uji).
- `hasil/`: keluaran nyata dari menjalankan `run_hari2.py` — CSV, PNG, dan
  `evaluasi_hari2.json`. Tidak ada angka yang ditulis tangan. Tiga gambar di
  antaranya ditempel langsung ke dalam DOCX.
- `JAWABAN_TUGAS_MANDIRI_HARI_2.md`: sumber isi DOCX dalam Markdown, isinya
  sama persis, lebih mudah ditinjau/diedit sebelum dirender ulang ke DOCX.

## Menjalankan ulang

Dari folder ini (Python 3.12, sudah pakai `requirements-mandiri.txt` di folder
induk):

```bash
python -m pip install -r ../requirements-mandiri.txt
python run_hari2.py
```

Skrip memuat `../tugas_mandiri/fitur_dan_target.csv`, yaitu fitur dan label
hasil pembersihan Hari 1 yang sudah di-commit ke Git (bukan CSV mentah
505.730 baris yang tidak ikut di-commit). Pembagian data latih/uji memakai
`chronological_split()` yang sama persis dengan `mandiri.py` (Hari 1):
kronologis, purge 60 menit di batas holdout, `random_state=42`. Tidak
diperlukan dataset mentah, API key, atau server PHP.

## Hasil eksekusi

Data latih: 8.525 baris. Data uji: 2.135 baris (identik dengan Hari 1, karena
sumber dan logika split sama). Proporsi kelas "di luar ambang" di data latih:
91%.

Baseline Hari 1 (Random Forest bawaan, threshold 0,5) pada data uji:

| Metrik | Nilai |
| --- | ---: |
| Macro F1 | 0,8951 |
| Balanced accuracy | 0,9155 |
| Recall alarm | 0,9660 |
| Accuracy | 0,9541 |

Perbandingan model dengan 5-fold cross-validation pada data latih:

| Model | Precision alarm | Recall alarm | Macro F1 |
| --- | ---: | ---: | ---: |
| Logistic Regression | 0,992 ± 0,011 | 0,825 ± 0,180 | 0,739 ± 0,155 |
| Random Forest | 0,974 ± 0,031 | 0,939 ± 0,064 | 0,776 ± 0,114 |

GridSearchCV pada Random Forest (`n_estimators` ∈ {100, 160, 300},
`max_depth` ∈ {6, 10, None}, scoring macro F1): parameter terbaik
`max_depth=6, n_estimators=100`, macro F1 CV = 0,798.

Threshold dipilih dari macro F1 tertinggi pada data latih (cross-validated
predict_proba): **threshold = 0,3**.

**Model hasil tuning + threshold 0,3, diuji satu kali di data uji:**

| Metrik | Nilai |
| --- | ---: |
| Macro F1 | 0,7012 |
| Balanced accuracy | 0,6553 |
| Recall alarm | 0,9851 |
| Accuracy | 0,9073 |

Model hasil tuning **lebih buruk** daripada baseline Hari 1 di data uji
(macro F1 turun dari 0,8951 ke 0,7012), walaupun macro F1-nya lebih tinggi
saat diukur dengan cross-validation di data latih (0,798 vs skor CV baseline
Hari 1 sebesar 0,798 juga — lihat `evaluasi_mandiri.json` Hari 1). Ini
ditulis apa adanya di `JAWABAN_TUGAS_MANDIRI_HARI_2.md` Soal 3c sebagai
contoh kesalahan sistem, bukan disembunyikan atau diganti dengan hasil yang
lebih baik.

## Batasan

Hasil ini adalah status proksi ambang sensor pada satu kolam/satu sumber
data, bukan bukti keamanan air, bukan label ahli, dan bukan bukti aktuasi
perangkat fisik. CV pada Hari 1 mempunyai simpangan tinggi (0,7981 ± 0,2053)
dan salah satu fold hanya berisi satu kelas; ketidakstabilan yang sama
kemungkinan menjadi penyebab GridSearchCV memilih konfigurasi yang tidak
bertahan baik di luar data latihnya. Lihat README repo bagian Status untuk
batasan proyek AquaSmart secara umum.
