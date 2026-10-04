# Koreksi pemilihan model

Dicatat sebelum `margins_best` dievaluasi pada holdout.

Aturan pemilihan: pendekatan dengan rata-rata selisih macro F1 CV (fold dua kelas, seed 42, 0, 1)
tertinggi terhadap aturan persistensi. Workflow pemilihan memakai angka CV yang dilaporkan masing-masing
agen pengembang. Untuk `margins_best` angka laporan itu (rata-rata +0,012767) tidak sama dengan keluaran
berkas modul finalnya. Menjalankan ulang harness pada modul final, dua kali dan deterministik:

| Modul | Seed 42 | Seed 0 | Seed 1 | Rata-rata |
| --- | ---: | ---: | ---: | ---: |
| `margins_best` | +0,012775 | +0,013096 | +0,013369 | **+0,013080** |
| `context_best` | +0,012922 | +0,012922 | +0,012922 | +0,012922 |

Dengan aturan yang sama, pilihan yang benar adalah `margins_best` (selisih 0,00016, praktis seri).
`context_best` sudah terlanjur dievaluasi pada holdout karena kesalahan pelaporan itu; hasilnya tetap
dilaporkan apa adanya.

Keputusan yang dikunci sebelum melihat holdout `margins_best`: `margins_best` menjadi model terpilih dan
model bawaan layanan AI apa pun hasil holdout-nya, kecuali audit menemukan kebocoran data atau pelanggaran
protokol. Kedua hasil holdout dilaporkan berdampingan.
