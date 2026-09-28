# Design system frontend AquaSmart

Palet, skala, dan komponen yang dipakai `frontend/`. Sejak 28 September 2026 tampilannya
mengikuti edisi desain `C:\AquaSmart-Studio`, atas keputusan pemilik proyek. Akibatnya
disengaja: frontend ini tidak lagi berbagi warna dengan SPA lama
(`01_AquaSmart/01_Aplikasi-Web/web/`). SPA tetap memakai token `app.css` dan keputusan di
`01_AquaSmart/01_Aplikasi-Web/DESIGN.md`; tidak ada berkas SPA yang diubah.

Pembacaan desain: ruang kerja budidaya yang tenang dan editorial. Putih hangat, hijau hutan,
dan citra air menghubungkan halaman publik dengan dashboard yang terasa seperti instrumen.
Dial: ENERGY 2 / RHYTHM 3 / MOTION 2.

## 1. Token

Semua warna dideklarasikan di `app/globals.css`. Komponen tidak boleh menulis warna sendiri.

| Token | Nilai | Dipakai untuk |
|---|---|---|
| `ink` | `#193f3a` | Teks utama, judul |
| `deep-current` | `#174c40` | Aksi utama, cincin fokus |
| `muted` | `#566b63` | Teks sekunder, batas kontrol |
| `clear-water-text` | `#24624e` | Status aman, garis grafik, `<em>` serif di judul publik |
| `sediment-text` | `#7a4b1a` | Status peringatan, catatan kehati-hatian |
| `alarm-coral-text` | `#9b3b09` | Di luar batas, tombol berbahaya |
| `foam`, `surface` | `#f5f7f3` | Latar dashboard |
| `surface-white` | `#ffffff` | Panel dan kartu |
| `bg-deep` | `#e7eee7` | Hover, skeleton |
| `foam-line` | `#dce5dd` | Pemisah panel saja, tidak pernah satu-satunya batas kontrol |
| `--studio-paper` | `#fafbf6` | Latar beranda, masuk, daftar, jelajah 3D |
| `--studio-soft` | `#edf2e9` | Bidang sekunder: kanvas hero, catatan status, kepala tabel |

Warna dasar `clear-water` `#4c9a8e`, `sediment` `#b9834f`, dan `alarm-coral` `#d2601f`
hanya untuk isian dan ikon, bukan teks. Satu aksen di luar palet, `#ffdc83`, menandai marker
komponen yang sedang dipilih di panggung 3D.

**Tipografi.** Segoe UI tanpa permintaan font web, supaya tampilan sama di komputer
pembudidaya yang tidak tersambung internet. Georgia miring hanya untuk `<em>` di judul
publik. `font-data` bukan lagi monospace, jadi `.font-data` memakai `tabular-nums` agar
angka di kolom tabel tetap sejajar.

**Bentuk.** Radius 8 px untuk kontrol, 16 px untuk panel, 24 px untuk kanvas hero. Bayangan
besar (`--shadow-elevated`) menandai elevasi di empat tempat: papan contoh di beranda, kartu
pembacaan di atas ilustrasi hero, menu dashboard ponsel yang sedang terbuka, dan pemutar 3D
saat diperbesar. Marker komponen 3D memakai bayangan kecil agar terbaca di atas model. Panel
dashboard datar.

**Ikon dan panah.** Ikon lucide-react dipakai karena maknanya cocok dengan labelnya: tetes
air untuk pH, termometer untuk suhu, gelombang untuk kekeruhan, lonceng untuk peringatan,
kalender untuk jadwal pakan, grafik untuk laporan, kompas untuk jelajah 3D. Setiap ikon
didampingi label teks. Panah hanya menunjukkan arah yang sebenarnya: kembali ke halaman
sebelumnya, dan tombol gerak di jelajah 3D.

**Ilustrasi.** `public/pond-studio.png` adalah ilustrasi buatan AI dari edisi Studio. Gambar ini
dipakai karena menggambarkan konteks produk, yaitu kolam budidaya, dan di setiap tempat
tampilnya diberi keterangan sebagai ilustrasi konsep; di beranda ditambah "bukan foto fasilitas
nyata". Logonya adalah logo yang sudah ada di
`01_AquaSmart/01_Aplikasi-Web/web/assets/images/logo.svg`, dan juga dipakai sebagai ikon tab.

**Warna panggung 3D.** Latar, lantai, alas, dan cahaya scene ditulis sebagai nilai heksadesimal
di `components/walkthrough/world.ts`, karena material Three.js tidak membaca variabel CSS.
Latarnya `#e8eee7`, hampir sama dengan `bg-deep` (`#e7eee7`).

**Tanpa dark mode.** Tidak ada `prefers-color-scheme` dan tidak ada varian `.dark`. `DESIGN.md`
menolaknya, dan desain Studio juga terang.

## 2. Skala tipografi

Empat ukuran judul dashboard memakai `clamp()`, jadi langkah mobile ada di dalam skalanya
sendiri, bukan tambalan media query.

| Token | Rentang | Dipakai untuk |
|---|---|---|
| `--text-page` | 1,75rem sampai 2,5rem | Judul halaman, satu per halaman |
| `--text-section` | 1,375rem sampai 1,625rem | Judul bagian besar |
| `--text-panel` | 1,125rem sampai 1,25rem | Judul panel di dalam halaman |
| `--text-sub` | 1,0625rem sampai 1,125rem | Judul kartu dan sub-bagian |

Halaman editorial (beranda, masuk, daftar, jelajah 3D) memakai ukuran piksel sendiri di
`app/globals.css` dan `app/jelajah/walkthrough.css`, dengan langkah di 1000 px, 700 px, dan
370 px. Di seluruh frontend tidak ada teks di bawah 12 px.

## 3. Lapisan komponen

`components/ui/styles.ts` hanya berisi tampilan. Semua varian lewat CVA.

| Varian | Pilihan | Catatan |
|---|---|---|
| `heading` | `level`: page, section, panel, sub; `tone`: deep, ink, warning, danger | |
| `button` | `tone`: primary, secondary, danger; `size`: md, compact | Keduanya `min-h-11` (44px). `compact` hanya memangkas padding horizontal |
| `control` | `font`: body, data | Input, select, dan textarea. Batas pakai `muted`, bukan `foam-line` |
| `panel` | `tone`: plain, notice | `notice` dipakai pemberitahuan SIMULASI |
| `statusText` | `tone`: neutral, ok, warning, danger, idle | Satu sumber warna status |
| `inlineLink` | tanpa varian | Tautan setinggi 44px yang berdiri sendiri di dalam blok |
| `brandLink` | tanpa varian | Wordmark di header ponsel dashboard, setinggi 44px |
| `sentenceLink` | tanpa varian | Tautan di dalam kalimat berjalan, lihat catatan target di bawah |

Lapisan Studio berupa kelas `studio-*` dan kelas halaman di `app/globals.css`, ditambah
komponen di `components/studio/` (`Brand`, `AuthFrame`, `WaterChart`) dan
`components/walkthrough/`. Nama "studio" merujuk asal desainnya, bukan edisi terpisah.
`TableRegion` membungkus tabel lebar supaya yang menggulir tabelnya, bukan halaman.

**Catatan target sentuh.** Semua kontrol dan tautan mandiri setinggi minimal 44px, termasuk
tautan "Unduh panduan wiring" di jelajah 3D. Pengecualian yang disengaja: tautan di dalam
kalimat berjalan, yaitu "Buat akun di sini" dan "Masuk di sini". WCAG 2.2 SC 2.5.8
membebaskan target yang ukurannya dibatasi tinggi baris teks di sekitarnya. Checkbox "Animasi
renang lele" berukuran 19px, tetapi berada di dalam label setinggi 44px yang ikut
mencentangnya.

## 4. Aksesibilitas terpisah dari tampilan

`components/ui/a11y.ts` tidak memuat satu pun nama kelas. Isinya `hintId`, `errorId`, dan
`fieldProps(id, { hint, error })` yang mengembalikan `id`, `aria-invalid`, dan
`aria-describedby` sekaligus. Kontrol formulir dashboard memakainya, jadi perubahan tampilan
tidak bisa diam-diam menjatuhkan atribut aria.

`hooks/use-confirm-focus.ts` memindahkan fokus ke `fieldset` berlabel saat langkah konfirmasi
menggantikan tombol pemicunya, supaya pertanyaannya dibacakan dan Enter berikutnya tidak
menembakkan aksi merusak.

Struktur halaman memakai elemen HTML5 semantik. ARIA hanya dipakai saat HTML tidak punya
padanannya, misalnya `aria-current`, `aria-pressed` pada tab scene dan marker 3D, `role="status"`
pada pesan pemuatan, dan `role="alert"` pada pesan galat. `<main>` di beranda, dashboard, dan
jelajah 3D membawa `tabIndex={-1}`, jadi skip link di halaman itu benar-benar memindahkan
fokus.

Pemilih perangkat di layar di bawah 640px adalah formulir GET (`next/form`) dengan tombol
"Tampilkan". Mengganti pilihan saja tidak berpindah halaman, jadi menelusuri opsi dengan tombol
panah tidak memuat ulang halaman di setiap langkah. HTML dari server sudah berisi
`<form action>` beserta `select name="device"`, jadi pemilih tetap bekerja tanpa JavaScript.
Di layar yang lebih lebar pemilihnya tetap berupa tautan.

## 5. Dial yang dideklarasikan

- **ENERGY 2.** Judul editorial besar dengan satu kata serif miring di halaman publik;
  dashboard tetap ringkas.
- **RHYTHM 3.** Komposisi bagian beranda berbeda satu sama lain: hero dua kolom, papan contoh
  selebar halaman, daftar kemampuan asimetris, catatan status di bidang lembut.
- **MOTION 2.** 180 ms umpan balik tekan dan hover, 550 ms satu kali animasi masuk konten
  publik. Tidak ada loop dekoratif. Yang berputar hanya indikator pemuatan (skeleton dan
  pemuat 3D), dan keduanya berhenti saat `prefers-reduced-motion: reduce`. Dengan preferensi
  itu, gulir halus menjadi instan dan animasi lele di jelajah 3D mati sejak awal.
- **Aksen tunggal.** `deep-current` memegang aksi utama. Warna status hanya muncul saat
  menyatakan keadaan dan selalu didampingi kata. Garis tepi kartu sensor mengulang kata
  statusnya: hijau di dalam batas, koral di luar batas, dan tanpa garis selama belum ada
  bacaan yang bisa dinilai.

## 6. Kontras terukur

Diukur dengan `contrast-check.py` dari skill antislop-human pada 28 September 2026.

| Teks | Latar | Rasio |
|---|---|---|
| ink | surface-white | 11,58:1 |
| ink | foam | 10,74:1 |
| ink | studio-paper | 11,14:1 |
| deep-current | surface-white | 9,79:1 |
| deep-current | studio-soft (nav aktif) | 8,62:1 |
| muted | surface-white | 5,71:1 |
| muted | studio-paper | 5,49:1 |
| muted | studio-soft | 5,02:1 |
| muted | bg-deep | 4,83:1 |
| clear-water-text | surface-white | 7,16:1 |
| clear-water-text | studio-soft | 6,30:1 |
| sediment-text | surface-white | 7,37:1 |
| alarm-coral-text | surface-white | 6,95:1 |
| putih | deep-current (tombol) | 9,79:1 |
| foam | deep-current (`button()`) | 9,09:1 |
| putih | alarm-coral-text (tombol bahaya) | 6,95:1 |
| ink | `#ffdc83` (marker terpilih) | 8,72:1 |
| putih | lapisan gelap jelajah di atas piksel poster putih | 5,07:1 |

Non-teks (ambang 3:1): batas kontrol `muted` pada putih 5,71:1; cincin fokus `deep-current`
pada foam 9,09:1 dan pada studio-paper 9,42:1; cincin fokus kanvas 3D `deep-current` pada lantai
scene 7,46:1; cincin fokus marker `ink` pada panggung 3D 9,82:1. `foam-line` pada putih hanya
1,29:1, karena itu dipakai sebagai pemisah panel saja.

## 7. Hasil pengukuran tata letak

Diukur pada 28 September 2026 terhadap build produksi dengan backend lokal ter-seed (data
SIMULASI dan SEED). Sebelas rute (beranda, masuk, daftar, jelajah 3D, dan tujuh halaman
dashboard), ditambah dua keadaan perangkat di dashboard: tanpa data (`AQS-EMPTY`) dan di luar
batas (`AQS-CRITICAL`). Semuanya pada lima lebar: 320, 375, 768, 1024, dan 1440 px.

| Hasil | Semua rute, semua lebar |
|---|---|
| Overflow horizontal | Tidak ada |
| Teks di bawah 12px | Tidak ada |
| Target di bawah 44px | Nol, kecuali dua tautan dalam kalimat dan checkbox di dalam label 44px |

Ukuran `h1` per lebar (320 / 375 / 768 / 1024 / 1440 px):

| Halaman | Ukuran |
|---|---|
| Beranda | 39 / 40 / 46 / 48,1 / 65 px |
| Dashboard | 28 / 28 / 31,9 / 35,6 / 40 px (Kualitas Air 29 px di lebar 700 px ke bawah) |
| Masuk dan daftar | 34 / 34 / 32 / 32,8 / 44 px |
| Jelajah 3D | 34 / 34 / 32 / 33,8 / 47,5 px |

Pemeriksaan statis yang juga lolos: tidak ada aturan `prefers-color-scheme` maupun kelas
`dark:`, tidak ada emoji, tidak ada warna heksadesimal di berkas `.tsx`, dan tidak ada `100vh`.
Em dash dan en dash tidak ada di teks antarmuka maupun di berkas yang dibawa atau diubah
pekerjaan ini. Dua sisa lama berada di luar cakupannya: satu komentar di
`app/api/[...path]/route.ts`, dan pesan server yang terekam apa adanya di
`lib/api/fixtures.json`.

## 8. Jelajah 3D (`/jelajah`)

Model berasal dari `01_AquaSmart/03_Desain-3D/aquaponik_3scene_20260923/AquaSmart_3Scene.blend`.
SHA256 berkas itu cocok dengan `public/models/provenance.json`
(`c92a4a3b...acbefc1`). Ekspor GLB Draco dibuat oleh skrip di `C:\AquaSmart-Studio\blender-web`,
di luar repo ini. Ukuran: aquaponik 3.147.752 byte, rangkaian 1.186.852 byte, casing 854.400 byte.
Decoder Draco ada di `public/draco/` beserta lisensi Apache 2.0-nya, jadi tidak ada permintaan
ke CDN. Model baru dimuat setelah tombol "Mulai jelajah 3D" ditekan.

Pin di panduan komponen dicocokkan dengan `firmware/esp32/config.example.h` pada 28 September
2026: suhu GPIO4, kekeruhan GPIO34, pH GPIO35 (masih `soil_placeholder`), servo GPIO18, relay
GPIO23. Panduan sambungan adalah dokumentasi rancangan, bukan hasil validasi rangkaian fisik.

Yang sudah diperiksa di browser (Chrome terotomasi, GPU AMD lewat ANGLE D3D11): ketiga scene
termuat; tombol W menggerakkan kamera; titik pandang Depan, Samping, Detail, dan Reset;
jeda menonaktifkan kontrol gerak; perbesar mengunci gulir halaman dan Escape mengembalikan
fokus ke tombolnya; pemilih komponen dan klik marker saling sinkron; panduan wiring terunduh
dengan status 200. Animasi lele: dalam 1,2 detik, 3.911 dari 21.600 piksel di area akuarium
berubah saat animasi aktif, dan 0 piksel saat dimatikan. Di lebar 320px ke-19 marker tampil di
atas HUD dan tidak ada kontrol yang terpotong.

Yang belum diuji: profil FPS (target 30 atau 60 fps di menu kualitas adalah batas atas render
loop, bukan hasil ukur), ponsel fisik, kegagalan GPU yang disengaja, dan pembaca layar.

## 9. Perbedaan dari edisi Studio

Desain Studio dibawa utuh, dengan perbaikan antislop berikut:

- Titik status yang tidak menandai keadaan apa pun dihapus (dua di beranda, satu di toolbar jelajah).
- Panah ↗, tanda tautan luar, dihapus dari tiga tautan internal di beranda.
- Nomor 01 sampai 03 di daftar kemampuan beranda dihapus, karena ketiganya bukan langkah berurutan.
- Teks 9 sampai 11 px dinaikkan menjadi 12 px.
- Label sumbu grafik dipindah dari teks SVG ke HTML. Teks SVG ikut mengecil bersama viewBox
  sampai sekitar 5 px di ponsel.
- Breadcrumb dashboard mengikuti halaman aktif. Di Studio tertulis "Pemantauan" di ketujuh halaman.
- Garis tepi kartu sensor mengikuti status, termasuk tanpa garis saat belum ada bacaan.
- Pemilih perangkat di ponsel memakai formulir GET dengan tombol "Tampilkan" (lihat bagian 4).
- Tiga kontras non-teks di jelajah 3D dibetulkan: cincin fokus kanvas (2,53:1), cincin fokus
  marker (2,08:1), dan batas select komponen (2,44:1).
- HUD jelajah di ponsel dibuat satu baris, karena susunan kolom Studio lebih tinggi dari pita
  120 px yang dikosongkan `world.ts` untuk marker, sehingga menutupi marker.
- Label khusus Studio ("AquaSmart Studio", "Prototipe lokal") diganti, termasuk di judul
  panduan wiring yang bisa diunduh. Kalimat "firmware ESP32 belum diuji di perangkat fisik" dari
  halaman lama dikembalikan ke catatan status.
- Ikon tab memakai logo yang sudah ada (`app/icon.svg`), sehingga permintaan `/favicon.ico`
  tidak lagi menghasilkan 404 di konsol.

Yang tidak dibawa: panel telemetri ESP32 (TDS dan ketinggian air) beserta perubahan skema dan
fixture-nya, karena backend repo ini belum mengirim field tersebut; dan dokumen QA Studio,
yang digantikan pengukuran di dokumen ini.
