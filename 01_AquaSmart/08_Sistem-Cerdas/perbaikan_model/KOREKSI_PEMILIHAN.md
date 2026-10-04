# Koreksi pemilihan model: catatan yang dibatalkan

Dokumen ini mencatat kesalahan prosedur dan pembetulannya, apa adanya.

## 1. Catatan awal (13:30 UTC, ternyata salah)

Versi pertama dokumen ini menyatakan bahwa angka CV `margins_best` yang dilaporkan agen pengembang
(+0,012767) "tidak sama dengan keluaran berkas modul finalnya", menghitung ulang dengan seed 42, 0, 1
(rata-rata +0,013080, di atas `context_best` +0,012922), lalu memindahkan pilihan ke `margins_best` dan
mengevaluasinya pada holdout.

## 2. Mengapa salah

Audit protokol menjalankan ulang modul final untuk keenam seed yang dilaporkan agen:

| Seed | 42 | 0 | 1 | 7 | 123 | 2024 | Rata-rata |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `margins_best` | +0,012775 | +0,013096 | +0,013369 | +0,012139 | +0,012095 | +0,013096 | **+0,012762** |
| `context_best` (deterministik) | +0,012922 | sama | sama | sama | sama | sama | **+0,012922** |

Laporan agen akurat. Selisihnya hanya karena enam seed lawan tiga seed. Aturan pemilihan yang ditulis
sebelum ada hasil apa pun merata-ratakan semua seed yang dilaporkan, dan dengan aturan itu `context_best`
memang terpilih dengan benar. Mempersempit menjadi tiga seed **sesudah** hasil holdout `context_best`
terlihat adalah perubahan aturan pasca-hasil, dan memberi model kedua kesempatan pada holdout yang sama.

## 3. Pembetulan

- Pilihan sah tetap **`context_best`** (model pH berpagar regime). Itulah model v2 di layanan AI.
- Hasil holdout `margins_best` dilaporkan sebagai **eksplorasi pandangan kedua**, bukan konfirmasi, dan
  tidak dipakai untuk memilih: macro F1 0,9195 lawan aturan 0,9158 (+0,0037, CI 95% [-0,0177; +0,0242]).
- Terlepas dari soal prosedur, `margins_best` tidak cocok sebagai alarm keselamatan: setiap perbedaannya
  dengan aturan berupa alarm yang ditekan, tidak pernah alarm yang ditambahkan. Recall alarm holdout
  0,9602, lebih rendah dari aturan (0,9798) dan dari Random Forest v1 (0,9660).
- Selisih CV kedua model (0,00016) lebih kecil daripada sebaran antar-seed `margins_best` (0,00064), jadi
  CV menunjukkan seri, bukan pemenang.
