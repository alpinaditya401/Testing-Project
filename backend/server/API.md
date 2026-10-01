## Kontrak provenance terbaru: software lokal 15 September 2026

Bagian ini menggantikan catatan gap provenance dari snapshot sebelumnya. Reading/latest_reading, alert, audit, command/feeding log dan growth observation membawa provenance/source_session. Provenance adalah simulation/device/manual/seed/legacy_unverified; field simulation tetap untuk kompatibilitas. Jangan menebak provenance dari pesan atau simulation pada record lama. Device berarti deklarasi asal, bukan bukti perangkat/kalibrasi. Session null bila tidak tersedia; legacy tidak dibuatkan sesi palsu.

Alert source adalah label dari provenance, recommendation UI memakai provenance reading terakhir. Audit aksi manusia default manual; ACK alert menyimpan origin_provenance/source session; lifecycle command mempertahankan provenance command. Seluruh seed_local baru berlabel seed. Database existing tidak di-seed ulang.

GET /api/export menerima kind tambahan telemetry (sehingga enam jenis). JSON meta.source_counts selalu lima kunci; reports juga memiliki source_counts dan setiap group memiliki source_simulation/source_device/source_manual/source_seed/source_legacy_unverified. CSV menambahkan provenance/source_session untuk record biasa dan lima source_*; pada record biasa hitungan adalah total sumber dalam ekspor, pada reports hitungan per hari. Header HTTP X-Provenance-Counts memuat total bahkan saat CSV kosong (file tetap hanya header). CSV formula escaping tetap aktif.

Raw telemetry tetap tidak mengisi pH/NTU kanonis. Ekspor diagnostik mempertahankan ADC, mV, reconstructed mV, mapping, null/status suhu, calibrated=false, provenance/session. Semua filter kalender, limit10000 dan ownership ekspor tetap berlaku. UI raw membaca GET telemetry (100 record terakhir); laporan pH/NTU tidak memasukkan raw placeholder.

TLS lokal kini berjalan di https://192.168.0.103:8443 dengan local CA; NFR05 PARTIAL. Backend key/session/CSRF unchanged. NFR15 VERIFIED secara software; FR01 dan FR07–09 tidak berubah. Panduan dan evidence pada LOCAL_GUIDE/REVIEW_REPORT terbaru.

---

# AquaSmart API lokal

Base URL default: `http://127.0.0.1:8080`. REST JSON, same-origin. Status: LOCAL PROTOTYPE. Jalankan dari Windows PowerShell menggunakan `python server/run_local.py` dari root aplikasi.

## Autentikasi dan error

Browser memakai session HttpOnly/SameSite=Lax. Respons login/register mengembalikan `user` dan `csrf_token`. Semua mutasi sesi yang sudah login wajib `X-CSRF-Token`. Role admin adalah pemilik workspace; viewer hanya baca workspace yang mengundangnya dan dapat mengubah profil sendiri. Register selalu membuat pemilik workspace baru; field role dari browser tidak dipercaya.

Perangkat memakai `X-Device-Key`, terikat device ID. Key disimpan SHA-256 dari 32 byte random, bukan plaintext. Rotasi langsung membatalkan key lama. Key global environment hanya fallback fixture dengan `AQUASMART_APP_ENV=test` dan tanpa key perangkat tersimpan; jangan memakai mode test untuk data nyata.

Body mutasi memakai `Content-Type: application/json`, objek flat, maksimum 64 KiB. JSON rusak 400; media type salah 415; array/object sebagai nilai field 422; payload besar 413. Tidak login 401; role/CSRF salah 403; device asing/tidak ada 404; konflik 409; validasi 422; rate limit 429 dengan Retry-After. Error internal 500 berupa `{"error":{"code":"internal_error","message":"Gangguan server. Referensi: ..."}}`; detail hanya masuk log lokal. Semua JSON API memakai `Cache-Control: no-store, private`.

Rate auth: login 30, register 10 request per IP/route selama 60 detik dari request pertama. Ingestion dan heartbeat masing-masing 240 per 60 detik. Tidak ada rate limiting terdistribusi; server ini untuk loopback lokal.

## Endpoint browser/publik

| Metode dan path | Hak | Body/query dan hasil |
|---|---|---|
| GET /api/health | Publik | status/service; tidak memeriksa hardware |
| GET /api/rules | Publik | version dan hash rules existing; belum histori model |
| POST /api/auth/register | Publik | name (1–100), contact (email/WA 08...), password (8–1024 byte), password_confirmation sama, serial_number opsional; 201 user/csrf |
| POST /api/auth/login | Publik | username, password; email/WA dinormalisasi; user/csrf |
| GET /api/auth/me | Login | user/csrf |
| POST /api/auth/logout | Login+CSRF | objek kosong; logged_out |
| GET /api/devices | Login | daftar perangkat workspace, latest_reading nullable, online/aerator/feeder/auto/last_seen |
| POST /api/devices | Admin+CSRF | serial_number inventory tersedia; 201 device. 422 serial invalid, 409 sudah diklaim |
| PATCH /api/devices/{id} | Admin+CSRF | name 1–100, location 1–150; updated |
| POST /api/devices/{id}/key | Admin+CSRF | objek kosong; device_key ditampilkan sekali, key lama dicabut |
| GET /api/devices/{id}/readings | Login | limit default18, dibatasi1–100; readings urut waktu naik. time/ph/temperature/turbidity/simulation |
| GET /api/devices/{id}/schedules | Login | schedules |
| POST /api/devices/{id}/schedules | Admin+CSRF | time HH:mm, duration integer1–30 detik, days: Setiap hari/Senin - Jumat/Akhir pekan; 201 schedule |
| DELETE /api/schedules/{id} | Admin+CSRF | deleted |
| POST /api/devices/{id}/control | Admin+CSRF | actuator feeder/aerator/auto, value boolean, duration feeder1–30 (default8), request_id opsional1–120 ASCII alnum/:_.-; device/command |
| GET /api/devices/{id}/commands | Login | hingga100 commands terbaru, simulation=true; status pending/delivered/succeeded/failed/timeout |
| GET /api/devices/{id}/feeding-logs | Login | feeder terminal states dari histori command; bukan tabel terpisah |
| GET /api/alerts | Login | limit default20 dibatasi1–100; alerts dan unacknowledged_count; source menyatakan SIMULASI atau UNVERIFIED |
| PATCH /api/alerts/{id}/acknowledge | Admin+CSRF | objek kosong; alert. Idempotent |
| GET /api/audit-logs | Login | limit default20 dibatasi1–100; action/metadata/device_id/created_at |
| GET /api/settings/thresholds | Login | thresholds workspace |
| PATCH /api/settings/thresholds | Admin+CSRF | ph_min/ph_max (0–14,min<max), temperature_min/max (min<max), turbidity_max>0; angka finite |
| PATCH /api/profile | Login+CSRF | name1–100 dan phone1–30; profil sendiri |
| GET /api/growth-observations | Login | hingga200 observasi workspace |
| POST /api/growth-observations | Admin+CSRF | device_id, observed_at YYYY-MM-DD tidak masa depan, weight_g/length_cm positif atau null, notes<=2000; isi sedikitnya satu pengukuran/catatan; 201 observation |
| DELETE /api/growth-observations/{id} | Admin+CSRF | deleted; audit |
| POST /api/invitations | Admin+CSRF | contact; 201 invitation/token sekali tampil, expired24jam |
| POST /api/invitations/accept | Login+CSRF | token64hex; kontak akun harus cocok, belum memiliki device/workspace member; user viewer |
| GET /api/workspace | Login | owner_id/members (id,name,role) |
| DELETE /api/workspace/members/{id} | Admin+CSRF | mencabut akses viewer; revoked |
| GET /api/reports | Login | device_id, date YYYY-MM-DD, period day/week/month; [kontrak laporan](REPORTS_API.md) |

## Endpoint perangkat

| Metode dan path | Kontrak |
|---|---|
| POST /api/devices/{id}/heartbeat | Key perangkat; objek kosong. Online/last_seen diperbarui tanpa membuat reading. Tidak ada bukti hardware_verified |
| POST /api/devices/{id}/readings | Key perangkat; ph0–14, temperature -50–100, turbidity>=0, semua finite; simulation boolean (defaultfalse), created_at opsional ISO8601 dengan zona waktu. Timestamp dinormalisasi UTC. 201 reading; timestamp sama+payload sama idempotent, payload beda409 |
| GET /api/simulator/devices/{id}/commands | Key perangkat; hanya AQUASMART_SIMULATOR_ENABLED=1 dan environment development/test. Pending diubah delivered; tidak dikirim dua kali |
| POST /api/simulator/devices/{id}/commands/{32hex}/ack | Key perangkat; status succeeded/failed. Harus delivered dan belum expired. ACK yang sama idempotent; konflik409 |

Label `simulation=false` adalah deklarasi pengirim, bukan bukti kalibrasi atau sensor fisik. Dataset campuran ditandai di UI/laporan. Alert dibandingkan dengan reading sebelumnya dari sumber yang sama agar simulasi tidak menekan alert non-simulasi. Parameter dan timestamp tidak diklaim sebagai pengukuran terkalibrasi.

## Jadwal dan simulator

`operations_tick.php` hanya CLI dengan DB eksplisit yang ada, environment development/test, dan simulator enabled. DB legacy `server/data/aquasmart.sqlite` ditolak. Launcher menjalankan tick per detik. Jadwal mengikuti AQUASMART_TIMEZONE (default Asia/Jakarta), cocok menit aktif, tanpa backfill waktu terlewat. Request id jadwal unik per hari. Satu command aktif per device/actuator; command tanpa ACK kedaluwarsa. Histori dan audit menyimpan lifecycle, termasuk timeout.

Simulator CLI mendukung `--outcome succeeded`, `failed`, atau `timeout`. Timeout berarti batch diterima tetapi ACK tidak dikirim; tunggu scheduler melakukan expiry, bukan langsung mengklaim terminal timeout. Tidak ada GPIO, serial, motor, relay atau HTTPS produksi.

## Operasional dan evidence

Error log launcher berada di folder database demo (`php.log`) dan dapat dibaca dengan `Get-Content -LiteralPath <path-log> -Tail 50`. Cari reference ID dari respons500. Test reports overflow memeriksa korelasi reference di log tanpa password/detail file pada respons.

Tidak ada job penghapusan reading otomatis. Kebijakan prototype: pertahankan reading minimal enam bulan dan buat backup berkala sesuai kapasitas disk. Script `python server/backup_local.py --database <db> --output <file-baru>` memakai SQLite backup API serta quick_check, termasuk committed WAL. Output existing ditolak. Restore dilakukan saat server berhenti ke path baru dan gunakan AQUASMART_DB_PATH; jangan menimpa DB aktif. Uji backdated reading+backup bukan bukti uptime enam bulan.

Jangan menjalankan server built-in PHP di alamat publik. TLS, calibration, uptime dan sensor fisik berada di luar evidence lokal yang tersedia. Hasil aktual ada di REVIEW_REPORT.md dan CHECKPOINT.md, bukan disimpulkan dari keberadaan endpoint.
# Ekspor dan versi rules
# Catatan kelanjutan hardware

Tambahan 15 September 2026: lima kombinasi method/path berikut diuji memakai fixture HTTP, bukan ESP32 nyata. Scheduler dan `/control` existing tetap simulator.

| Method/path | Auth | Perilaku |
|---|---|---|
| POST `/api/devices/{id}/telemetry` | X-Device-Key per-device | 201 insert/retry identik; 422 invalid; 409 timestamp konflik; 401 key salah. |
| GET `/api/devices/{id}/telemetry` | Session owner/viewer | Telemetry terbaru, descending timestamp; `limit` opsional 1–100 (default 100), 422 limit tidak valid; 404 lintas workspace. |
| POST `/api/devices/{id}/hardware-commands` | Admin + CSRF + ownership | 503 default; perlu `AQUASMART_HARDWARE_ENABLED=1`; 201 queue; 422 invalid; 409 request konflik/aktuator sibuk. |
| GET `/api/device/devices/{id}/commands` | X-Device-Key per-device | Hanya simulation=false; pending→delivered; delivered dikirim ulang tanpa memperpanjang expiry; server_time epoch UTC. |
| POST `/api/device/devices/{id}/commands/{32hex}/ack` | X-Device-Key per-device | succeeded/failed/timeout; identik idempotent 200; transisi/ID/channel konflik 409; status invalid 422. |

Command hardware JSON flat: `{"actuator":"feeder","value":true,"duration":2,"request_id":"uji-servo-001"}`. Feeder duration integer 1–30; aerator duration 0. Satu command aktif per device/actuator di seluruh channel. Request ID ulang harus memiliki actuator/value/duration/channel sama. Pending expiry 60 detik; delivery expiry max(30,duration+15) detik. Polling/ACK hanya meng-expire device peminta. Global scheduler expiry tetap berlaku saat dijalankan. Audit mencatat queue/delivery/terminal. Respons hardware selalu `physical_actuation_verified=false`; ACK bukan bukti gerakan.

Telemetry JSON flat, contoh sintetis (bukan pengukuran):

```json
{"created_at":"2026-09-15T08:00:00Z","provenance":"device","simulation":false,"source_session":"esp32-contoh-001","temperature":27.25,"temperature_status":"ok","turbidity_adc":2000,"turbidity_mv":1500,"turbidity_sensor_mv":2500,"turbidity_mapping_percent":50,"soil_ph_adc":1000,"soil_ph_mv":800,"ph_sensor":"soil_placeholder","calibrated":false}
```

Timestamp UTC tepat YYYY-MM-DDTHH:mm:ssZ, kalender valid. Device ID pada path; field tambahan diabaikan. source_session 8–64 karakter alfanumerik ASCII/underscore/hyphen; provenance device/simulation harus cocok boolean simulation. Ini deklarasi sumber terautentikasi, bukan attestation hardware.

Suhu ok memerlukan angka −55…125°C; disconnected/unverified memerlukan null. ADC integer 0…4095 atau null harus berpasangan mV 0…3300 atau null. Rekonstruksi turbidity mV/rasio toleransi 2 mV, rentang 0…5500; mapping 0…100. Field opsional turbidity_divider_ratio harus berupa angka lebih dari 0 sampai 1; default 0.6 untuk firmware lama, sedangkan 1.0 mendukung konfigurasi 3,3 V tanpa divider. Bila turbidity null, reconstructed/mapping juga null. ph_sensor=soil_placeholder dan calibrated=false wajib. Sensor belum dikenal/aman dikirim null, tanpa angka palsu.

TDS dan level air (opsional, sejak 26 September 2026): tds_adc/tds_mv mengikuti aturan ADC yang sama. water_distance_cm 0…500 dan tank_height_cm 1…500 wajib berpasangan atau keduanya null. Server menghitung sendiri tds_ppm_estimate (kurva DFRobot SEN0244 pada asumsi 25°C, dibulatkan 0,1, belum terkalibrasi) dan water_level_percent ((tinggi tandon − jarak) / tinggi tandon × 100, dibatasi 0…100); nilai turunan kiriman perangkat diabaikan. Baris lama tanpa field ini dikembalikan GET dan ekspor dengan nilai null, dan retry identik atas baris lama tetap 201.

**PLACEHOLDER SENSOR TANAH, BUKAN pH AIR TERKALIBRASI.** Mapping turbidity bukan NTU. Data masuk device_telemetry dengan received_at server; tidak mengisi sensor_readings pH/NTU, tidak memicu rules pH air, dan belum masuk lima ekspor historis. UI diagnostik/ekspor raw masih tercatat sebagai pekerjaan lanjutan di CHECKPOINT.

Migrasi transaksional menambahkan provenance/source_session pada sensor_readings, alerts, actuator_commands, growth_observations dan audit_logs. Baris lama tetap legacy_unverified, tidak ditebak dari isi pesan. Data baru mencatat simulation/device, observasi manual, bootstrap Database seed. **NFR15 masih PARTIAL**: propagasi menyeluruh DTO/report/seed_local/UI belum selesai. Jangan menggunakan label sumber lama sebagai bukti pengukuran lapangan.

## Konfirmasi referensi air (30 September 2026)

Telemetry menerima boolean opsional `water_level_reference_confirmed` dan
`water_probes_immersed`. Keduanya default false; string, angka, dan null ditolak 422.
GET melengkapi payload lama dengan false, dan retry identik payload lama tetap diterima.
Flag adalah deklarasi operator melalui konfigurasi firmware, bukan bukti otomatis adanya air.

Backend tetap menyimpan sinyal dan hasil perhitungan mentah untuk diagnosis. Dashboard
memeriksa umur data (maksimal 10 detik), rentang HY-SRF05 2–450 cm, geometri wadah,
dan konfirmasi referensi sebelum menampilkan level. Suhu air/TDS/kekeruhan utama juga
memerlukan indikasi air dan konfirmasi posisi probe terendam. Kedalaman paling banyak
1 cm ditandai kosong/sangat dangkal. Nilai TDS di luar 0–2300 mV/0–1000 ppm disembunyikan
dari pembacaan utama. Angka TDS utama juga disembunyikan selama `calibrated=false`;
kontrak saat ini belum menerima hasil kalibrasi. Dashboard diagnosis hanya menampilkan
tegangan TDS, bukan ppm hasil rumus. API tetap menyimpan estimasi mentah untuk riwayat
diagnosis, tanpa menjadikannya pengukuran terkalibrasi. Tidak mengisi pH/NTU kanonis.

## Ekspor historis

`GET /api/export?device_id=AQS-KOLAM-01&kind=readings&period=day&date=2020-01-01&format=json` membutuhkan session milik owner atau viewer workspace. `kind`: readings, alerts, commands, feeding_logs, reports. `format`: json atau csv. Periode day/week/month memakai UTC, minggu Senin, tanggal ketat YYYY-MM-DD. Data perangkat lain mengembalikan 404; filter invalid atau lebih dari 10.000 baris mengembalikan 422. CSV kosong berisi header saja; JSON memiliki `meta` dan `rows`. Header `X-Export-Rows` menyatakan jumlah baris. Label simulation/source disertakan; semua ekspor `hardware_verified` pada metadata JSON bernilai false. CSV menetralkan awalan formula dalam teks dan mempertahankan nilai numerik. Timestamp command adalah epoch detik UTC; reading/alert ISO-8601 UTC. Feeding log hanya feeder terminal succeeded/failed/timeout.

`GET /api/rule-versions` membutuhkan session dan hanya mengembalikan 100 versi terbaru milik workspace: id SHA-256, version algoritma, config threshold sebenarnya, created_at UTC, reading_count. Tabel `rule_versions` dan `reading_rule_versions` mencatat snapshot per ingestion baru secara transaksional. Retry reading identik tidak membuat versi/link tambahan. Data seed atau data lama tidak direkonstruksi. `/api/rules` tetap katalog algoritma baseline publik; konfigurasi aktual ada pada snapshot tersebut.
