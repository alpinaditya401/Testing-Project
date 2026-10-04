# Change Request CR-002: Aplikasi mobile Flutter native dan Layanan AI Flask

| Field | Isi |
| --- | --- |
| Nomor | CR-002 |
| Proyek | AquaSmart AIoT |
| Tanggal pengajuan | 4 Oktober 2026 |
| Pengaju | Tim pengembang |
| Kategori perubahan | Major untuk mobile (mengubah teknologi baseline); Minor untuk layanan AI (mengisi komponen yang sudah ada di arsitektur) |
| Deliverable terdampak | Aplikasi Mobile (SKPL Tabel 15, FR-06–FR-17); Python Sistem Cerdas (FR-16–FR-20) |
| Status | **Mobile: mengikuti arahan dosen pengampu (Flutter). Layanan AI: diajukan, menunggu keputusan** |
| Keputusan | Mobile: arahan dosen pengampu memakai Flutter, disampaikan tim pada 4 Oktober 2026. Layanan AI: menunggu persetujuan |
| Tanggal keputusan | Mobile: arahan disampaikan 4 Oktober 2026 (tanggal arahan asli belum tercatat). Layanan AI: menunggu |

Arahan dosen untuk memakai Flutter dicatat sebagaimana disampaikan tim; dokumen ini tidak
memalsukan tanda tangan maupun tanggal arahan aslinya. Kolom paraf tetap kosong sampai
diisi pihak yang berwenang.

## 1. Perubahan yang diminta

SKPL v1.0 (24 Agustus 2026) menetapkan:

- Tabel 8 dan Tabel 15: Mobile = **"PWA + Android WebView"**, luaran "PWA/Android WebView".
- Gambar 11–12 dan Tabel 7: **"Python AI Service"** pada application tier yang menerima
  `POST /predict` dari API PHP, tanpa menyebut kerangka kerjanya.

Yang diminta:

1. **Mobile**: aplikasi Android native dengan **Flutter** (`01_AquaSmart/Mobile-Flutter`),
   memakai REST API PHP yang sama dengan web. PWA yang sudah ada tetap dipertahankan.
2. **Layanan AI**: komponen Python AI Service diimplementasikan dengan **Flask**
   (`01_AquaSmart/Backend-Flask`). Backend utama tetap PHP Native sesuai SKPL; Flask
   tidak menggantikannya.

## 2. Alasan

1. **Dosen pengampu mengarahkan aplikasi mobile memakai Flutter** (disampaikan tim pada
   4 Oktober 2026). SKPL v1.0 masih menulis "PWA/Android WebView", jadi baris itu perlu
   diperbarui pada revisi SKPL berikutnya. Flask dipilih tim untuk layanan AI.
2. Aplikasi native memberi kontrol penuh atas sesi (cookie dan CSRF di memori, tanpa
   penyimpanan kredensial), status offline, dan aksesibilitas sentuh.
3. FR-16 sampai FR-20 (rekomendasi, umpan balik, retraining, model registry, aktivasi)
   belum terimplementasi sama sekali sebelum perubahan ini. Flask adalah layanan Python
   yang paling sederhana untuk membungkus model scikit-learn dari `08_Sistem-Cerdas`.

## 3. Analisis dampak

| Aspek | Dampak |
| --- | --- |
| Kontrak API PHP | Bertambah dua endpoint: `GET /api/devices/{id}/recommendation`, `POST /api/recommendations/{id}/feedback`. Endpoint lama tidak berubah. |
| Data | Layanan AI punya SQLite sendiri (registry model, rekomendasi, umpan balik, audit); backend PHP menambah tabel `ai_recommendations` untuk pemeriksaan kepemilikan umpan balik. |
| Keamanan | Kunci layanan dan admin AI terpisah lewat environment; tanpa konfigurasi endpoint menjawab 503. Rekomendasi tidak pernah menggerakkan aktuator (NFR-13). |
| Pengujian | Flask 15 test pytest (termasuk paritas dengan notebook); PHP 4 test jembatan; Flutter 17 test; CI menjalankan semuanya dan membangun APK debug. |
| Deployment | Layanan AI membutuhkan satu layanan tambahan (gunicorn). Aplikasi mobile didistribusikan sebagai APK. |
| Jadwal | Tidak menggeser deliverable lain; web/PWA tidak berubah. |

## 4. Risiko dan mitigasi

| Risiko | Mitigasi |
| --- | --- |
| Model kalah dari aturan ambang (macro F1 0,8951 lawan 0,9158) | Kriteria aktivasi tercatat; respons memuat `beats_rule_baseline`; pembacaan di luar ambang selalu menang atas model. |
| TDS tidak diukur aplikasi | `missing_features` dan alasan menyebutkannya; model ph+suhu dapat dilatih. |
| Dua klien (web dan mobile) menyimpang | Keduanya memakai kontrak `server/API.md`; test Flutter membaca respons PHP asli dari `frontend/lib/api/fixtures.json`. |
| Belum ada uji perangkat Android fisik | Dicatat sebagai belum diverifikasi; APK dari CI perlu diuji di HP nyata sebelum klaim siap pakai. |

## 5. Alternatif yang dipertimbangkan

- **Flutter WebView membungkus PWA**: paling dekat dengan teks SKPL, tetapi hampir tanpa logika
  mobile. Ditolak; aplikasi native lebih sesuai arahan dosen.
- **Flask menggantikan seluruh backend PHP**: menduplikasi backend yang sudah lulus 114 test
  dan menyimpang lebih jauh dari SKPL. Ditolak.

## 6. Rencana bila perubahan ditolak

Bagian mobile tidak lagi bergantung pada keputusan ini karena mengikuti arahan dosen. Bila
bagian layanan AI ditolak, jembatan PHP cukup dibiarkan tanpa `AQUASMART_AI_URL` (endpoint
rekomendasi menjawab 503) dan fitur lain tidak terpengaruh.

## 7. Keputusan

| Pihak | Keputusan | Tanggal | Paraf |
| --- | --- | --- | --- |
| Dosen pengampu: aplikasi mobile Flutter | Diarahkan memakai Flutter (disampaikan tim) | 4 Oktober 2026 (dicatat) | |
| Dosen pengampu / sponsor: layanan AI Flask | Menunggu | Menunggu | |
