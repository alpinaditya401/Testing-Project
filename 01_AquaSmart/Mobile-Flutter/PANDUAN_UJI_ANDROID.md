# Panduan uji aplikasi AquaSmart di HP Android

Tujuan: membuktikan aplikasi Flutter berjalan di HP sungguhan, lalu mencatat hasilnya
sebagai bukti (perangkat, versi Android, tanggal, hasil, keterbatasan). Hasil uji emulator
atau test otomatis tidak menggantikan uji ini.

## 1. Ambil APK

**Cara A: dari GitHub Actions (tanpa memasang apa pun).**

1. Buka tab **Actions** di repositori `alpinaditya401/Testing-Project`, pilih run **CI**
   terbaru yang hijau.
2. Gulir ke bagian **Artifacts**, klik **aquasmart-mobile-debug-apk** (harus login GitHub).
3. Ekstrak ZIP yang terunduh; isinya `app-debug.apk`.

Artefak terhapus otomatis 14 hari setelah dibuat. Bila sudah tidak ada, jalankan ulang
workflow CI (tombol **Run workflow**) untuk membuat APK baru.

**Cara B: build sendiri.** Pasang Flutter 3.47 dan Android Studio (beserta Android SDK), lalu
dari folder `01_AquaSmart/Mobile-Flutter`:

```bash
flutter pub get
flutter build apk --release
```

APK ada di `build/app/outputs/flutter-apk/app-release.apk`. Build rilis ini masih ditandatangani
kunci debug; cukup untuk uji, belum untuk Play Store.

## 2. Pasang di HP

1. Kirim berkas APK ke HP (kabel USB, Google Drive, atau kirim ke diri sendiri lewat WhatsApp).
2. Buka berkas itu dari aplikasi File/Downloads. Android akan meminta izin
   **Instal aplikasi tidak dikenal** untuk aplikasi yang membuka berkas; izinkan.
   Letaknya biasanya di Setelan → Aplikasi → Akses khusus → Instal aplikasi tidak dikenal.
3. Bila Google Play Protect memperingatkan, pilih **Tetap instal**. Peringatan ini muncul karena
   APK tidak berasal dari Play Store.
4. Buka aplikasi **AquaSmart**.

Aplikasi butuh Android 7.0 atau lebih baru (batas minimum Flutter).

## 3. Login

Server bawaan adalah backend di Railway. Pakai akun yang sama dengan aplikasi web. Untuk server
lain, buka **Alamat server** di layar login. Android menolak alamat `http://` biasa ke internet;
pakai `https://`.

## 4. Daftar uji

Isi kolom Hasil dengan Lulus/Gagal dan tulis catatan bila gagal (tangkapan layar sangat membantu).

| No | Skenario | Langkah | Hasil yang diharapkan | Hasil |
| --- | --- | --- | --- | --- |
| 1 | Login salah | Isi kata sandi yang salah | Pesan "Kredensial tidak valid." tanpa detail lain | |
| 2 | Login benar | Isi akun benar | Masuk ke Ringkasan | |
| 3 | Nilai sensor | Bandingkan pH, suhu, kekeruhan dengan dashboard web | Nilai sama; status Normal / Di luar ambang benar | |
| 4 | Asal data | Lihat label di atas kartu sensor | "Data contoh" / "Simulasi" untuk data non-sensor | |
| 5 | Ganti perangkat | Pilih perangkat lain di atas layar | Nilai dan status ikut berganti | |
| 6 | Riwayat | Buka tab Riwayat | Grafik tiga parameter dengan pita hijau ambang aman | |
| 7 | Peringatan | Buka tab Peringatan, tandai satu ditangani (akun admin) | Label "Sudah ditangani"; jumlah di ikon berkurang | |
| 8 | Kontrol | Ubah aerator di tab Kontrol | Muncul konfirmasi; pesan menyebut belum ada bukti aktuasi fisik | |
| 9 | Akun viewer | Login dengan akun viewer, buka Kontrol | Tombol tidak aktif; teks "Akun viewer hanya memiliki akses baca." | |
| 10 | Jadwal pakan | Tambah jadwal lalu hapus (admin) | Jadwal muncul lalu hilang; web menampilkan hal yang sama | |
| 11 | Rekomendasi | Lihat kartu Rekomendasi di Ringkasan | Kondisi, alasan, versi model; atau pesan layanan AI belum aktif | |
| 12 | Tanpa internet | Nyalakan mode pesawat, tarik layar untuk memuat ulang | Pesan "Server AquaSmart tidak dapat dihubungi." tanpa keluar paksa | |
| 13 | Sesi habis | Logout dari web dengan akun yang sama, lalu muat ulang di HP | Aplikasi kembali ke layar login | |
| 14 | Tampilan | Putar layar; perbesar ukuran huruf di Setelan HP | Tidak ada teks terpotong atau tombol tertutup | |
| 15 | Keluar | Tekan ikon keluar | Konfirmasi, lalu kembali ke layar login | |

## 5. Catatan hasil

| Butir | Isi |
| --- | --- |
| Tanggal uji | |
| Penguji | |
| Merek dan tipe HP | |
| Versi Android | |
| Versi aplikasi | 1.0.0+1 (lihat Setelan → Aplikasi → AquaSmart) |
| Sumber APK | Artefak CI run #... / build sendiri |
| Server | |
| Ringkasan hasil | ... dari 15 lulus |
| Keterbatasan | Kontrol aktuator masih SIMULASI; perangkat ESP32 fisik belum terhubung |

Simpan tabel yang sudah terisi bersama tangkapan layar di folder dokumentasi tim. Jangan
menandai aplikasi "siap pakai" sebelum seluruh skenario di atas lulus di HP nyata.
