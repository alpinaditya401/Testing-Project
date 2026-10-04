# Mobile Flutter: aplikasi AquaSmart

Aplikasi Android native untuk pembudidaya. Memakai REST API backend PHP yang sama
dengan web (`01_Aplikasi-Web/server/API.md`); tidak ada backend kedua.

| Kebutuhan SKPL | Layar |
| --- | --- |
| FR-01, FR-02 Autentikasi dan role | Login; akun viewer hanya membaca |
| FR-06 Dashboard | Ringkasan: pH, suhu, kekeruhan, status ambang, online/offline, asal data, umur data |
| FR-07 Histori | Riwayat: tren 36 pembacaan dengan pita ambang aman, daftar pembacaan |
| FR-09 Peringatan | Peringatan: daftar, filter belum ditangani, tandai ditangani (admin) |
| FR-10, FR-12 Kontrol manual | Kontrol: aerator, mode otomatis, beri pakan berdurasi, dengan konfirmasi |
| FR-11 Jadwal pakan | Jadwal: tambah dan hapus (admin) |
| FR-16, FR-17 Rekomendasi | Kartu rekomendasi Layanan AI di Ringkasan, dengan tombol umpan balik |
| NFR-09, NFR-10 | Tata letak 320 px sampai tablet, target sentuh 48 dp, label semantik |

**Kontrol tetap SIMULASI.** Backend mencatat perintah dan statusnya, tetapi aktuasi
fisik belum terbukti; layar Kontrol menyatakannya dan tidak pernah mengklaim pompa
atau feeder sudah bergerak. Data simulasi dan data contoh diberi label.

## Sesi dan keamanan

Backend memakai cookie `aquasmart_session` dan header `X-CSRF-Token`. `ApiClient`
menangkap cookie dari `Set-Cookie` dan mengirimkannya ulang; token CSRF dari respons
login dikirim pada setiap mutasi. Sesi hanya di memori: menutup aplikasi berarti login
ulang, dan tidak ada kredensial di penyimpanan perangkat. Sesi yang habis di server
mengembalikan pengguna ke layar login.

## Menjalankan

Butuh Flutter 3.47 (Dart 3.13) dan Android SDK.

```bash
flutter pub get
flutter analyze
flutter test
flutter run                                   # perangkat/emulator Android
flutter build apk --release                   # APK di build/app/outputs/flutter-apk/
```

Server bawaan adalah backend produksi di Railway. Untuk server lain:

```bash
flutter run --dart-define=AQUASMART_API_URL=http://10.0.2.2:8080   # emulator ke server lokal
```

Alamat server juga bisa diubah di layar login ("Alamat server"). Android memblokir
HTTP biasa pada build rilis; server non-lokal harus HTTPS.

Uji asap lapisan API terhadap backend sungguhan (server lokal/uji saja, karena
mengubah status aerator dan membuat jadwal sementara):

```bash
dart run tool/smoke_test.dart http://127.0.0.1:8080 <username> <password>
```

## Struktur

```
lib/src/api/    ApiClient (cookie, CSRF, error), model, endpoint  — tanpa Flutter
lib/src/state/  AppState: sesi, perangkat terpilih, ambang
lib/src/ui/     layar dan widget
test/           unit, widget, dan parsing respons PHP asli (frontend/lib/api/fixtures.json)
```

Penyimpangan dari SKPL (PWA/Android WebView menjadi Flutter native) dicatat di
`01_Aplikasi-Web/docs/CR-002_Aplikasi_Mobile_Flutter.md`.
