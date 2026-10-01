# Audit WCAG 2.2 AA, frontend AquaSmart

Tanggal: 2026-09-21. Lingkup: `01_AquaSmart/01_Aplikasi-Web/web/`.
Dasar: FIX_PLAN.md Fase 3. Menggantikan kalimat "Audit WCAG menyeluruh belum
dilakukan" di `DESIGN.md`.

Setiap angka di dokumen ini hasil ukur pada render nyata. Tidak ada angka
perkiraan. Bagian "Belum diukur" di bawah menyebut apa yang memang belum
dikerjakan.

## Cara mengukur

Browser Edge headless dikemudikan lewat CDP dengan harness repo sendiri
(`web/tests/review_runtime.mjs`), server PHP asli, database sementara, akun
seed. Viewport utama 1440x1024.

- **Kontras teks.** Untuk tiap elemen yang punya text node sendiri: tumpukan
  cat di belakang titik teks diambil dengan `elementsFromPoint`, lalu
  dikomposit dari bawah ke atas termasuk alpha dan `opacity` warisan. Rasio
  memakai rumus luminansi relatif WCAG 2.x. Elemen yang tertutup elemen lain
  atau di luar viewport dicatat sebagai terlewat, bukan dianggap lulus.
- **Latar gradien.** Kompositing tidak bisa membaca gradien. Untuk teks di atas
  `.auth-visual`, elemen teksnya disembunyikan, wilayah persis kotak teksnya
  difoto lewat `Page.captureScreenshot` pada koordinat halaman, PNG-nya didekode,
  lalu dipakai piksel paling terang dan paling gelap di wilayah itu. Yang
  dilaporkan adalah yang terburuk dari keduanya.
- **Kontras non-teks.** Border dan fill tiap kontrol diukur terhadap latar
  hasil komposit yang sama.
- **Keyboard.** Tab sungguhan lewat `Input.dispatchKeyEvent` dengan
  `windowsVirtualKeyCode: 9`. Titik awal navigasi fokus direset ke awal dokumen
  tiap route, `scroll-behavior` dipaksa `auto` selama pengukuran supaya posisi
  kotak fokus terbaca setelah scroll selesai.
- **Nama aksesibel.** Rantai HTML-AAM: `aria-label`, `aria-labelledby`,
  `label[for]`, label pembungkus, teks isi, `title`, `alt`, `svg title`.

Artefak mentah ada di `05_Desain-Figma/review-hermes/`: `a11y-before`,
`a11y-pixel-before`, `a11y-states-before` (sebelum perbaikan), `a11y-after2`,
`a11y-pixel-after`, `a11y-states-after` (sesudah).

Cakupan: 214 sampel teks di 8 route plus modal demo dan drawer terbuka,
188 catatan nama aksesibel, 35 kontrol form.

## Temuan dan perbaikan

### 1.4.3 Kontras minimum (teks)

| Elemen | Sebelum | Sesudah | Perbaikan |
|---|---|---|---|
| `.tube-label-ntu strong` ("42 NTU" di hero) | 2,46:1 | **5,56:1** | `--sediment` jadi `--sediment-text` |
| `.readout-gauge.warning .gauge-status` | 3,12:1 | **7,03:1** | `--sediment` jadi `--sediment-text` |
| `.gauge-status` (status aman) | 3,17:1 | **7,52:1** | `--clear-water` jadi `--clear-water-text` |
| `.input-shell input::placeholder` | 3,74:1 | **4,89:1** | `--placeholder` `#718487` jadi `#5F7174` |
| `.footer-grid a.brand small` | 3,84:1 | **6,60:1** | brand footer memakai `--foam` penuh |
| `.auth-visual-content p` (di atas gradien) | 4,33:1 | **4,75:1** | alpha `.76` jadi `.82` |
| `.auth-stat span` (di atas gradien) | 4,44:1 | **4,93:1** | alpha `.68` jadi `.74` |

Ambang: 4,5:1 untuk teks normal. Semua baris di atas teks normal.

`.footer-grid a.brand small` turun ke 3,84:1 karena dua alpha bertumpuk:
warna link footer `rgba(241,245,243,.68)` dikali `opacity: .65` milik
`.brand small`, jadi efektif 0,442. Di navbar elemen yang sama terukur 6,60:1
karena di sana `currentColor` adalah `--foam` penuh.

### 1.4.11 Kontras non-teks (batas kontrol)

| Elemen | Sebelum | Sesudah | Perbaikan |
|---|---|---|---|
| Border 35 kontrol form (`.input-shell`, `.form-control`, `.select-shell`, `.time-row input`) | 1,54:1 (1,47:1 di `--foam`) | **3,33:1** (3,17:1 di `--foam`) | `--field-border` `#BFCFC9` jadi `#7F8C89` |
| `.demo-pause` (tombol ikon saja) | 1,20:1 | **3,17:1** | `--foam-line` jadi `--field-border` |
| `.nav-link.active` (penanda state) | 1,83:1 | **3,41:1** | alpha border `.2` jadi `.4` |
| `.switch` track mati | 1,88:1 | **3,33:1** | ikut `--field-border` |
| `.demo-visual .muted-line` | 2,22:1 | **3,19:1** | `--demo-line-muted` `#91A5A0` jadi `#768885` |
| `#close-sidebar`, `.sidebar .btn` | 2,36:1 | **3,41:1** | alpha border `.28` jadi `.4` |
| `.public-nav .btn` | 2,85:1 | **3,41:1** | alpha border `.34` jadi `.4` |

Ambang: 3:1.

Knob switch terhadap track terukur 3,55:1 sebelum maupun sesudah, jadi state
hidup/mati memang sudah terbaca. Yang gagal adalah batas komponennya, dan itu
yang diperbaiki.

### 4.1.2 Nama, peran, nilai

Link navigasi aktif hanya ditandai warna, tanpa atribut. Sudah ditambah
`aria-current="page"` di `app.js`. Tidak ada perubahan visual dari ini.

## Yang sudah lulus, dengan angkanya

| Yang diperiksa | Hasil ukur |
|---|---|
| Focus ring `2px var(--clear-water)` di `--foam` | 3,02:1 |
| Focus ring di `--surface-white` | 3,17:1 |
| Focus ring di `--deep-current` | 4,54:1 |
| Teks sekunder `--muted` di `--foam` / `--surface-white` | 5,47:1 / 5,74:1 |
| `td` di `--surface-white` | 8,35:1 |
| `th` di `--surface-white` | 5,74:1 |
| `--clear-water-text` / `--sediment-text` / `--alarm-coral-text` di `--surface-white` | 7,52:1 / 7,03:1 / 6,63:1 |
| Toast default / success / warning | 13,71:1 / 6,91:1 / 6,32:1 |
| `.alert-banner` / `.warning-box` / error inline | 6,35:1 / 6,65:1 / 6,15:1 |
| `.badge` dan `.provenance-badge` (teks `--ink` di `--foam`) | 14,33:1 |
| Tombol bahaya dan `.nav-count` (`--text-on-alarm` di `--alarm-coral-text`) | 6,95:1 |

Focus ring paling ketat 3,02:1, yaitu di atas `--foam`. Lulus, tapi marginnya
tipis: mengubah `--clear-water` atau `--foam` bisa menjatuhkannya.

Input di dalam `.input-shell` memang memakai `outline: 0`. Penandanya ada di
`.input-shell:focus-within` (outline 1px `--clear-water` plus border ikut
berubah warna), dan itu terverifikasi benar-benar terpasang saat input difokus.
Jadi 2.4.7 terpenuhi meski elemen inputnya sendiri tidak punya outline.

### Urutan fokus dan keyboard

Delapan route ditelusuri dengan Tab sungguhan. Urutan fokus sama dengan urutan
DOM di semua route. Tidak ada `tabindex` positif. Skip link selalu perhentian
pertama. Alur login, dashboard, kontrol (switch dan tombol pakan), serta export
bisa diselesaikan tanpa mouse.

**2.4.11 Fokus tidak tertutup:** nol kontrol yang difokus tertutup elemen lain
di route mana pun.

Catatan: pada `input[type=date]` dan `input[type=time]`, Tab berikutnya masuk ke
segmen internal widget bawaan Chrome. `document.activeElement` tetap elemen
host sementara outline dilaporkan `none`. Ini perilaku widget native, bukan
cacat CSS. Sudah dicek manual, bukan diasumsikan.

### Target sentuh

Nol kontrol di bawah 44x44 px pada 1440x1024 di kedelapan route. `review_routes.mjs`
memeriksa ulang di tujuh ukuran layar (320, 390, 756, 1024, 1440, dan dua
orientasi landscape) dan lulus. SC 2.5.8 AA hanya menuntut 24x24, jadi klaim
44px di `DESIGN.md` terverifikasi ulang dan masih berlaku.

### Nama aksesibel

188 catatan kontrol diperiksa. **Nol nama hilang.** Semua kontrol ikon saja
punya `aria-label` eksplisit ("Buka menu", "Tutup menu", "Tampilkan password",
"Hapus jadwal 07:00", "Aktifkan Aerator", dan seterusnya); semua input punya
`label[for]`.

## Yang sengaja tidak diubah

- **`.video-proof`, border 1,26:1.** Kartu link yang sudah memuat teks dan
  thumbnail. 1.4.11 tidak menuntut batas terlihat kalau komponennya sudah
  teridentifikasi dari isinya. Dicatat, tidak diubah.
- **`--foam-line` (`#D8E2DE`, 1,20:1 di atas `--foam`).** Dipakai sebagai garis
  pemisah dekoratif panel dan kartu di puluhan tempat. Garis dekoratif dikecualikan
  dari 1.4.11. Menggelapkannya akan mengubah tampilan seluruh aplikasi, dan itu
  perubahan desain, bukan perbaikan aksesibilitas.
- **Tema terang tetap.** Tidak ada `prefers-color-scheme` yang ditambahkan.
  Keputusan `DESIGN.md` soal penolakan dark mode tidak disentuh.

## Belum diukur

Batas audit ini, supaya tidak dibaca lebih jauh dari buktinya:

- Uji dengan screen reader sungguhan (NVDA, JAWS, VoiceOver) belum dijalankan.
- SC 1.4.10 (reflow 400%) dan 1.4.12 (jarak teks) belum diukur di pass ini.
- Kriteria AAA tidak dinilai.
- Pengukuran kontras dilakukan pada 1440x1024. Warna tidak berubah menurut
  breakpoint, tapi pasangan teks/latar yang hanya muncul di layout mobile belum
  disapu terpisah.
- State yang tidak muncul pada data seed (banner peringatan aktif, daftar jadwal
  kosong, toast warning dan default) dihitung dari nilai CSS-nya, bukan dari
  render langsung. Nilainya ada di tabel "sudah lulus" dan semuanya jauh di atas
  ambang.
