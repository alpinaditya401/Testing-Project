# AquaSmart AIoT

Sistem pemantauan kualitas air untuk akuakultur: pH, suhu, dan kekeruhan.

## Penyusun

Proyek Akhir Praktikum Pemrograman Front-End, tahun akademik 2026.
Program Studi D3 Teknik Informatika, Kampus Kabupaten Madiun,
Sekolah Vokasi, Universitas Sebelas Maret.

| Nama | NIM |
| --- | --- |
| Alpin Aditya Pratama | V3925004 |
| Dimas Aryo Sejati | V3925022 |

Dosen pembimbing: Darmawan Lahru Riatma, S.Kom., M.MT.

## Hak cipta

Hak cipta (c) 2026 Alpin Aditya Pratama dan Dimas Aryo Sejati. Seluruh hak
dilindungi. Ketentuan lengkapnya ada di [LICENSE](LICENSE).

Repositori ini publik semata-mata supaya penilai dapat memeriksa kode sumbernya.
Sifat publik itu bukan izin penggunaan. Mengumpulkan karya ini atau turunannya
sebagai karya sendiri adalah plagiarisme akademik. Riwayat commit Git di
repositori ini mencatat tanggal, penulis, dan isi setiap perubahan sejak commit
awal `3a465cd` pada 19 September 2026, sehingga urutan pengerjaan sejak tanggal
itu dapat diverifikasi secara independen. Pekerjaan sebelum tanggal itu masuk
sekaligus dalam commit awal tersebut.

## Status

Aplikasi web berjalan dan teruji secara lokal. Yang perlu dibaca apa adanya:

- **Kontrol aerator dan pemberi pakan masih SIMULASI.** Perintah tersimpan,
  berpindah status, dan tercatat di audit log, tetapi belum ada bukti aktuasi
  perangkat fisik. Respons sukses untuk ACK perangkat dan untuk pembuatan
  perintah hardware memuat `physical_actuation_verified=false`.
- **Pembacaan sensor belum terkalibrasi.** Label `simulation=false` adalah
  deklarasi pengirim, bukan bukti sensor fisik. Sensor pH yang ada berstatus
  placeholder tanah, bukan pH air terkalibrasi.
- **Profil FPS perangkat fisik belum dijalankan.** Audit WCAG 2.2 AA untuk SPA
  `web/` dijalankan 21 September 2026 dengan rasio kontras terukur pada render
  nyata di viewport 1440x1024, beserta perbaikannya
  ([laporan](backend/web/tests/WCAG_AUDIT_2026-09-21.md)).
  Uji screen reader, reflow 400%, jarak teks, kriteria AAA, dan penyapuan kontras
  khusus layout mobile belum dilakukan.
- Kontrak menyebut MySQL/MariaDB, kode memakai SQLite. Perbedaan ini diajukan
  lewat Change Request, bukan ditutupi.

## Isi repo

| Jalur | Isi |
| --- | --- |
| `frontend/` | Frontend Next.js 16 App Router: 10 rute, BFF ke backend PHP, design system |
| `backend/server/` | REST API PHP 8 tanpa dependency, SQLite, 104 test |
| `backend/web/` | Dokumen root kompatibilitas untuk SPA lama yang ikut disajikan backend |
| `backend/deploy/` | Dockerfile Apache dan mod_php untuk Railway |
| `01_AquaSmart/01_Aplikasi-Web/firmware/` | Sketsa ESP32 |
| `01_AquaSmart/01_Aplikasi-Web/docs/` | Catatan perhitungan dan rujukan SKPL |

Folder runtime dipisah: `frontend/` untuk Next.js dan `backend/` untuk PHP,
database, serta konfigurasi Docker/Railway. Firmware dan dokumen akademik tetap
berada di `01_AquaSmart/`.

## Deployment aktif

| Bagian | Tautan | Diperiksa |
| --- | --- | --- |
| Frontend Next.js | https://frontend-kappa-steel-78.vercel.app | 1 Oktober 2026, HTTP 200; BFF `/api/health` HTTP 200 |
| Backend PHP (REST) | https://projectbasedlearning-production.up.railway.app | 1 Oktober 2026, `/api/health` dan `/api/rules` HTTP 200 |

Frontend dan backend memakai source terbaru. `AQUASMART_API_URL` sudah ditambahkan
ke environment Production, Preview, dan Development di Vercel.

Frontend berjalan di Vercel, backend di Railway. URL per-deployment Vercel berada
di balik Deployment Protection; yang di atas adalah URL produksi yang terbuka.

`GET /api/rules` adalah satu-satunya endpoint yang memasang
`Access-Control-Allow-Origin: *`. Endpoint lain tidak memasang header itu;
endpoint yang memakai cookie sesi tidak boleh dipanggil lintas origin.

## Gerbang kualitas kode

`.github/workflows/ci.yml` menjalankan lint Biome, pemeriksaan tipe, test, dan
build untuk `frontend/` pada setiap push dan pull request ke branch `main` dan
`publish`. Job SonarQube selalu berjalan, tetapi langkah pemindaiannya hanya aktif
kalau secret `SONAR_TOKEN` sudah dipasang; tanpa itu langkahnya dilewati dengan
pesan, bukan gagal.

Gerbang yang benar-benar punya bukti adalah CI GitHub Actions. Per 21 September
2026 CI sudah tujuh kali dijalankan dan seluruhnya hijau, terakhir pada commit
`4519b91`. Tangkapan layar di bawah diambil saat baru lima kali berjalan:

![Daftar lima jalannya CI di GitHub Actions, semuanya berstatus sukses](01_AquaSmart/01_Aplikasi-Web/docs/gambar/ci-quality-gate-daftar.png)

Konfigurasi pemindaian ada di `sonar-project.properties`. **Pemindaian SonarQube
Cloud belum pernah dijalankan pada repo ini**, jadi status Quality Gate SonarQube
belum punya bukti dan tidak diklaim lulus. Tangkapan layar di atas adalah gerbang
CI, bukan Quality Gate SonarQube; keduanya tidak boleh ditukar saat dibaca.

## Menjalankan secara lokal

Untuk konfigurasi **satu kolam dengan akun admin dan user**, ikuti
[Panduan satu kolam](PANDUAN_SATU_KOLAM.md). Panduan memuat perintah PowerShell
frontend/backend, lokasi kredensial persisten dan koneksi ESP32 melalui LAN.

Butuh PHP 8.2 atau lebih baru dan Python 3.11. Dari `backend/`:

```bash
python server/run_local.py
```

Aplikasi terbuka di `http://127.0.0.1:8080`. Kredensial runtime, seed, dan kunci
per-perangkat dijelaskan di `PANDUAN_SATU_KOLAM.md`.

## Gerbang verifikasi

Dari `backend/`:

```bash
python server/tests/run_verified_suite.py
```

Lulus berarti keluaran JSON-nya memuat `"passed": true` dengan `failures`,
`errors`, dan `skipped` bernilai nol, serta `tests_run` sama dengan
`planned_tests`. Runner ini juga menjalankan `php -l` pada seluruh berkas PHP.

Frontend Next.js diperiksa dari `frontend/`. Build membutuhkan alamat backend di
`AQUASMART_API_URL`:

```bash
npm install && AQUASMART_API_URL=http://127.0.0.1:8080 npm run build
```

## Kesesuaian kontrak dan SKPL

| Dokumen | Isi |
| --- | --- |
| [Ceklist kesesuaian](01_AquaSmart/01_Aplikasi-Web/docs/CEKLIST_KESESUAIAN_KONTRAK_SKPL.md) | D-01 sampai D-05, FR1 sampai FR24, dan NFR1 sampai NFR15 dipetakan ke status dan bukti di kode |
| [Change Request CR-001](01_AquaSmart/01_Aplikasi-Web/docs/CR-001_Basis_Data_SQLite.md) | Basis data deployment v1 memakai SQLite, diajukan ke sponsor dan menunggu keputusan |
| `01_AquaSmart/01_Aplikasi-Web/docs/Laporan_Kesesuaian_Kontrak_dan_SKPL_AquaSmart.docx` | Kedua dokumen di atas dalam satu berkas siap kumpul |

Hasil penilaian 21 September 2026 pada commit `5c3ba6e`: dari 44 butir, 8
terpenuhi, 33 terpenuhi sebagian, 3 tidak dapat diverifikasi, dan tidak ada yang
berstatus tidak terpenuhi. Butir yang tidak dapat diverifikasi adalah D-04
prototipe hardware-edge, NFR2 uptime, dan NFR3 akurasi sensor; ketiganya
memerlukan perangkat fisik atau jendela pengamatan yang tidak ada di repositori.

## Dokumen

Jalur di bagian ini relatif terhadap `01_AquaSmart/01_Aplikasi-Web/`.
`DESIGN.md` adalah catatan keputusan desain yang mengikat, bukan draft.
`backend/server/API.md` adalah sumber kebenaran kontrak API. `REVIEW_REPORT.md` adalah
satu-satunya sumber status yang berlaku; bagian teratasnya memuat hasil gerbang
terbaru. `CHECKPOINT.md` adalah catatan titik stabil dan langkah lanjut sampai
16 September 2026, bukan status terkini.

## Catatan publikasi

Repo ini adalah bagian deliverable dari ruang kerja yang lebih besar. Materi
kursus pihak ketiga, modul praktikum milik kampus, dan dokumen yang memuat data
pribadi orang lain tidak disertakan.
