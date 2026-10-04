# Perbaikan model AquaSmart (4 Oktober 2026)

Lanjutan Tugas Mandiri Hari 1. Random Forest di `02_baseline.ipynb` kalah dari aturan
persistensi (status interval sebelumnya) dengan macro F1 0,8951 lawan 0,9158. Folder ini
mencatat upaya memperbaikinya dengan protokol yang tidak bisa diakali.

## Protokol

`harness.py` dipakai oleh semua pendekatan tanpa diubah:

- Data, target, baris yang dievaluasi, dan pembagian latih/uji sama persis dengan notebook
  (8.525 latih, 2.135 uji, purge 60 menit). Harness mereproduksi angka notebook.
- Pemilihan hanya lewat `TimeSeriesSplit(5, gap=12)` pada data latih, dibandingkan dengan aturan
  persistensi pada fold yang sama. Ukuran utama: selisih macro F1 pada fold yang memiliki dua kelas.
- Uji kausalitas otomatis: fitur pada atau sebelum titik uji tidak boleh berubah saat nilai sensor
  sesudahnya diubah.
- Holdout terkunci (`AQUASMART_HOLDOUT_UNLOCK=1`) dan dijalankan **sekali**, untuk pendekatan
  terpilih dan baseline, setelah pemilihan selesai.

## Hasil

Lima pendekatan dikembangkan terpisah (`approaches/*_best.py`):

| Pendekatan | Rata-rata selisih CV terhadap aturan |
| --- | ---: |
| `context_best`: model pH berpagar regime (terpilih) | +0,0129 |
| `margins_best`: ExtraTrees dengan margin ambang dan estimasi Markov | +0,0128 (enam seed) |
| `flip_best`: model perpindahan status | +0,0118 |
| `boost_best`: HistGradientBoosting dengan histeresis | +0,0079 |
| `calib_best`: kalibrasi ambang keputusan | +0,0071 |
| `baseline`: Random Forest v1 notebook | −0,0353 |

Holdout, dijalankan sekali:

| Model | Macro F1 | Balanced accuracy | Recall alarm |
| --- | ---: | ---: | ---: |
| Aturan persistensi | 0,9158 | 0,9165 | 0,9798 |
| **Terpilih (v2)** | **0,9081** | 0,9095 | 0,9777 |
| Random Forest v1 | 0,8951 | 0,9155 | 0,9660 |

Selisih terpilih terhadap aturan pada holdout −0,0077, CI 95% bootstrap blok [−0,0253; +0,0070].

`context_best` dan `margins_best` praktis seri di CV: urutannya bergantung pada himpunan seed
(enam seed: +0,01292 lawan +0,01276; tiga seed 42/0/1: +0,01292 lawan +0,01308). Aturan pemilihan yang
ditulis sebelum ada hasil merata-ratakan semua seed yang dilaporkan, sehingga `context_best` terpilih.
Sempat terjadi koreksi pemilihan yang keliru ke `margins_best` sesudah hasil holdout `context_best`
terlihat; kesalahan itu dan pembetulannya dicatat di `KOREKSI_PEMILIHAN.md`. Hasil holdout `margins_best`
(macro F1 0,9195; CI selisih terhadap aturan [−0,0177; +0,0242]; recall alarm 0,9602) hanya eksplorasi
pandangan kedua dan tidak dipakai: setiap perbedaannya dengan aturan berupa alarm yang ditekan.
Tiga audit independen (kebocoran fitur, protokol, ketahanan) tidak menemukan kebocoran, tetapi
menyatakan klaim "mengungguli aturan" tidak tahan uji: 71,5% keuntungan CV berasal dari satu episode
pH yang naik-turun sekitar 6,5 di fold 3, dan keunggulan itu berbalik di holdout.

## Kesimpulan

- Model v2 **lebih baik dari Random Forest v1** (macro F1 +0,013, recall alarm +0,012 pada holdout)
  dan menjadi model bawaan Layanan AI (`01_AquaSmart/Backend-Flask`, algoritma
  `ph-gated-logistic-v2`). Port-nya diuji identik dengan `approaches/context_best.py`.
- Model v2 **belum terbukti lebih baik dari aturan persistensi**. Dengan data satu kolam dan satu
  periode, aturan tetap menjadi pengaman utama: di layanan AI, pembacaan di luar ambang selalu
  mengalahkan model, dan v2 hanya menilai saat status sering berganti.
- Memilih ulang pendekatan dengan melihat hasil holdout membuat holdout tidak lagi independen; satu kali
  hal itu sempat terjadi karena kekeliruan dan sudah dibatalkan (`KOREKSI_PEMILIHAN.md`). Bukti yang lebih
  kuat butuh data dari kolam atau periode lain.
- Kunci holdout di `harness.py` bersifat prosedural: skrip yang mengimpor fungsinya tetap bisa menilai
  baris uji. Disiplin pemilihan dijaga lewat catatan dan cap waktu, bukan oleh kode.

## Menjalankan ulang

```bash
python harness.py approaches/context_best.py --seeds 42,0,1     # CV saja
AQUASMART_HOLDOUT_UNLOCK=1 python harness.py approaches/context_best.py --holdout
AQUASMART_HOLDOUT_UNLOCK=1 python holdout_bootstrap.py
```

Dependensi sama dengan `../requirements-mandiri.txt`. Rincian lengkap ada di
`hasil_perbaikan.json` dan `notebooks/03_perbaikan_model.ipynb`.
