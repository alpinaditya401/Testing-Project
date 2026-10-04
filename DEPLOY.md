# Deploy AquaSmart

Tiga layanan produksi. Semuanya di-build dari repositori `alpinaditya401/Testing-Project`
branch `main`.

| Layanan | Hosting | Folder | Status per 4 Oktober 2026 |
| --- | --- | --- | --- |
| Backend PHP (REST API) | Railway | `01_AquaSmart/01_Aplikasi-Web` | Tayang, tetapi dari repo lama `Project_Based_Learning` (21 September); belum memuat perbaikan |
| Layanan AI Flask | Railway | `01_AquaSmart/Backend-Flask` | Belum ada; image diuji CI (build, bootstrap, predict) |
| Frontend Next.js | Vercel | `frontend` | Tayang dengan build lama |

Aplikasi Flutter memanggil backend PHP, jadi ikut mendapat fitur baru begitu backend diperbarui.

## 0. Siapkan rahasia

Buat tiga nilai acak dan simpan di pengelola kata sandi. Jangan di-commit.

```bash
openssl rand -hex 32   # AI_SERVICE_KEY: backend PHP -> layanan AI
openssl rand -hex 32   # AI_ADMIN_KEY: mengelola model (latih/aktivasi/rollback)
openssl rand -hex 32   # PROXY_SECRET: BFF Vercel -> backend PHP (rate limit per pengguna)
```

## 1. Layanan AI Flask (Railway, layanan baru)

1. Buka proyek Railway yang berisi backend PHP. **New → GitHub Repo →
   `alpinaditya401/Testing-Project`**.
2. **Settings → Source**: branch `main`, **Root Directory** `01_AquaSmart/Backend-Flask`.
   Railway membaca `railway.json` di folder itu (Dockerfile, healthcheck `/api/health`).
3. **Settings → Volumes**: tambahkan volume dengan mount path `/data`. Registry model dan
   artefaknya disimpan di sini; tanpa volume, model hilang setiap deploy.
4. **Variables**:

   | Nama | Nilai |
   | --- | --- |
   | `AQUASMART_AI_SERVICE_KEY` | AI_SERVICE_KEY |
   | `AQUASMART_AI_ADMIN_KEY` | AI_ADMIN_KEY |
   | `AQUASMART_AI_BOOTSTRAP` | `1` |

5. Deploy. Saat pertama mulai, layanan melatih model dari dataset bawaan dan mengaktifkannya
   bila lolos kriteria (log: `bootstrap: ... dilatih dan diaktifkan`). Restart berikutnya
   melewati langkah ini.
6. **Jaringan.** Pilihan aman: jangan buat domain publik. Backend PHP memanggil layanan ini lewat
   private networking: `http://<nama-layanan>.railway.internal:<PORT>` (nama layanan terlihat di
   Settings, PORT dari variabel `PORT` Railway; bisa juga tetapkan `PORT=8000`). Buat domain
   publik hanya bila perlu memanggil endpoint admin dari luar; semua endpoint selain
   `/api/health` tetap butuh kunci.

## 2. Backend PHP (Railway, layanan yang sudah ada)

1. **Settings → Source**: ganti repo menjadi `alpinaditya401/Testing-Project`, branch `main`,
   **Root Directory** `01_AquaSmart/01_Aplikasi-Web`. Volume `/data` dan variabel lama
   (`AQUASMART_SEED_*`, dsb.) **jangan diubah**: database dan akun tetap.
2. **Variables**, tambahkan:

   | Nama | Nilai |
   | --- | --- |
   | `AQUASMART_AI_URL` | URL layanan AI dari langkah 1.6, tanpa garis miring akhir |
   | `AQUASMART_AI_KEY` | AI_SERVICE_KEY (sama dengan langkah 1) |
   | `AQUASMART_PROXY_SECRET` | PROXY_SECRET |

3. Deploy. Migrasi tabel baru (`ai_recommendations`, dsb.) berjalan otomatis saat koneksi
   pertama; data lama tidak diseed ulang.

## 3. Frontend Next.js (Vercel)

1. **Project → Settings → Git**: hubungkan ke `alpinaditya401/Testing-Project`, branch produksi
   `main`, **Root Directory** `frontend`.
2. **Environment Variables**: `AQUASMART_API_URL` = URL backend PHP (tetap
   `https://projectbasedlearning-production.up.railway.app` bila domainnya tidak berubah),
   dan `AQUASMART_PROXY_SECRET` = PROXY_SECRET.
3. **Deployments → Redeploy**. README mencatat Vercel masih menayangkan kerangka lama; langkah ini
   memperbaikinya.

## 4. Periksa

```bash
B=https://projectbasedlearning-production.up.railway.app
curl -s $B/api/health                                   # {"status":"ok","service":"aquasmart-api"}
curl -s -o /dev/null -w '%{http_code}\n' $B/api/devices/AQS-KOLAM-01/recommendation   # 401 = endpoint baru ada
```

Lalu login di web dan aplikasi Flutter: kartu **Rekomendasi** di Ringkasan harus menampilkan
kondisi dan versi model. Bila menampilkan "Layanan AI belum diaktifkan", periksa
`AQUASMART_AI_URL`/`AQUASMART_AI_KEY` di backend PHP.

## Mengelola model setelah deploy

Butuh akses ke layanan AI (domain publik sementara, atau `railway run`/shell Railway):

```bash
AI=https://<domain-layanan-ai>; K=<AI_ADMIN_KEY>
curl -s $AI/api/models -H "X-AquaSmart-AI-Key: $K"                                         # registry
curl -s -X POST $AI/api/models/train -H "X-AquaSmart-AI-Key: $K" -H 'Content-Type: application/json' -d '{}'
curl -s -X POST $AI/api/models/<versi>/activate -H "X-AquaSmart-AI-Key: $K"                 # ditolak 409 bila tidak lolos kriteria
curl -s -X POST $AI/api/models/rollback -H "X-AquaSmart-AI-Key: $K"
```

## Catatan

- Deploy ini belum pernah dijalankan dari lingkungan pengembangan karena jaringannya tidak
  menjangkau Railway/Vercel. Image layanan AI dibangun dan dijalankan di CI GitHub setiap push;
  pengaturan dashboard di atas tetap perlu dicek saat pertama kali dipakai.
- Jangan menaruh kunci di frontend atau aplikasi Flutter. Hanya backend PHP yang memegang
  `AQUASMART_AI_KEY`.
