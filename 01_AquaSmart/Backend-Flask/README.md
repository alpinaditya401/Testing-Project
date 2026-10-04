# Backend Flask: Layanan AI AquaSmart

Layanan **Python AI Service** pada arsitektur SKPL (Gambar 11 dan 12): backend PHP
memanggil `POST /api/predict`, layanan ini mengembalikan kondisi, alasan, tindakan,
dan versi model. Backend PHP tetap menjadi API utama untuk web dan mobile; layanan
ini tidak menyimpan akun pengguna dan tidak pernah menggerakkan aktuator.

| Kebutuhan SKPL | Implementasi |
| --- | --- |
| FR-16 Rekomendasi | `POST /api/predict`: kondisi `normal` / `waspada` / `di_luar_ambang`, keyakinan, alasan, tindakan |
| FR-17 Umpan balik | `POST /api/recommendations/{id}/feedback` |
| FR-18 Retraining | `POST /api/models/train` dari dataset terdaftar saja |
| FR-19 Model registry | Tabel `model_versions`: algoritma, fitur, parameter, metrik, hash dataset, versi ambang, status |
| FR-20 Aktivasi model | `POST /api/models/{versi}/activate`, ditolak 409 bila kriteria validasi tidak lolos (TC-17) |
| TC-18 Rollback | `POST /api/models/rollback` mengaktifkan kembali versi aktif sebelumnya |
| FR-22 Audit | Tabel `audit_logs` untuk pelatihan, aktivasi, dan rollback |
| NFR-12 Explainability | Respons memuat faktor utama model, sumber keputusan (aturan/model), dan versi |
| NFR-13 Safety | Pembacaan terbaru di luar ambang selalu mengalahkan model; `actuation` selalu `false` |

## Model

Keduanya memprediksi apakah pH atau suhu keluar ambang `threshold-rules-v2` pada interval
lima menit berikutnya, dievaluasi pada baris dan pembagian latih/uji yang sama dengan notebook.

| Algoritma | Asal | Holdout macro F1 | Recall alarm |
| --- | --- | ---: | ---: |
| Aturan persistensi (status interval sebelumnya) | pembanding | 0,9158 | 0,9798 |
| `ph-gated-logistic-v2` (**bawaan**) | `08_Sistem-Cerdas/perbaikan_model` | 0,9081 | 0,9777 |
| `rf-v1` | `02_baseline.ipynb` | 0,8951 | 0,9660 |

`tests/test_ml_parity.py` membuktikan kedua algoritma identik dengan sumbernya: `rf-v1` dengan
`evaluasi_mandiri.json`, v2 dengan modul eksperimen terpilih.

**Belum ada model yang terbukti mengungguli aturan persistensi.** v2 lebih baik dari v1, tetapi
selisihnya terhadap aturan −0,0077 dengan CI 95% [−0,025; +0,007]. Karena itu aturan tetap menjadi
pengaman: pembacaan di luar ambang selalu menang, dan v2 hanya menilai saat status sering berganti
(minimal 4 kali dalam 3 jam); saat stabil, keputusan diserahkan ke aturan. Kriteria aktivasi bawaan
menerima model yang kalah paling banyak 0,03 dari aturan dan mencatat `beats_rule_baseline: false`.

v2 hanya memakai pH dan suhu. `rf-v1` juga memakai TDS, yang tidak diukur aplikasi (TDS bukan
kekeruhan); bila TDS tidak dikirim, nilainya diisi median data latih dan disebut di `missing_features`.

## Menjalankan

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
AQUASMART_AI_SERVICE_KEY=... AQUASMART_AI_ADMIN_KEY=... gunicorn --bind 0.0.0.0:8000 --workers 2 --timeout 180 wsgi:app
```

Variabel lain ada di `.env.example`. Tanpa kunci, endpoint yang membutuhkannya menjawab
503, bukan terbuka. Pelatihan berjalan sinkron sekitar 5–20 detik, karena itu timeout
gunicorn dinaikkan.

## Endpoint

Header `X-AquaSmart-AI-Key` berisi kunci layanan (untuk backend PHP) atau kunci admin.
Error memakai bentuk yang sama dengan backend PHP: `{"error": {"code", "message"}}`.

| Metode dan jalur | Kunci | Isi |
| --- | --- | --- |
| `GET /api/health` | – | Status dan versi model aktif |
| `POST /api/predict` | layanan | `{device_id?, readings: [{time, ph, temperature, tds?, turbidity?}], thresholds?}`, 3–2000 pembacaan |
| `POST /api/recommendations/{id}/feedback` | layanan | `{helpful: bool, note?}` |
| `GET /api/models` | admin | Registry, kriteria, dataset terdaftar |
| `POST /api/models/train` | admin | `{algorithm?, dataset?, sensors?, params?, cross_validation?}`; algorithm `ph-gated-logistic-v2` (bawaan) atau `rf-v1` |
| `POST /api/models/{versi}/activate` | admin | Aktifkan kandidat yang lolos validasi |
| `POST /api/models/rollback` | admin | Kembali ke versi aktif sebelumnya |

Contoh:

```bash
curl -X POST localhost:8000/api/models/train -H "X-AquaSmart-AI-Key: $ADMIN" -H 'Content-Type: application/json' -d '{}'
curl -X POST localhost:8000/api/models/rf-20261004111819-72b3b8/activate -H "X-AquaSmart-AI-Key: $ADMIN"
```

## Batasan

- Label latih adalah proksi aturan ambang, bukan penilaian ahli; satu sumber kolam.
- Artefak model dimuat dengan joblib (pickle). Hash artefak diperiksa sebelum dimuat,
  dan hanya berkas yang ditulis layanan ini sendiri yang terdaftar.
- Penyimpanan SQLite, sejalan dengan CR-001; cukup untuk prototipe satu instance.
