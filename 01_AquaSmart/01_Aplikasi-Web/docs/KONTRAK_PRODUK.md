# Kontrak integrasi alur produk

Rancangan ini menghubungkan mockup dengan implementasi. Semua angka memakai ProductPolicy/config/product.php dan KALKULASI.md. Jangan menganggap endpoint di bawah tersedia sebelum diuji dan diberi status implemented.

## Status endpoint (diperiksa terhadap `server/product_routes.php`, 2 Oktober 2026)

| Endpoint | Status | Batas |
| --- | --- | --- |
| `GET /api/units` | implemented | Daftar unit produk milik workspace beserta status penjual akun |
| `GET /api/seller/units`, `POST /api/seller/units` | implemented | Tanpa QR nyata dan tanpa reissue kode |
| `POST /api/units/claim` | implemented | Input manual; scan kamera/QR belum ada |
| `GET /api/units/{id}/onboarding` | implemented | Provisioning WiFi belum ada |
| `GET /api/units/{id}/dashboard` | implemented | Pump config dan jadwal belum termasuk |
| `POST /api/units/{id}/commands` | implemented, hanya `channel=simulation` | Kanal lain dijawab 503 `hardware_pending` |
| `GET /api/push/config`, `/api/push/subscriptions`, `/api/push/test` | belum ada | Web Push (bagian D) belum dibangun |

Bagian di bawah tetap kontrak target. Butir yang belum tercantum sebagai implemented pada tabel di atas masih rancangan.

## Penjual

- Izin penjual berasal dari pemberian akses operator secara eksplisit (CLI lokal/admin sistem), bukan role `admin` pemilik yang otomatis didapat saat registrasi.
- `POST /api/seller/units`: auth penjual + CSRF, serial/nama/lokasi. Insert unit, credential hash, activation hash+expiry dan audit dalam transaksi. UNIQUE serial+activation hash; collision generator retry terbatas, rollback seluruhnya jika gagal.
- Response penjual hanya berisi serial, kode aktivasi sekali tampil, expires_at dan label/tautan QR. Header no-store. Jangan log kode mentah.
- Device auth key dibuat independen, disalurkan lewat artefak persiapan lokal berizin terbatas. Tidak ada pada QR, payload client, audit, atau ekspor client. Mekanisme secret handoff penjual perlu diselesaikan sebelum unit dinyatakan siap dijual.
- Label QR berisi origin AquaSmart yang dikonfigurasi dan fragment klaim dengan serial+kode agar kode tidak masuk access log query; client menghapus fragment setelah membaca. Tidak menggunakan layanan QR pihak ketiga yang menerima secret aktivasi.
- `GET /api/seller/units`: tidak mengembalikan kode aktivasi mentah/credential. Reissue hanya untuk unit belum dimiliki; mencabut kode sebelumnya secara atomik.

## Klaim

- `POST /api/units/claim`: login pemilik + CSRF, serial+activation_code. Lockout dan rate limit dipersist, tidak hanya dalam memori proses.
- Transaksi write SQLite harus diperoleh sebelum read ownership. Verifikasi ownership/used/expiry, conditional consume kode, insert unit, ikat credential, audit, commit. Dua request bersamaan menghasilkan satu pemilik; request lain memperoleh konflik spesifik, bukan 500 database locked.
- Klaim sukses: state waiting dan last_heartbeat null. Jangan mengisi waktu heartbeat dari waktu klaim.
- Error code terpisah: serial_not_found, activation_invalid, activation_expired, activation_used, activation_locked, device_already_claimed, forbidden.
- Jalur legacy `Auth::register(serial)` dan `DeviceLifecycle::claim(serial)` harus ditutup untuk inventory produk berkode aktivasi; menambah endpoint baru tanpa memperbaiki bypass lama tidak cukup.
- QR invalid atau kamera tidak tersedia selalu dapat dialihkan ke input manual. Tidak mengeksekusi URL hasil scan sembarang.

## Onboarding dan dashboard

- `GET /api/units/{id}/onboarding`: ownership server-side, claimed state, heartbeat server, capabilities yang benar-benar tersedia, pending_steps. Tidak mengembalikan credential/password WiFi.
- `GET /api/units/{id}/dashboard`: server_now, connection (waiting/online/offline), telemetry provenance+sample age, suhu/histori, pump config, feeding schedules, command status. Pengecekan ownership wajib untuk semua subresource.
- Request UI membawa generation token/AbortController per pemilihan unit; response lama diabaikan untuk data, error, loading, dan command controls. Setiap action menangkap id unit yang benar dan menolak perubahan konteks selama request.
- Mode pompa adalah kontrak baru; jangan rename aerator legacy menjadi pump tanpa migrasi/adapter eksplisit. Jadwal lama >10 detik tetap dipertahankan dan ditandai perlu review sebelum penggunaan jalur produk.
- POST command memakai request_id, idempotence dan status pending→delivered→succeeded/failed/timeout. Hardware gate tetap off dalam sesi software. Tidak ada tombol yang melaporkan aksi fisik selesai melalui timeout UI buatan.
- WiFi provisioning: UI panduan dan capability pending. Browser HTTPS publik tidak boleh berpura-pura menulis WiFi ke ESP32 lokal tanpa protokol lokal yang didukung dan diuji. Kontrak firmware terpisah; tidak mengubah firmware pada sesi ini.

## Web Push

- `GET /api/push/config`: dukungan server dan public VAPID key saja. Private key tetap konfigurasi server.
- `POST /api/push/subscriptions`: auth+CSRF, endpoint HTTPS dan key valid, ikat ke akun; endpoint dapat bersifat sensitif dan tidak tampil ke akun lain/log umum.
- Validasi destinasi push menghindari SSRF: gunakan provider transport terpelihara dan pembatasan endpoint publik/provider, tolak loopback/private/link-local, kredensial URL dan redirect ke jaringan lokal. Jangan menjadikan endpoint arbitrary sebagai fetch proxy.
- `DELETE /api/push/subscriptions/{id}`: hanya pemilik. Logout melepas subscription session terkait agar akun berikutnya tidak menerima notifikasi pemilik lama.
- `POST /api/push/test`: benar-benar mengirim lewat provider; 503 jika VAPID/transport belum siap, bukan response sukses palsu. accepted bukan delivered-to-screen.
- Worker memeriksa suhu valid/fresh, heartbeat offline dan terminal command failure, mengubah state episode+outbox secara atomik. Storage idempotence untuk episode dan delivery per subscription diperlukan.
- 404/410: nonaktifkan subscription, lanjutkan delivery lain. 429/5xx: retry terbatas dan Retry-After. Transport crypto memakai library terpelihara, jangan membuat implementasi Web Push encryption sendiri.
- Service worker menampilkan notification, lalu notificationclick hanya membuka deep link same-origin ke unit/event. Halaman tujuan tetap memeriksa autentikasi/ownership; payload bukan otorisasi.
- Izin ditolak lalu diberikan: refresh capability/Notification.permission saat kembali ke aplikasi; subscribe hanya dari gesture pengguna. iOS Home Screen prerequisite harus dijelaskan.

## Tes integrasi yang masih wajib

1. Forced activation collision dan rollback; serial duplicate; secret tidak bocor pada client/export/audit.
2. Klaim expiry boundary/lockout/replay/dua akun, dua proses bersamaan; bypass klaim legacy ditolak.
3. Unit ownership semua endpoint; fast switch out-of-order termasuk error response.
4. Queue expiry exact boundary, ACK out-of-order, retry identical, payload conflict, scheduler restart occurrence uniqueness.
5. Push unsupported/denied→granted, invalid subscription, provider failure, debounce state persistence dan worker concurrency.
6. Backup/migrasi data existing sebelum schema aktif, perbandingan row/value; tanpa seed ulang.

Implementasi HTTP, schema migration dan worker di dokumen ini semuanya **pending** pada checkpoint fondasi. Policy unit tests bukan pengganti tes integrasi tersebut.
