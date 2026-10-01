# Tugas Mandiri Hari 2 AquaSmart AIoT

Jawaban Soal 1 sampai 3 pada MODUL_PRAKTIKUM2 (Bagian 1: Machine Learning dan Deep Learning) untuk
mata kuliah Python untuk Sistem Cerdas. Tugas ini melanjutkan Tugas Mandiri Hari 1
(`README_MANDIRI.md`): fitur, label proksi, dan pembagian latih/uji tidak diubah. Yang baru adalah
perbandingan beberapa model dengan validasi silang deret waktu, tuning, pemilihan threshold,
pemeriksaan overfitting, dan satu kali uji akhir.

## Berkas

- `../../notebooks/03_evaluasi_perbandingan.ipynb`: kode dan output Soal 1 sampai 3.
- `tugas_mandiri_hari2/Tugas_Mandiri_Hari_2_AquaSmart.docx` dan `.pdf`: laporan jawaban tim.
- `tugas_mandiri_hari2/bukti/`: notebook 03 yang diekspor ke HTML dan tangkapan layar output Soal 2
  dan 3 (`s2_*.png`, `s3_*.png`).
- `tugas_mandiri_hari2/aquasmart_model_final_hari2.joblib`: model final beserta threshold. Berkas
  ini dibuat saat notebook dijalankan dan tidak masuk Git, sama seperti model Hari 1.
- `export_bukti_hari2.py` dan `build_laporan_hari2.py`: pembuat bukti dan penyusun laporan.

## Menjalankan ulang

Notebook 03 hanya membaca `tugas_mandiri/fitur_dan_target.csv` dan
`tugas_mandiri/data_bersih_5menit.csv` hasil Hari 1, serta batas pH dan suhu dari `ThresholdRules.php`
lewat `mandiri.py`. Dataset mentah, kunci API, dan server PHP tidak diperlukan. Jalankan dari akar
repository atau folder `notebooks`.

Output yang tersimpan dihasilkan dengan Python 3.12.13, scikit-learn 1.9.1, pandas 3.0.6, numpy
2.5.3, dan matplotlib 3.11.2. Versi pandas dan numpy itu lebih baru daripada
`requirements-mandiri.txt` Hari 1; kecocokan angka dengan versi Hari 1 belum diuji. scikit-learn
harus 1.9.1: versi ini mengubah cara Random Forest dengan `class_weight='balanced'` mengambil sampel
bootstrap, dan pada data praktikum versi 1.7.2 serta 1.8.0 memberi angka yang berbeda.

```powershell
python -m pip install -r 01_AquaSmart/08_Sistem-Cerdas/requirements-mandiri.txt
```

Buka `notebooks/03_evaluasi_perbandingan.ipynb`, lalu jalankan seluruh sel. Di komputer tim
eksekusinya selesai dalam 44 detik.

## Hasil eksekusi

Validasi silang memakai data latih saja: `TimeSeriesSplit` 5 fold dengan jeda 12 interval (1 jam).

| Model | Macro F1 (5 fold) |
| --- | ---: |
| Aturan ambang non-AI | 0,836 ± 0,176 |
| Random Forest hasil tuning (max_depth 10, 300 pohon) | 0,813 ± 0,169 |
| Random Forest Hari 1 | 0,798 ± 0,184 |
| Logistic Regression | 0,715 ± 0,168 |
| MLP (16, 8) | 0,636 ± 0,161 |
| Dummy mayoritas | 0,481 ± 0,018 |

Fold kelima tidak memiliki interval Dalam, sehingga macro F1 fold itu paling tinggi 0,5 untuk model
apa pun. Sebagian besar simpangan di tabel berasal dari fold ini: tanpa fold kelima, aturan ambang
mendapat 0,920 ± 0,058.

Threshold 0,4 dipilih dari validasi silang sebelum data uji dibuka. Data uji (2.135 interval, 7 sampai
22 Maret 2023) dibuka satu kali:

| Model | Macro F1 | Luar terlewat (FN) | Alarm palsu (FP) |
| --- | ---: | ---: | ---: |
| Aturan ambang non-AI | 0,916 | 38 | 37 |
| Random Forest Hari 1 | 0,895 | 64 | 34 |
| Random Forest hasil tuning, threshold 0,4 | 0,716 | 26 | 164 |

Aturan ambang tetap menjadi alarm utama. Model final paling sedikit melewatkan kondisi Luar, tetapi
142 dari 164 alarm palsunya terjadi pada 8 Maret 2023. Dugaan penyebabnya pergeseran kondisi kolam:
di periode latih status Luar kebanyakan berarti air terlalu dingin, sedangkan di periode uji suhu
sudah normal dan status ditentukan pH yang mediannya 6,54, tepat di atas batas bawah. Model dan
threshold tidak diubah setelah melihat hasil uji.

## Batasan

Label adalah status proksi dari aturan ambang aplikasi, bukan penilaian ahli atau kondisi ikan. Data
berasal dari satu kolam, 26 Januari sampai 22 Maret 2023, tanpa kekeruhan dan oksigen terlarut. Model
belum diuji pada perangkat AquaSmart dan tidak dipasang di aplikasi web.

## Membangun ulang bukti dan laporan

Setelah notebook 03 dijalankan, jalankan dua skrip ini dari akar repository:

```powershell
python 01_AquaSmart/08_Sistem-Cerdas/export_bukti_hari2.py
python 01_AquaSmart/08_Sistem-Cerdas/build_laporan_hari2.py
```

`export_bukti_hari2.py` mengekspor notebook ke HTML dengan nbconvert, lalu mengambil tangkapan layar
output lewat Playwright untuk Python dan Microsoft Edge (versi yang dipakai: nbconvert 7.17.1,
playwright 1.63.0). `build_laporan_hari2.py` menyusun DOCX dari notebook dan tangkapan layar itu. PDF
dibuat dengan Microsoft Word 16.

## Laporan pengumpulan

Laporan yang dikumpulkan ke dosen mengikuti template modul: Tujuan, Dasar Teori, Langkah Praktikum,
dan Tugas Mandiri. Versi itu memuat teks modul dan praktikum dengan data triase dari dosen, jadi
disimpan di `tugas_mandiri_hari2/pengumpulan/` dan tidak masuk Git, sesuai aturan `.gitignore` bahwa
materi kuliah tidak diterbitkan. Folder itu juga berisi notebook lengkap (praktikum dan tugas mandiri),
tangkapan layarnya, dan alat penyusun laporan yang membutuhkan `MODUL_PRAKTIKUM2.pdf` dari dosen.

Belum ada commit untuk pekerjaan Hari 2. Alpin dan Dimas perlu meninjau berkas di atas, lalu
melakukan commit dengan akun Git masing-masing.
