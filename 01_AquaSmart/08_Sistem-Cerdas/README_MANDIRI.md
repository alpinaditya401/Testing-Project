# Tugas Mandiri Hari 1 AquaSmart AIoT

Jawaban Soal 1–5 pada MODUL_PRAKTIKUM1 untuk mata kuliah Python untuk Sistem
Cerdas. Praktikum triase Dimas dan eksperimen Isolation Forest sebelumnya tidak
diubah. Model baru adalah Random Forest untuk prediksi status proksi pH dan suhu
pada interval lima menit berikutnya.

## Berkas

- `../../notebooks/01_eda.ipynb`: framing, EDA, empat grafik, empat insight,
  pembersihan, dan 12 fitur historis.
- `../../notebooks/02_baseline.ipynb`: split waktu, validasi temporal, dummy,
  aturan ambang terakhir, Random Forest, simpan model, dan audit leakage.
- `tugas_mandiri/Tugas_Mandiri_Hari_1_AquaSmart.docx`: laporan jawaban tim.
- `tugas_mandiri/bukti/soal_1.png` sampai `soal_5.png`: screenshot browser
  atas output notebook yang diekspor ke HTML, bukan foto UI Jupyter.
- `tugas_mandiri/data_bersih_5menit.csv`, `fitur_dan_target.csv`, tabel evaluasi,
  dan JSON audit: hasil kode yang dijalankan. `pipeline_random_forest.joblib`
  dibuat ulang saat `02_baseline.ipynb` dijalankan dan tidak di-commit
  (`.gitignore` menolak `*.joblib`).

## Menjalankan ulang

Gunakan Python 3.12 (paket yang dipin juga berjalan di Python 3.11). Dari akar
Testing-Project:

```powershell
python -m pip install -r 01_AquaSmart/08_Sistem-Cerdas/requirements-mandiri.txt
python -m ipykernel install --user --name aquasmart-mandiri
```

Buka notebook pada Jupyter atau VS Code dengan kernel tersebut. Jalankan seluruh
sel `notebooks/01_eda.ipynb`, lalu seluruh sel `notebooks/02_baseline.ipynb`.
Notebook kedua dapat berjalan sendiri karena memuat dan membersihkan data kembali.
Jalankan dari akar repository atau folder `notebooks`; jangan memindahkan dua
notebook tanpa folder pendukungnya. Tidak diperlukan kunci API atau server PHP.

Dataset mentah harus berada di `data/pond_iot_2023_raw.csv` dalam folder ini.
Paket ZIP lokal menyertakan salinan CSV yang digunakan beserta struktur folder;
CSV mentah maupun ZIP tidak dimasukkan ke Git. Untuk pengguna clone Git yang
belum memiliki file, gunakan paket data dari tim dan verifikasi SHA-256 berikut:

`ac69aff715a31f3f35439247b02d9e7bf95e409652bf88e5f15329c6effb9dba`

Jangan mengganti diam-diam dengan dataset terfilter karena skor akan berubah.

**Tanpa CSV mentah.** `02_baseline.ipynb` tetap dapat dijalankan dari clone Git:
`load_bins()` di `mandiri.py` memakai `tugas_mandiri/data_bersih_5menit.csv` yang
di-commit dan audit dari `eda.json`. Diperiksa 2 Oktober 2026: `evaluasi_mandiri.json`,
`cross_validation.csv`, dan `perbandingan_baseline.csv` hasil eksekusi ulang dengan
cara ini identik byte per byte dengan yang di-commit. `01_eda.ipynb` tetap
membutuhkan CSV mentah karena Soal 2 mendeskripsikan data mentah itu sendiri.

**Versi ambang.** Label dihitung dengan `threshold-rules-v2` (pH 6,5–8,5, suhu
25–30 °C). `mandiri.py` menolak berjalan bila `ThresholdRules.php` berganti versi,
supaya target dan skor tidak berubah diam-diam.

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

## Hasil eksekusi

Latih: 8.525 sampel. Uji: 2.135 sampel, setelah purge satu jam sebelum holdout.

| Model | Macro F1 | Balanced accuracy | Recall alarm |
| --- | ---: | ---: | ---: |
| Dummy mayoritas | 0,4686 | 0,5000 | 1,0000 |
| Ambang terakhir non AI | 0,9158 | 0,9165 | 0,9798 |
| Random Forest | 0,8951 | 0,9155 | 0,9660 |

Random Forest belum mengungguli baseline aturan. Macro F1 validasi temporal
lima fold adalah 0,7981 dengan simpangan 0,2053. Empat fold yang memiliki dua
kelas rata-rata 0,8851 dengan simpangan 0,0756 (`cross_validation.csv`). Latih dan uji diasumsikan
berasal dari satu sumber sensor; ini bukan evaluasi generalisasi lintas kolam.
Fold validasi kelima hanya memiliki kelas alarm; macro F1 memakai dua label
tetap dan zero_division 0. Rata-rata CV bukan bukti kemampuan dua kelas pada
semua periode.

Pemeriksaan otomatis lulus: urutan waktu dan purge, timestamp terpisah,
kausalitas fitur setelah data masa depan diubah, median imputer hanya dari
latih, dan kesamaan prediksi setelah model dimuat ulang. Output lengkap ada
di kedua notebook dan `evaluasi_mandiri.json`.

## Perbaikan model (4 Oktober 2026)

`perbaikan_model/` dan `notebooks/03_perbaikan_model.ipynb` mencatat lima pendekatan untuk
mengungguli aturan persistensi dengan protokol tetap (pemilihan hanya lewat CV data latih, holdout
sekali). Model terpilih naik dari macro F1 holdout 0,8951 ke 0,9081 dan menjadi model bawaan layanan
AI, tetapi belum terbukti mengungguli aturan (0,9158; selisih tidak signifikan). Notebook 01 dan 02
di atas tidak diubah.

## Kontribusi kedua anggota

Modul mewajibkan kedua anggota melakukan commit. Belum dibuat commit pada
pengerjaan ini dan tidak dipalsukan identitas penulis. Alpin dan Dimas perlu
meninjau pekerjaan, membagi perubahan yang benar-benar mereka tinjau/kerjakan,
lalu melakukan commit masing-masing menggunakan akun Git sendiri.

## Membangun ulang laporan dan bukti

`build_notebooks_mandiri.py` membangun notebook dari sumber dan **menghapus
output lama**; jalankan hanya bila ingin meregenerasi, lalu eksekusi kembali.
Setelah kedua notebook dieksekusi, `export_bukti_mandiri.py` mengekspor output
ke HTML. `screenshot_mandiri.cjs` menggunakan Playwright dan Microsoft Edge
untuk screenshot; pasang Playwright atau tentukan `PLAYWRIGHT_MODULE` ke modul
yang tersedia. `build_laporan_mandiri.py` kemudian membuat DOCX dari output dan
bukti tersebut. Dependensi screenshot terpisah dari dependensi analisis.

DOCX hasil sesi ini dirender melalui Microsoft Word 16 ke PDF karena renderer
LibreOffice tidak tersedia pada komputer ini. Halaman PDF dirasterisasi dan
ditinjau visual; PDF dan gambar QA bukan pengganti kode notebook.
