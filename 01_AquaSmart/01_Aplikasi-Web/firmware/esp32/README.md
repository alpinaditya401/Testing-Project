# ESP32 AquaSmart: source prepared / PARTIAL

Target: **DOIT ESP32 DEVKIT V1, ESP-WROOM-32, 30 pin, Micro-USB**. Ini firmware terpisah dari sketch Wokwi historis. Tidak menyalin mapping pin relay/pH pada sketch lama.

Pada 15 September 2026, Arduino CLI tidak ditemukan di PATH dan Win32_SerialPort menghasilkan daftar kosong tanpa error. Evidence: `../../hardware/environment-check.json`. **Belum compile, belum upload, belum tersambung WiFi, belum telemetry/ACK/aktuasi fisik.** Keberadaan source bukan evidence runtime.

Pada 26 September 2026, versi dengan TDS, ultrasonik dan LCD lolos compile dengan arduino-cli 1.5.1, core esp32 3.0.7, board DOIT ESP32 DEVKIT V1, `--warnings all` tanpa warning dari sketch: 1.088.089 byte (83%) program, 48.568 byte RAM global. Library: ArduinoJson 7.4.3, OneWire 2.3.8, DallasTemperature 4.0.6, ESP32Servo 3.2.1, LiquidCrystal I2C 1.1.2. **Versi ini belum di-upload; WiFi, telemetri fisik dan tampilan LCD belum terbukti.**

Pada 28 September 2026 sketsa yang sama dikompilasi ulang di repo ini dengan `config.example.h` sebagai `config.local.h` (semua flag sensor dan aktuator false), toolchain dan library sama: lolos, 1.083.729 byte (82%) program, 48.528 byte RAM global, tanpa warning dari sketch. Warning yang muncul berasal dari library OneWire, ESP32Servo dan LiquidCrystal I2C. Konfigurasi 26 September menyalakan TDS, ultrasonik dan LCD, sedangkan kompilasi ini memakai flag false, jadi kedua angka ukuran tidak untuk dibandingkan langsung. **Tetap belum di-upload.**

## Toolchain

Pasang Arduino IDE 2 dari [Arduino](https://www.arduino.cc/en/software). Tambahkan board-manager URL resmi `https://espressif.github.io/arduino-esp32/package_esp32_index.json`, kemudian pilih esp32 by Espressif Systems **3.0.7**. Baseline ini memakai API watchdog ESP-IDF 5; bukan sketch untuk core 2.x. Pilih board **DOIT ESP32 DEVKIT V1**, fallback **ESP32 Dev Module** bila board yang pertama tidak tersedia, lalu verifikasi parameter flash board aktual.

Versi dependency yang ditargetkan (kombinasi belum dikompilasi di komputer ini):

| Library | Versi |
|---|---|
| [OneWire](https://github.com/PaulStoffregen/OneWire/tree/v2.3.8) | 2.3.8 |
| [DallasTemperature](https://github.com/milesburton/Arduino-Temperature-Control-Library/releases/tag/v4.0.6) | 4.0.6 |
| [ESP32Servo](https://github.com/madhephaestus/ESP32Servo/tree/3.0.5) | 3.0.5 |
| [ArduinoJson](https://github.com/bblanchon/ArduinoJson/tree/v7.2.1) | 7.2.1 |
| WiFi, HTTPClient, WiFiClientSecure, Preferences, watchdog | Bawaan core esp32 3.0.7 |

Salin template dengan PowerShell dari root aplikasi; perintah menolak menimpa konfigurasi yang sudah ada:

```powershell
$localConfig = 'firmware/esp32/aquasmart_esp32/config.local.h'
if (Test-Path -LiteralPath $localConfig) { throw 'Konfigurasi sudah ada; edit secara lokal.' }
Copy-Item -LiteralPath 'firmware/esp32/config.example.h' -Destination $localConfig
```

Ganti SSID/password/device ID/key/API_BASE/ROOT_CA hanya dalam `config.local.h`. Key diterbitkan lewat UI perangkat atau `POST /api/devices/{id}/key` dengan session admin dan CSRF. `.gitignore` disediakan tanpa menginisialisasi Git; saat membuat ZIP secara manual **kecualikan config.local.h**, database, backup, private key Caddy dan binary hasil build. Binary juga dapat mengandung credential. Jangan membagikan foto konfigurasi atau Serial Monitor yang berisi credential.

Jika Arduino CLI kemudian tersedia, perintah persiapan/compile berikut **belum dijalankan**:

```powershell
arduino-cli core update-index --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core install esp32:esp32@3.0.7 --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli lib install 'OneWire@2.3.8' 'DallasTemperature@4.0.6' 'ESP32Servo@3.0.5' 'ArduinoJson@7.2.1'
arduino-cli board list
arduino-cli compile --fqbn esp32:esp32:esp32doit-devkit-v1 --warnings all firmware/esp32/aquasmart_esp32
```

IDE: buka `aquasmart_esp32/aquasmart_esp32.ino`, pilih Verify dahulu. Simpan log compile beserta versi library. Setelah COM/board dan kesiapan wiring dipastikan, pilih port aktual di IDE lalu Upload. Tidak ada port COM yang diasumsikan dalam panduan. Jika hanya power LED menyala, cek kabel **data** Micro-USB dan driver USB serial di Device Manager. EN mereset; BOOT dipakai sesuai prosedur upload board. Tidak ada upload otomatis pada pekerjaan ini.

## Kontrak dan pembatasan

- DS18B20 memakai conversion asynchronous 12-bit, dibaca setelah 800 ms; sensor tidak dikenal/disconnected dikirim sebagai null. Sensor baru diaktifkan setelah wiring dikonfirmasi.
- TDS (`TDS_WIRING_CONFIRMED`, `PIN_TDS` default GPIO35): median sembilan sampel seperti kanal ADC lain; firmware hanya mengirim `tds_adc`/`tds_mv`. Server menghitung `tds_ppm_estimate` dengan kurva DFRobot SEN0244 pada asumsi 25°C, **belum terkalibrasi**; LCD memakai rumus yang sama. Default pH tanah pindah ke GPIO32 karena GPIO35 dipakai TDS; `static_assert` menolak pin analog ganda atau pin di luar ADC1.
- Ultrasonik (`ULTRASONIC_WIRING_CONFIRMED`, TRIG GPIO27, ECHO GPIO25): satu pantulan tiap 200 ms, timeout 30 ms, jarak = median bila minimal tiga dari lima pantulan terbaca. Dikirim `water_distance_cm` dan `tank_height_cm`; server menghitung persentase level. `TANK_HEIGHT_CM` adalah jarak muka sensor ke dasar tandon. HC-SR04 butuh VCC 5 V (pin VIN); keluaran ECHO 5 V harus lewat pembagi tegangan sebelum GPIO25 karena pin ESP32 hanya tahan 3,3 V.
- LCD I2C 16x2 (`ENABLE_LCD`, `LCD_I2C_ADDRESS` default 0x27, SDA GPIO21, SCL GPIO22): tiap 3 detik bergantian antara halaman sensor dan halaman jaringan (IP, WiFi, NTP, hasil kirim terakhir). Sensor, LCD dan Serial tetap jalan tanpa WiFi.
- Tanpa feeder/relay aktif, firmware tidak polling command. Core 3.0.7 sudah menyalakan task watchdog 5 detik sehingga `esp_task_wdt_init` gagal; firmware memakai `esp_task_wdt_reconfigure` ke 15 detik (belum diuji fisik).
- ADC1 GPIO34 turbidity dan GPIO35 pH tanah memakai median sembilan sampel. `analogRead` dan `analogReadMilliVolts` adalah dua konversi terpisah; tidak diklaim satu sampel identik. Tegangan pH yang dilaporkan adalah di ADC, tanpa mengarang rasio conditioning.
- Divider turbidity tetap 10k/15k (0.6); reconstructed mV = ADC mV / 0.6. Mapping 0–100% hanyalah pemetaan tegangan terbalik 0–5V; **bukan NTU**. `calibrated=false` dan `ph_sensor=soil_placeholder` wajib. Nilai mentah disimpan pada `device_telemetry`, tidak masuk kolom pH air/NTU historis.
- Semua flag sensor/aktuator default false. **PLACEHOLDER SENSOR TANAH, BUKAN pH AIR TERKALIBRASI**. Cek `hardware/WIRING.md` sebelum menyalakan flag.
- `POST /api/devices/{id}/telemetry`; key header `X-Device-Key`; timestamp UTC setelah NTP, provenance device, simulation false, source_session per boot. Payload yang belum diterima disimpan di RAM untuk retry timestamp identik. Hilang daya dapat kehilangan sampel RAM; belum ada buffer telemetry persisten.
- `GET /api/device/devices/{id}/commands`; hanya antrean hardware, bukan simulator. POST ACK ke `.../commands/{command_id}/ack`. Scheduler dan tombol control existing masih simulator. Queue hardware hanya dapat dibuat melalui endpoint admin `hardware-commands` ketika environment server `AQUASMART_HARDWARE_ENABLED=1`.
- Feeder hanya berjalan jika flag true, ID/device/value/duration/expiry valid. Durasi firmware default maksimum 10 detik (API maksimum 30). Tidak ada request jaringan selama gerakan feeder; servo kembali tutup sebelum ACK. Sudut tutup/buka harus dikalibrasi mekanis tanpa linkage dahulu.
- Relay hanya aktif jika kedua flag enable/compatibility true. GPIO23 hanya untuk pengganti 5V dengan trigger 3.3V terkonfirmasi. ON dibatasi lease lokal 30 detik lalu OFF; ACK succeeded berarti GPIO diperintahkan, **bukan bukti pompa bergerak**. Jangan gunakan lease ini untuk kontrol aerasi kontinu atau beban AC produksi.
- Boot/reconnect/disconnect mengembalikan output aman. Relay memerlukan resistor pull sesuai polaritas pada hardware untuk keadaan aman sebelum setup/ketika reset; firmware saja tidak menjamin keadaan pin saat boot. Watchdog 15 detik dan restart setelah lima menit offline adalah recovery sederhana, belum diuji fisik.
- Satu command diproses per loop transport. Sebelum aktuasi, NVS menyimpan ID dan default hasil failed. Reset saat command berjalan menutup output dan mengirim failed; delapan ID terakhir disimpan untuk mencegah replay. Pending ACK dicoba ulang; ACK identik idempotent. Gagal NVS menonaktifkan operasi. Menghapus NVS saat ada command aktif dilarang.
- Retry exponential 1–60 detik + jitter, timeout koneksi/read 2 detik dan TLS handshake 3 detik; respons maksimum 8 KiB. Timeout terminal dapat dilaporkan; expiry server menghasilkan timeout juga. ACK 409 dihentikan sebagai konflik terminal tanpa aktuasi ulang. Catat kegagalan dari audit server.

## HTTP LAN dan TLS

Fase 1: `API_BASE=http://<IPv4-private-komputer>:8080`, `ALLOW_PRIVATE_LAN_HTTP=true`. Firmware menolak host HTTP di luar rentang 10/8, 172.16/12, 192.168/16; gunakan IP literal. Key dikirim tanpa enkripsi sehingga fase ini hanya untuk diagnosis singkat pada LAN privat terpercaya. SSID ESP32 harus 2.4 GHz dan dapat menjangkau komputer; hindari guest/client isolation.

Fase 2: `API_BASE=https://<nama-atau-IP-sertifikat>:8443`, `ALLOW_PRIVATE_LAN_HTTP=false`. Jalankan Caddy sesuai `../../LOCAL_GUIDE.md`, lalu salin **public root certificate** CA lokal ke ROOT_CA sebagai PEM. Nama/IP URL harus cocok SAN sertifikat dan resolvable oleh ESP32. Waktu NTP harus benar. Jangan memasukkan private CA key ke firmware.

`DEVELOPMENT_INSECURE_TLS=false` adalah default. Mengaktifkannya menjalankan `setInsecure()` dan mencetak peringatan; tidak memverifikasi identitas server, tidak boleh dijadikan evidence NFR05. Hindari fallback ini; pasang root CA yang tepat. Local CA yang benar-benar diuji hanya **PARTIAL** untuk NFR05, bukan TLS publik VERIFIED.

## Urutan evidence

Catat secara terpisah: source/docs → compile log → COM/flash log → WiFi/IP → telemetry fisik tersimpan → command delivered → ACK → pengamatan servo/relay → kalibrasi dengan referensi. Saat ini hanya source/docs dan tes API menggunakan fixture yang tersedia. Jangan menaikkan FR01 atau FR07–09 berdasarkan fixture tersebut.
