# API laporan AquaSmart — kontrak yang diuji

## Endpoint

`GET /api/reports?device_id=AQS-KOLAM-01&period=month&date=2020-02-17`

Memerlukan sesi login. `device_id` wajib dimiliki workspace pengguna; viewer hanya membaca workspace yang masih memberinya akses. Perangkat tidak ada dan perangkat milik workspace lain sama-sama menghasilkan 404.

| Parameter | Kontrak |
|---|---|
| `device_id` | Wajib, string 1–128 karakter: huruf ASCII, angka, `_`, `-`. |
| `date` | Wajib, tanggal kalender persis `YYYY-MM-DD`; tidak menerima timestamp, tanggal relatif, atau rollover tanggal invalid. |
| `period` | `day` (default), `week`, atau `month`. |

Semua kalender/bucket menggunakan **UTC**, mengikuti timestamp ingestion yang dinormalisasi ke UTC. `week` dimulai Senin; tanggal menentukan minggu/bulan yang dipilih. Rentang bersifat `[start_at, end_at_exclusive)`. Rentang yang melewati tahun 9999 ditolak dengan 422.

## Respons berhasil

- `device_id`, `period`, `date`, `timezone`, `start_at`, `end_at_exclusive` menjelaskan cakupan.
- `groups`: hanya hari yang memiliki sampel, urut tanggal naik.
- Setiap grup: `day`, `cnt`, `ph_avg`, `temperature_avg`, `turbidity_avg`, `simulation_samples`, `non_simulation_samples`.
- Top-level: `total_samples`, `simulation_samples`, `non_simulation_samples`.
- Periode tanpa data: `groups: []`, seluruh hitungan nol. Tidak ada angka sensor atau hari kosong yang direkayasa.
- Rata-rata mencakup seluruh sampel perangkat pada hari itu. Jumlah sampel simulasi/non-simulasi selalu disertakan agar dataset campuran tidak tersamarkan.
- `non_simulation_samples` hanya menghitung flag sumber yang diterima API. Flag false **bukan bukti bahwa pengukuran berasal dari hardware fisik**.
- Respons API menggunakan `Cache-Control: no-store`. Endpoint laporan tidak membuka wildcard CORS.

## Error yang diuji

| Status | Kondisi |
|---|---|
| 401 | Tidak memiliki sesi login. |
| 404 | Perangkat tidak ada/tidak dapat diakses; termasuk viewer setelah akses dicabut. |
| 422 | Tanggal/periode/device_id invalid, parameter array, atau rentang tanggal di luar dukungan. |

HTTP 500 tetap kegagalan dan tidak boleh dihitung sebagai tes lulus.

## Verifikasi

```bash
# Working directory: 01_Aplikasi-Web
python -B server/tests/test_reports.py
python -B server/tests/run_verified_suite.py
```

Sembilan tes laporan memakai PHP nyata dan database sementara: agregasi harian/nilai rata-rata, perangkat lain, kalender minggu lintas tahun, seluruh Februari tahun kabisat, batas awal/akhir, validasi, data kosong, owner/viewer/revocation, normalisasi zona waktu dan hitungan simulasi. Runner lama `server/tests/run_report_test.py` kini meneruskan ke suite ini dengan exit code asli, bukan meluncurkan server berport tetap.

## Batas penyelesaian

Perbaikan ini membuat **API agregasi** bekerja. UI laporan saat ini masih menampilkan pilihan pembacaan 12/36 terbaru; belum dihubungkan ke filter kalender endpoint ini. Tidak menyatakan laporan PDF, ekspor bulanan dari UI, IoT fisik, rules-version storage, atau proyek keseluruhan selesai.
