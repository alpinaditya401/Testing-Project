# AquaSmart frontend

Next.js App Router di depan backend PHP AquaSmart (`01_AquaSmart/01_Aplikasi-Web/server/`).
Backend tidak diubah; frontend ini hanya klien.

## Menjalankan

```bash
npm install
AQUASMART_API_URL=http://127.0.0.1:8080 npm run dev
```

`AQUASMART_API_URL` wajib ada, juga saat `next build`. Tanpa variabel ini build
sengaja gagal, supaya deploy tidak diam-diam mengarah ke host yang salah.

| Perintah | Isi |
|---|---|
| `npm run lint` | Biome |
| `npm test` | Skema Zod diuji terhadap respons asli PHP di `lib/api/fixtures.json` |
| `python scripts/capture-api-fixtures.py` | Rekam ulang fixture dari backend lokal yang di-seed |

## Alur data

- Browser hanya bicara ke `/api/*` di origin yang sama. `app/api/[...path]/route.ts`
  meneruskan ke PHP beserta cookie sesi dan header CSRF.
- Server Component membaca PHP langsung lewat `lib/api/server.ts` dan hanya
  meneruskan cookie `aquasmart_session`.
- Skema respons diturunkan dari `server/API.md` dan diperiksa terhadap respons nyata.

## Batasan yang diketahui

- **Rate limit per IP klien perlu `AQUASMART_PROXY_SECRET`.** `RateLimiter.php`
  membuat bucket per IP. Di belakang BFF, `REMOTE_ADDR` di PHP selalu IP server
  Next.js, jadi tanpa pengaturan ini batas login (30 per menit) dan register (10 per
  menit) berlaku untuk semua pengguna bersama. Untuk memakai IP klien, set nilai
  acak yang panjang dan sama sebagai `AQUASMART_PROXY_SECRET` di environment PHP dan
  di environment Next.js, misalnya `openssl rand -hex 32`. BFF lalu mengirim header
  `X-AquaSmart-Proxy-Secret` dan `X-AquaSmart-Client-IP`, dengan IP diambil dari
  `x-real-ip`, atau entri pertama `x-forwarded-for`. PHP hanya memakai IP itu bila
  rahasianya cocok; selain itu kembali ke `REMOTE_ADDR`.

  Peringatan: `x-real-ip` dan `x-forwarded-for` hanya bisa dipercaya bila Next.js
  berjalan di belakang proxy yang menimpa header itu, misalnya Vercel. Next.js sendiri
  hanya mengisi `x-forwarded-for` bila header itu belum ada. Jadi saat `next start`
  diakses langsung, klien bisa mengirim IP palsu dan mendapat bucket baru di setiap
  permintaan. Di deployment seperti itu, jangan set `AQUASMART_PROXY_SECRET`.
- **Kontrol aerator dan feeder adalah SIMULASI.** Perintah tercatat di server, tetapi
  aktuasi fisik lewat ESP32 belum diverifikasi.
