# AquaSmart: satu kolam, admin dan user

## Struktur yang dipakai

| Folder | Fungsi |
| --- | --- |
| `frontend/` | Frontend Next.js; dashboard, login, kontrol, laporan dan pengaturan |
| `frontend/app/api/[...path]/route.ts` | Proxy BFF dari browser ke API PHP, meneruskan cookie sesi dan CSRF |
| `backend/server/` | Backend PHP dan database SQLite |
| `backend/web/` | Dokumen root kompatibilitas untuk SPA lama |
| `01_AquaSmart/01_Aplikasi-Web/firmware/esp32/` | Firmware ESP32 dan template konfigurasi |
| `01_AquaSmart/01_Aplikasi-Web/hardware/` | Wiring dan catatan verifikasi perangkat |
| `frontend-bff/` | Salinan contoh BFF; bukan server terpisah yang perlu dijalankan |

Folder `02_Praktikum-Frontend`, `03_RajaDewa-Unity`, `04_LittleLemon`, `SmartFarming`,
dan arsip berisi project atau bahan lain; tidak diperlukan untuk menjalankan AquaSmart ini.

## 1. Backend, terminal PowerShell pertama

PHP di komputer ini ditemukan di `C:\xampp\php\php.exe`. Runner memerlukan PHP dengan
PDO SQLite dan Python. Periksa dengan `php -m` jika backend gagal membuat database.

```powershell
cd C:\Testing-Project\backend
python server/run_local.py --single-pond --database server/data/single-pond/aquasmart.sqlite --host 0.0.0.0
```

API berada di `http://127.0.0.1:8080/api/health`. Membuka port 8080 di browser menampilkan
SPA lama. Dashboard Next.js berada di port 3000.

Saat database belum ada, setup membuat tepat satu perangkat `AQS-KOLAM-01`, nama
Kolam Utama, tanpa pembacaan sensor contoh dan dengan status offline. Setup membuat:

| Username | Peran | Hak akses |
| --- | --- | --- |
| `admin` | admin | Pemantauan, kontrol simulasi, jadwal, ambang, pengaturan perangkat dan anggota |
| `user` | viewer di API | Membaca kolam yang sama; tidak dapat mengirim kontrol atau mengubah pengaturan |

Password acak berbeda dicetak pada setup pertama dan disimpan bersama kunci ESP32 di
`backend/server/data/single-pond/credentials.local.txt`.
File ini diabaikan Git. Jangan dibagikan sebagai bagian source project.
Untuk membacanya kembali:

```powershell
Get-Content server/data/single-pond/credentials.local.txt
```

Selalu gunakan `--database` dengan jalur yang sama agar akun, kunci perangkat dan
riwayat tetap ada setelah restart. Database lama tidak ditimpa atau dibersihkan oleh setup.
`--single-pond` hanya memilih setup untuk database baru; tidak mengubah database demo
yang sudah ada. Jika memilih database lama, akun di dalamnya tetap berlaku.

## 2. Frontend, terminal PowerShell kedua

```powershell
cd C:\Testing-Project\frontend
npm install
$env:AQUASMART_API_URL = 'http://127.0.0.1:8080'
npm run dev
```

Buka `http://localhost:3000/login`, lalu login menggunakan salah satu akun di atas.
Backend harus tetap berjalan. Untuk build produksi lokal, setelah env disetel:

```powershell
npm run build
npm start
```

Browser mengakses `/api/*` pada frontend. BFF meneruskan permintaan ke PHP dengan
cookie `aquasmart_session` dan header `X-CSRF-Token`. Tidak perlu menjalankan
`frontend-bff` atau menambahkan CORS untuk koneksi browser ini.

## 3. ESP32 ke backend

Alur: sensor → ESP32 → WiFi → API PHP port 8080 → SQLite → frontend Next.js.
ESP32 memakai kunci perangkat, bukan username atau password akun dashboard.

1. Sambungkan komputer dan ESP32 ke LAN yang sama. ESP32 klasik memakai WiFi
   2,4 GHz; hindari jaringan tamu dengan client isolation.
2. Jalankan backend dengan `--host 0.0.0.0`, kemudian jalankan `ipconfig` dan
   catat IPv4 adaptor WiFi komputer, misalnya `192.168.1.10`.
3. Coba buka `http://192.168.1.10:8080/api/health` dari perangkat lain di LAN.
   Bila gagal, cek alamat, jaringan dan izin firewall port 8080 untuk jaringan privat.
4. Salin `..\01_AquaSmart\01_Aplikasi-Web\firmware\esp32\config.example.h` ke
   `..\01_AquaSmart\01_Aplikasi-Web\firmware\esp32\aquasmart_esp32\config.local.h`.
5. Isi SSID, password WiFi, device ID dan key dari file kredensial lokal:

```cpp
constexpr char WIFI_SSID[] = "NAMA_WIFI";
constexpr char WIFI_PASSWORD[] = "PASSWORD_WIFI";
constexpr char DEVICE_ID[] = "AQS-KOLAM-01";
constexpr char DEVICE_KEY[] = "SALIN_DEVICE_KEY_DARI_FILE_KREDENSIAL";
constexpr char API_BASE[] = "http://192.168.1.10:8080";
constexpr bool ALLOW_PRIVATE_LAN_HTTP = true;
constexpr bool DEVELOPMENT_INSECURE_TLS = false;
```

Edit deklarasi yang sudah ada, jangan menambahkan deklarasi ganda. `API_BASE` tidak
memuat `/api` dan tidak diakhiri `/`. Jangan memakai `localhost` atau `127.0.0.1`
di firmware karena itu menunjuk ke ESP32 sendiri.

6. Buka `aquasmart_esp32.ino` di Arduino IDE. Baseline project: board DOIT ESP32
   DEVKIT V1 dan core esp32 3.0.7. Library sesuai README firmware: ArduinoJson,
   OneWire, DallasTemperature, ESP32Servo dan LiquidCrystal I2C.
   Pilih COM aktual, Verify, Upload, lalu Serial Monitor 115200 baud.
7. Aktifkan flag sensor hanya sesudah wiring sesuai
   `..\01_AquaSmart\01_Aplikasi-Web\hardware\WIRING.md`.
   Pin template: DS18B20 GPIO4, turbidity GPIO34, pH tanah GPIO32, TDS GPIO35,
   ultrasonik TRIG GPIO27/ECHO GPIO25, LCD SDA21/SCL22, servo GPIO18, relay GPIO23.
   Sensor yang dipakai saat ini HY-SRF05. ECHO 5 V harus melalui pembagi tegangan
   sebelum masuk ESP32; flag konfigurasi tidak menggantikan pemeriksaan wiring.
8. Firmware mengirim `POST /api/devices/AQS-KOLAM-01/telemetry` dengan header
   `X-Device-Key`. Tunggu WiFi dan sinkronisasi NTP; dashboard memperbarui data
   pada panel sensor setiap 1 detik; status perangkat dan riwayat setiap 30 detik.
   Firmware modular terbaru mengirim sekitar setiap 1 detik setelah upload ulang.
   Respons 401 berarti key/ID tidak cocok; 422 berarti payload
   ditolak. Periksa Serial Monitor dan `server/data/single-pond/php.log`.

HTTP LAN ini untuk diagnosis lokal; kunci dikirim tanpa enkripsi. Untuk pemakaian
HTTPS, isi `ROOT_CA` dengan sertifikat publik CA yang benar dan set
`ALLOW_PRIVATE_LAN_HTTP=false`, mengikuti
`01_AquaSmart/01_Aplikasi-Web/LOCAL_GUIDE.md` dan README firmware.

## Batas kontrol fisik

Tombol kontrol dan scheduler dashboard yang tersedia mengirim ke antrean SIMULASI.
Itu belum menggerakkan relay atau servo ESP32. Firmware mengambil antrean hardware
melalui `GET /api/device/devices/{id}/commands`, lalu mengirim ACK. Endpoint admin
`POST /api/devices/{id}/hardware-commands` memerlukan
`AQUASMART_HARDWARE_ENABLED=1` serta flag aktuator firmware dan wiring yang sesuai.
Pengiriman telemetri dapat digunakan tanpa mengaktifkan aktuator.

Sensor pH tanah adalah placeholder, kekeruhan tegangan bukan NTU terkalibrasi,
dan TDS/level air adalah estimasi. Nilai mentah masuk panel telemetri, bukan
otomatis menggantikan pembacaan pH air dan NTU yang tervalidasi.

Firmware modular yang sedang dipakai di Arduino IDE berada di
`C:\AquaSmart-Studio\01_AquaSmart\01_Aplikasi-Web\firmware\esp32\aquasmart_esp32\`.
Tab `aqs_common.h`, `aqs_sensors.h`, `aqs_network.h`, `aqs_display.h`,
`aqs_actuators.h` dan `config.local.h` disertakan oleh satu sketch
`aquasmart_esp32.ino`; tidak perlu upload setiap tab.

Backend menerima field opsional `turbidity_divider_ratio` bernilai lebih dari 0
sampai 1. Rasio 1.0 mendukung konfigurasi sensor 3,3 V tanpa divider yang dikirim
firmware modular. Firmware lama yang tidak mengirim field tersebut tetap memakai
rasio 0.6. Rekonstruksi tegangan sensor tetap diperiksa; penerimaan payload tidak
membuktikan tegangan fisik atau kalibrasi sensor.

Rujukan instalasi board: [dokumentasi resmi Arduino ESP32](https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html).
Kemampuan WiFi dan batas listrik: [datasheet ESP32](https://documentation.espressif.com/esp32_datasheet_en.html).

## Validitas pembacaan sebelum dipakai memantau kolam

Sensor yang tersambung belum membuktikan adanya air. DS18B20 tetap membaca suhu
udara ketika probe kering; ADC TDS/kekeruhan tetap menghasilkan tegangan. Ultrasonik
mengukur pantulan benda, sehingga posisi sensor dan referensi dasar wadah perlu dipastikan.

Dashboard menampilkan **Belum valid** untuk pembacaan air yang belum terverifikasi.
Bagian **Lihat data mentah untuk pemeriksaan** tetap menyimpan sinyal untuk diagnosis.
Pembacaan yang tidak diperbarui lebih dari 10 detik ditandai **Data sudah lama**.
Polling panel tetap setiap 1 detik; ini interval permintaan, bukan jaminan latensi 1 detik.

Pada firmware modular aktif di `C:\AquaSmart-Studio`, lakukan berurutan:

1. Ukur jarak muka HY-SRF05 ke dasar wadah yang kosong, dalam cm. Isi nilai aktual
   `TANK_HEIGHT_CM`; angka 50 yang sekarang terpasang belum merupakan hasil konfirmasi.
2. Periksa pantulan ke dasar saat kosong dan permukaan saat terisi. Jarak di bawah
   2 cm atau di atas 450 cm ditandai tidak valid. Setelah referensi benar,
   set `WATER_LEVEL_REFERENCE_CONFIRMED = true`.
3. Pastikan posisi probe suhu, TDS, dan kekeruhan terendam ketika ada air,
   kemudian set `WATER_PROBES_IMMERSED = true`. Biarkan false selama uji probe kering.
4. Upload sketch sekali sesudah perubahan firmware/konfigurasi. Semua tab `.h`
   ikut dikompilasi bersama `.ino`.

Kedua flag awalnya false. Payload lama tanpa flag juga diperlakukan false.
Ini konfirmasi pemasangan oleh operator, bukan sensor pendeteksi probe basah.
Jarak mendekati dasar (kedalaman paling banyak 1 cm) ditandai kosong/sangat dangkal,
dan pembacaan kualitas air disembunyikan. Pantulan selain permukaan air masih dapat
menyesatkan ultrasonik; uji pemasangan tetap diperlukan.

Angka TDS utama disembunyikan selama sensor belum terkalibrasi, termasuk saat air
dan posisi probe sudah dikonfirmasi. Statusnya **Belum terkalibrasi**. Saat air belum
terverifikasi atau kosong, angka ppm juga tidak ditampilkan. Bagian diagnosis hanya
menampilkan tegangan TDS, tanpa angka ppm hasil rumus. Firmware aktif menampilkan
status yang sama pada LCD/Serial setelah upload ulang.

Kontrak telemetry saat ini masih mewajibkan `calibrated=false`; tidak ada tombol
atau flag yang bisa membuat sensor otomatis terkalibrasi. Kalibrasi fisik dengan
larutan referensi dan dukungan koefisien pada firmware/API diperlukan sebelum angka
TDS dapat diaktifkan. Rentang pemeriksaan SEN0244 tetap 0–2300 mV/0–1000 ppm.
Kekeruhan mentah tetap bukan NTU.

Rentang TDS: [DFRobot SEN0244](https://wiki.dfrobot.com/sen0244).
Rentang HY-SRF05 2–450 cm dan level sinyal 5 V:
[studi pengujian HY-SRF05, tabel spesifikasi](https://pmc.ncbi.nlm.nih.gov/articles/PMC8879242/).
