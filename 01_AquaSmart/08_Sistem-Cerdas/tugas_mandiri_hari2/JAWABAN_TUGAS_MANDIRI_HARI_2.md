# Jawaban Tugas Mandiri Hari 2 — AquaSmart AIoT

Mata kuliah Python untuk Sistem Cerdas, D3 Teknik Informatika K Kab. Madiun,
Sekolah Vokasi, Universitas Sebelas Maret. Bagian yang dikerjakan: **Bagian 1
— Machine Learning dan Deep Learning**, memakai project AquaSmart (bukan data
contoh modul).

Semua angka pada dokumen ini adalah keluaran nyata `run_hari2.py`, tersimpan
di `hasil/evaluasi_hari2.json` dan berkas CSV/PNG di folder yang sama. Tidak
ada angka yang ditulis manual.

## Soal 1 – Bagian, Metrik, dan Pembanding

**a. Bagian yang dikerjakan dan alasannya.**
Bagian 1 (Machine Learning dan Deep Learning). AquaSmart Hari 1 melatih
model sendiri (Random Forest) dari data sensor tabular miliknya (pH, TDS,
suhu setiap 5 menit dari `pond_iot_2023_raw.csv`), bukan memanggil LLM
pre-trained. Tugas Hari 2 ini melanjutkan model dan pembagian data yang sama,
bukan memulai project baru.

**b. Metrik utama beserta alasannya.**
Metrik utama: **macro F1** dan **balanced accuracy**, dengan **recall alarm**
sebagai metrik pelengkap — sama seperti definisi `score()` pada `mandiri.py`
Hari 1. Alasannya:

- Kelas pada data ini sangat tidak seimbang, tetapi **terbalik** dari contoh
  modul (triase): kelas "di luar ambang" (alarm) adalah mayoritas (~91% di
  data latih), bukan minoritas. Accuracy saja menyesatkan karena classifier
  yang selalu menjawab "di luar ambang" sudah mendapat accuracy tinggi tanpa
  belajar apa pun (lihat baseline "Dummy mayoritas" Hari 1: accuracy 0,882
  tetapi macro F1 hanya 0,469).
- Macro F1 dan balanced accuracy memberi bobot setara ke kedua kelas,
  sehingga kegagalan pada kelas minoritas ("dalam ambang") tetap terlihat
  walau jumlahnya sedikit.
- Recall alarm tetap dipantau karena ini konteks skrining kualitas air:
  alarm yang terlewat (FN pada kelas "di luar ambang") berisiko lebih mahal
  daripada alarm palsu.

## Soal 2 – Evaluasi dan Perbandingan

**a. Confusion matrix baseline Hari 1** — `hasil/confusion_matrix_baseline.png`.
Classification report lengkap ada di `hasil/evaluasi_hari2.json` kunci
`baseline_hari1_classification_report`.

| Metrik | Baseline Hari 1 (data uji) |
| --- | ---: |
| Macro F1 | 0,8951 |
| Balanced accuracy | 0,9155 |
| Recall alarm | 0,9660 |
| Accuracy | 0,9541 |

**Perbandingan dua model** (Logistic Regression vs Random Forest,
`class_weight='balanced'`, 5-fold cross-validation pada data latih,
`hasil/perbandingan_model.csv`):

| Model | Precision alarm | Recall alarm | Macro F1 |
| --- | ---: | ---: | ---: |
| Logistic Regression | 0,992 ± 0,011 | 0,825 ± 0,180 | 0,739 ± 0,155 |
| Random Forest | 0,974 ± 0,031 | 0,939 ± 0,064 | 0,776 ± 0,114 |

Random Forest unggul pada macro F1 dan recall alarm; simpangannya juga lebih
kecil, jadi lebih stabil antar fold. Logistic Regression punya precision
lebih tinggi tetapi recall jauh lebih rendah dan sangat bervariasi
(± 0,180) — beberapa fold gagal menangkap kelas minoritas.

**Hyperparameter tuning (GridSearchCV, `hasil/grid_search.csv`):**
`n_estimators` ∈ {100, 160, 300} × `max_depth` ∈ {6, 10, None}, scoring
macro F1, 5-fold. Parameter terbaik: `max_depth=6, n_estimators=100` dengan
macro F1 CV = 0,798.

**c. Tabel perbandingan akhir:**

| Konfigurasi | Macro F1 (CV, data latih) | Macro F1 (data uji, sekali) |
| --- | ---: | ---: |
| Baseline Hari 1 (n_estimators=160, max_depth=10, min_samples_leaf=5, threshold 0,5) | 0,798 *(dari Hari 1)* | **0,8951** |
| Hasil tuning (max_depth=6, n_estimators=100) + threshold 0,3 | 0,798 | 0,7012 |

**Model/konfigurasi yang dipilih dan alasannya:** tetap **baseline Hari 1**
(Random Forest `n_estimators=160, max_depth=10, min_samples_leaf=5`,
threshold default 0,5), bukan hasil GridSearchCV + threshold 0,3. Meskipun
skor cross-validation keduanya sama-sama 0,798, baseline jauh lebih baik saat
benar-benar diuji satu kali di data uji (macro F1 0,8951 vs 0,7012). Detail
dan dugaan penyebabnya ada di Soal 3c di bawah. Ini konsisten dengan
kesimpulan Hari 1: Random Forest belum mengungguli baseline aturan ambang,
dan sekarang terbukti pula belum mengungguli konfigurasi Random Forest Hari 1
sendiri.

## Soal 3 – Keputusan dan Pemeriksaan

**a. Threshold dan pemeriksaan overfitting.**

Threshold dicoba pada peluang cross-validated (5-fold) model hasil tuning,
di data latih (`hasil/threshold_sweep.csv`):

| Threshold | Precision alarm | Recall alarm | Macro F1 |
| ---: | ---: | ---: | ---: |
| 0,3 | 0,973 | 0,968 | **0,841** |
| 0,4 | 0,976 | 0,960 | 0,836 |
| 0,5 | 0,980 | 0,938 | 0,812 |
| 0,6 | 0,983 | 0,933 | 0,811 |
| 0,7 | 0,985 | 0,920 | 0,798 |
| 0,8 | 0,987 | 0,795 | 0,667 |
| 0,9 | 0,999 | 0,747 | 0,646 |

Threshold 0,3 memberi macro F1 tertinggi **di data latih**, sehingga dipilih
untuk uji akhir (lihat Soal 3c untuk apa yang terjadi di data uji).

Pemeriksaan overfitting/underfitting dengan Decision Tree pada berbagai
`max_depth` (`hasil/overfitting.csv` dan `hasil/overfitting.png`): skor latih
naik terus mendekati 1 saat `max_depth` membesar, sedangkan skor validasi
memuncak di kedalaman menengah lalu melandai/menurun — pola overfitting yang
sama seperti dijelaskan pada Dasar Teori modul. Ini menjadi salah satu alasan
memilih `max_depth` terbatas (6–10), bukan pohon tanpa batas, pada Random
Forest.

**c. Tiga contoh kesalahan model/sistem dan dugaan penyebabnya.**

1. **Model hasil tuning tampak lebih baik di cross-validation tetapi lebih
   buruk di data uji.** Macro F1 CV keduanya sama (0,798), tetapi di data uji
   baseline Hari 1 mencapai macro F1 0,8951 sedangkan hasil tuning +
   threshold 0,3 hanya 0,7012 — balanced accuracy bahkan turun dari 0,9155
   ke 0,6553. Dugaan penyebab: data ini adalah deret waktu dari satu kolam,
   dan Hari 1 sudah mencatat simpangan CV yang sangat tinggi (0,7981 ±
   0,2053) dengan satu fold yang hanya berisi satu kelas. Kombinasi
   `max_depth` lebih dangkal (6, hasil GridSearchCV) dan threshold lebih
   rendah (0,3, dipilih dari data latih) kemungkinan cocok dengan pola pada
   sebagian periode data latih tetapi tidak berlaku lagi pada periode data
   uji (pergeseran kondisi/drift sensor antar waktu), bukan generalisasi
   yang sesungguhnya.
2. **Threshold rendah menaikkan recall alarm tetapi menenggelamkan kelas
   minoritas.** Pada threshold 0,3, recall alarm di data uji mencapai 0,985
   (lebih tinggi dari baseline 0,966), tetapi balanced accuracy anjlok ke
   0,655. Dugaan penyebab: karena kelas "di luar ambang" adalah mayoritas
   (~91%), menurunkan threshold membuat model semakin sering menjawab
   "alarm", sehingga banyak kejadian "dalam ambang" yang sebenarnya justru
   ikut tertebak alarm (false alarm naik, bukan berkurang) — ini kebalikan
   dari kasus triase pada modul (di sana alarm/Urgent adalah minoritas),
   sehingga intuisi "threshold rendah selalu menaikkan kualitas skrining"
   tidak otomatis berlaku di sini.
3. **GridSearchCV memilih `max_depth=6` yang lebih dangkal dari baseline
   Hari 1 (`max_depth=10`), padahal kurva overfitting (Soal 3a) menunjukkan
   skor validasi Decision Tree relatif stabil pada kedalaman menengah
   (5–8) maupun lebih dalam.** Dugaan penyebab: scoring GridSearchCV
   memilih rata-rata macro F1 tertinggi lintas 5 fold, tetapi dengan
   simpangan antar-fold sebesar itu, kombinasi yang menang belum tentu
   benar-benar lebih baik secara umum — ada risiko GridSearchCV
   "menghafal" fold tertentu yang kebetulan mendominasi rata-rata,
   mirip dengan peringatan Dasar Teori modul poin f: "jika selisih dua
   model lebih kecil daripada simpangannya, keduanya sebenarnya setara."

**Kesimpulan:** baseline Random Forest Hari 1 tetap menjadi konfigurasi yang
direkomendasikan. Tuning hyperparameter dan pemilihan threshold pada data
latih di sini terbukti tidak otomatis meningkatkan performa pada data uji,
dan itu dilaporkan apa adanya, bukan diganti dengan hasil yang terlihat lebih
baik.
