# AquaSmart frontend

Next.js App Router di depan backend PHP AquaSmart (`01_AquaSmart/01_Aplikasi-Web/server/`).
Frontend ini hanya klien; validasi dan aturan data tetap di backend.

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
| `npm test` | Skema Zod diuji terhadap respons asli PHP di `lib/api/fixtures.json`, ditambah tes batas gerak jelajah 3D |
| `python scripts/capture-api-fixtures.py` | Rekam ulang fixture dari backend lokal yang di-seed |
| `node scripts/write-wiring-guide.mjs` | Tulis ulang `public/models/panduan-wiring.md` dari data panel komponen jelajah 3D |

## Alur data

- Browser hanya bicara ke `/api/*` di origin yang sama. `app/api/[...path]/route.ts`
  meneruskan ke PHP beserta cookie sesi dan header CSRF.
- Server Component membaca PHP langsung lewat `lib/api/server.ts` dan hanya
  meneruskan cookie `aquasmart_session`.
- Skema respons diturunkan dari `server/API.md` dan diperiksa terhadap respons nyata.

## Desain dan jelajah 3D

Tampilan mengikuti edisi desain `C:\AquaSmart-Studio`; token, dial, kontras terukur, dan
perbedaannya dari Studio ada di `DESIGN_SYSTEM.md`.

`/jelajah` bisa dibuka tanpa login. Model Blender (aquaponik, rangkaian, casing) dimuat dari
`public/models/` setelah tombol "Mulai jelajah 3D" ditekan, dengan decoder Draco lokal di
`public/draco/`. Asal model dan SHA256 berkas Blender sumbernya tercatat di
`public/models/provenance.json`. Skrip ekspornya ada di `C:\AquaSmart-Studio\blender-web`,
di luar repo ini.

## Batasan yang diketahui

- **Rate limit login dan register terbagi.** `RateLimiter.php` membuat bucket per
  `REMOTE_ADDR`. Di belakang BFF, semua permintaan browser tiba dari IP server
  Vercel, sehingga batas login (30 per menit) dan register (10 per menit) berlaku
  untuk semua pengguna bersama, bukan per pengguna. Perbaikannya ada di backend dan
  belum dikerjakan karena backend dibekukan.
- **Kontrol aerator dan feeder adalah SIMULASI.** Perintah tercatat di server, tetapi
  aktuasi fisik lewat ESP32 belum diverifikasi.
- **TDS dan level air adalah estimasi.** Server menghitungnya dari nilai mentah ESP32 (kurva
  DFRobot SEN0244 pada asumsi 25°C, dan jarak ultrasonik terhadap tinggi tandon); keduanya belum
  terkalibrasi dan tidak dipakai menilai batas kualitas air. Status firmware ada di
  `01_AquaSmart/01_Aplikasi-Web/firmware/esp32/README.md`.
- **Jelajah 3D belum diprofil.** Pilihan 30 atau 60 fps adalah batas atas render loop, bukan
  hasil ukur. Ponsel fisik dan kegagalan GPU belum diuji. Panduan wiring adalah dokumentasi
  rancangan, bukan hasil validasi rangkaian fisik.
