# Tugas Mandiri AquaSmart AIoT

Satu paket jawaban untuk mata kuliah Python untuk Sistem Cerdas, mencakup
**MODUL_PRAKTIKUM1** Soal 1–5 (project framing, EDA, pembersihan data,
baseline, pemeriksaan data leakage) dan **MODUL_PRAKTIKUM2** Soal 1–3
(evaluasi dan perbandingan model), Bagian 1 — Machine Learning dan Deep
Learning. Keduanya digabung sebagai satu laporan berkelanjutan
(`Tugas_Mandiri_AquaSmart.docx`), bukan dua laporan terpisah per pertemuan:
bagian evaluasi melanjutkan langsung model dan pembagian data dari bagian
framing/baseline. Praktikum triase Dimas dan eksperimen Isolation Forest
sebelumnya tidak diubah. Model utamanya adalah Random Forest untuk prediksi
status proksi pH dan suhu pada interval lima menit berikutnya.

## Berkas

- `../../notebooks/01_eda.ipynb`: framing, EDA, empat grafik, empat insight,
  pembersihan, dan 12 fitur historis.
- `../../notebooks/02_baseline.ipynb`: split waktu, validasi temporal, dummy,
  aturan ambang terakhir, Random Forest, simpan model, dan audit leakage.
- `../../notebooks/03_evaluasi_perbandingan.ipynb`: seluruh langkah 1.0–1.9
  Bagian 1 `MODUL_PRAKTIKUM2.pdf` — confusion matrix, threshold, perbandingan
  model, GridSearchCV, overfitting, MLP, model final, bonus forecasting.
- `tugas_mandiri/Tugas_Mandiri_AquaSmart.docx`: **laporan yang dikumpulkan**,
  jawaban lengkap kedua modul.
- `tugas_mandiri/bukti/soal_1.png` sampai `soal_5.png`: screenshot browser
  atas output notebook yang diekspor ke HTML (MODUL_PRAKTIKUM1), bukan foto
  UI Jupyter. `evaluasi_confusion_matrix_baseline.png`,
  `evaluasi_overfitting.png`, `evaluasi_confusion_matrix_final.png`: bukti
  evaluasi (MODUL_PRAKTIKUM2).
- `tugas_mandiri/media/`: tiga gambar dari laporan (grafik EDA, confusion
  matrix ketiga baseline, tangkapan layar audit), ditempel ke DOCX.
- `tugas_mandiri/data_bersih_5menit.csv`, `fitur_dan_target.csv`, tabel
  evaluasi, JSON audit: hasil kode yang benar-benar dijalankan.

## Menjalankan ulang

Gunakan Python 3.12. Dari akar Testing-Project:

```powershell
python -m pip install -r 01_AquaSmart/08_Sistem-Cerdas/requirements-mandiri.txt
python -m ipykernel install --user --name aquasmart-mandiri
```

Buka notebook pada Jupyter atau VS Code dengan kernel tersebut. Jalankan
seluruh sel `notebooks/01_eda.ipynb`, lalu `02_baseline.ipynb`, lalu
`03_evaluasi_perbandingan.ipynb` — urutannya penting karena setiap notebook
memuat hasil notebook sebelumnya. `02_baseline.ipynb` butuh dataset mentah;
`03_evaluasi_perbandingan.ipynb` cukup memuat CSV bersih yang sudah
di-commit, jadi bisa dijalankan tanpa dataset mentah. Jalankan dari akar
repository atau folder `notebooks`; jangan memindahkan notebook tanpa folder
pendukungnya. Tidak diperlukan kunci API atau server PHP.

Dataset mentah harus berada di `data/pond_iot_2023_raw.csv` dalam folder ini.
Paket ZIP lokal menyertakan salinan CSV yang digunakan beserta struktur folder.
File mentah tetap tidak dimasukkan ke Git. Untuk pengguna clone Git yang belum
memiliki file, gunakan paket data dari tim dan verifikasi SHA-256 berikut:

`ac69aff715a31f3f35439247b02d9e7bf95e409652bf88e5f15329c6effb9dba`

Jangan mengganti diam-diam dengan dataset terfilter karena skor akan berubah.

Skrip `evaluasi_model.py` menjalankan ulang seluruh analisis perbandingan
model (dipakai untuk menyusun bagian evaluasi laporan):

```bash
python 01_AquaSmart/08_Sistem-Cerdas/evaluasi_model.py
```

## Asal data dan label

CSV lokal berisi 505.730 baris dengan pH, TDS dan suhu. README project sebelumnya
mengatribusikannya kepada Boby Siswanto, Mendeley Data versi 2,
DOI [10.17632/yd36bx6f8f.2](https://data.mendeley.com/datasets/yd36bx6f8f/2),
lisensi CC BY 4.0. Halaman publik menyebut 118.286 baris terfilter. Kecocokan
berkas lokal dengan berkas unduhan versi itu belum diverifikasi. Audit lokal
dan hash, bukan angka deskripsi publik, menjadi acuan eksperimen ini.

Transformasi yang dilakukan: parsing tanggal/angka, penggabungan tuple waktu
dan nilai identik, penandaan pH mustahil, agregasi median lima menit, fitur lag
dan rolling, serta pembentukan label proksi. Ini adalah data turunan dari
rekaman sumber, bukan pengukuran baru atau label ahli.

Label target adalah pelanggaran ambang pH/suhu dari `ThresholdRules.php` pada
interval t. Fitur hanya berasal dari interval sebelum t. Dataset tidak mempunyai
kekeruhan; TDS tidak disamakan dengan kekeruhan. Hasil adalah status parsial,
bukan kepastian air aman, label penyakit ikan, atau bukti aktuasi perangkat.

## Hasil eksekusi — baseline (MODUL_PRAKTIKUM1)

Latih: 8.525 sampel. Uji: 2.135 sampel, setelah purge satu jam sebelum holdout.

| Model | Macro F1 | Balanced accuracy | Recall alarm |
| --- | ---: | ---: | ---: |
| Dummy mayoritas | 0,4686 | 0,5000 | 1,0000 |
| Ambang terakhir non AI | 0,9158 | 0,9165 | 0,9798 |
| Random Forest | 0,8951 | 0,9155 | 0,9660 |

Random Forest belum mengungguli baseline aturan. Macro F1 validasi temporal
lima fold adalah 0,7981 dengan simpangan 0,2053. Latih dan uji diasumsikan
berasal dari satu sumber sensor; ini bukan evaluasi generalisasi lintas kolam.
Fold validasi kelima hanya memiliki kelas alarm; macro F1 memakai dua label
tetap dan zero_division 0. Rata-rata CV bukan bukti kemampuan dua kelas pada
semua periode.

Pemeriksaan otomatis lulus: urutan waktu dan purge, timestamp terpisah,
kausalitas fitur setelah data masa depan diubah, median imputer hanya dari
latih, dan kesamaan prediksi setelah model dimuat ulang. Output lengkap ada
di ketiga notebook dan `evaluasi_mandiri.json`.

## Hasil eksekusi — evaluasi dan perbandingan (MODUL_PRAKTIKUM2)

GridSearchCV pada Random Forest (`n_estimators` ∈ {100, 160, 300}, `max_depth`
∈ {6, 10, None}, scoring macro F1) memilih `max_depth=6, n_estimators=100`
dengan macro F1 CV 0,798 — sama dengan baseline. Namun saat diuji satu kali di
data uji, konfigurasi hasil tuning (+ threshold 0,3 hasil pemilihan di data
latih) justru **lebih buruk** dari baseline: macro F1 turun dari 0,8951 ke
0,7012, balanced accuracy turun dari 0,9155 ke 0,6553. Rincian dan tiga dugaan
penyebabnya ada di `Tugas_Mandiri_AquaSmart.docx` Bagian B Soal 3c. Output
lengkap ada di `notebooks/03_evaluasi_perbandingan.ipynb` dan
`tugas_mandiri/evaluasi_perbandingan.json`.

## Kontribusi kedua anggota

Modul mewajibkan kedua anggota melakukan commit. Belum dibuat commit pada
pengerjaan ini dan tidak dipalsukan identitas penulis. Alpin dan Dimas perlu
meninjau pekerjaan, membagi perubahan yang benar-benar mereka tinjau/kerjakan,
lalu melakukan commit masing-masing menggunakan akun Git sendiri.

## Membangun ulang laporan dan bukti

`build_notebooks_mandiri.py` membangun `01_eda.ipynb`/`02_baseline.ipynb` dari
sumber dan **menghapus output lama**; jalankan hanya bila ingin meregenerasi,
lalu eksekusi kembali. Setelah notebook dieksekusi, `export_bukti_mandiri.py`
mengekspor output ke HTML. `screenshot_mandiri.cjs` menggunakan Playwright dan
Microsoft Edge untuk screenshot; pasang Playwright atau tentukan
`PLAYWRIGHT_MODULE` ke modul yang tersedia. Dependensi screenshot terpisah
dari dependensi analisis.

`build_laporan_gabungan.js` (Node.js, butuh `npm install docx`) membangun
`Tugas_Mandiri_AquaSmart.docx` dari sumber teks di dalam skrip itu sendiri
ditambah gambar pada `tugas_mandiri/bukti/` dan `tugas_mandiri/media/`.
Jalankan dari folder ini:

```bash
npm install docx
node build_laporan_gabungan.js
```

DOCX pada repo ini diverifikasi lewat ekstraksi teks (`pandoc -t markdown`)
dan pemeriksaan XML, bukan render visual: LibreOffice pada komputer ini gagal
mengonversi DOCX ke PDF (termasuk pada DOCX yang sebelumnya sudah pernah
dirender di komputer lain), jadi buka berkasnya di Word/Google Docs sebelum
dikumpulkan untuk memastikan tampilannya rapi.
