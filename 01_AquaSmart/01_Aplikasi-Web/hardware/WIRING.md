# AquaSmart: wiring rancangan, belum diuji fisik

Identifikasi berikut berdasarkan uraian foto dari pengguna, bukan inspeksi atau pengukuran langsung. Cocokkan silkscreen, datasheet, warna kabel dan polaritas komponen aktual sebelum menyambungkan. Status integrasi hardware **PARTIAL**.

| Komponen | Identifikasi / batasan |
|---|---|
| ESP32 | DOIT ESP32 DevKit V1, ESP-WROOM-32, **30 pin (15 per sisi), Micro-USB**, bukan 38 pin atau USB-C. EN reset; BOOT mode flash. |
| Probe suhu | Diduga DS18B20 waterproof tiga kabel; identitas dan urutan kabel belum diverifikasi. Jangan menentukan polaritas hanya dari warna. |
| pH | **PLACEHOLDER SENSOR TANAH, BUKAN pH AIR TERKALIBRASI**. Tegangan catu dan output belum diukur; jangan celupkan bagian elektronik yang tidak kedap air. |
| Turbidity | Water Turbidity Sensor / Water Clarity Detector kit. Mirip Gravity SEN0189; model belum terkonfirmasi. Spesifikasi SEN0189 hanya referensi, bukan identitas pasti. |
| Feeder | SG90; arah mekanis dan sudut buka/tutup harus diatur saat linkage dilepas. |
| Relay tersedia | `1Ch Relay 24V H/L`: tidak cocok langsung dengan adaptor 12V atau GPIO ESP32. Jangan hubungkan ke GPIO/catu rancangan ini. |
| Adaptor | 12V 2A; tidak boleh langsung ke ESP32, servo, atau sensor 5V. |
| Modul biru | Kemungkinan DHT11; tidak digunakan. Sensor udara ini bukan sensor suhu air. |
| TDS | Modul TDS analog. Firmware dan server memakai kurva DFRobot SEN0244 sebagai acuan; model modul belum terkonfirmasi dan nilainya **belum terkalibrasi**. |
| Ultrasonik | Sensor jarak ultrasonik untuk level air. Bila HC-SR04: catu 5V dan keluaran ECHO 5V. |
| LCD | LCD 16x2 dengan backpack I2C; alamat umum 0x27 atau 0x3F. |

## Pin mapping

| Komponen | Pin ESP32 | Pin komponen | Tegangan | Catatan |
|---|---|---|---|---|
| DS18B20 terkonfirmasi | GPIO4 | DATA | 3.3V logic | Pull-up 4.7 kΩ DATA ke 3.3V; VDD 3.3V dan GND bersama; bukan parasite power. |
| Turbidity analog | GPIO34 (ADC1) | AO melalui divider | Maksimum 3.3V pada ADC | R atas 10 kΩ AO→ADC, R bawah 15 kΩ ADC→GND. Vadc = 0.6 × Vout. 5V menjadi 3V; ukur sebelum memasang GPIO. |
| pH tanah analog | GPIO32 (ADC1) | AO setelah conditioning bila perlu | Maksimum 3.3V pada ADC | Default sejak 26 September 2026; GPIO35 kini dipakai TDS. Catu sesuai datasheet aktual. Output harus diukur dahulu di seluruh rentang; jika lebih dari 3.3V, tentukan divider/conditioning terlebih dahulu. |
| TDS analog | GPIO35 (ADC1) | AO | Maksimum 3.3V pada ADC | Firmware hanya mengirim `tds_adc`/`tds_mv`; ppm dihitung server. Ukur AO di seluruh rentang sebelum memasang GPIO. |
| Ultrasonik | TRIG GPIO27, ECHO GPIO25 | TRIG / ECHO | HC-SR04: VCC 5V dari pin VIN | ECHO 5V **wajib** lewat pembagi tegangan hingga <=3.3V sebelum GPIO25. `TANK_HEIGHT_CM` diisi jarak muka sensor ke dasar tandon. |
| LCD I2C 16x2 | SDA GPIO21, SCL GPIO22 | SDA / SCL | Catu sesuai modul | Alamat `LCD_I2C_ADDRESS`, default 0x27. Cek tegangan pull-up SDA/SCL di backpack; pin ESP32 bekerja pada 3.3V. |
| SG90 | GPIO18 | Signal | 3.3V PWM | Catu servo dari 5V regulated eksternal **minimum 2A** untuk satu servo; ground bersama. Bukan dari pin daya ESP32. |
| Relay pengganti | GPIO23, hanya rencana | IN | Trigger harus mendukung 3.3V | Relay **5V optoisolated, eksplisit kompatibel trigger 3.3V**, VCC/JD-VCC mengikuti datasheet dan skema isolasinya. GPIO belum boleh dihubungkan sebelum modul terverifikasi. |
| ESP32 | Micro-USB | USB data/power | 5V USB | Awali dengan USB komputer; kabel bisa charge-only meskipun board menyala. |
| Semua sinyal nonisolasi | GND | GND | 0V | Common ground sensor/servo/ESP32. Jangan menjembatani isolasi relay secara sembarang. |

GPIO32, GPIO34, dan GPIO35 adalah ADC1; hindari ADC2 ketika WiFi aktif. Attenuation ADC bukan proteksi terhadap overvoltage. GPIO34/35 input-only; tidak menyediakan pull-up internal yang dapat menggantikan resistor eksternal.

```text
Komputer -- kabel Micro-USB data --> ESP32 DOIT 30 pin

ESP32 3V3 ----+---------------------- DS18B20 VDD
             +--[4.7k]--+----------- DS18B20 DATA
ESP32 GPIO4 -----------+
ESP32 GND -------------------------- DS18B20 GND

5V regulated ----------------------- Turbidity VCC (setelah model dicek)
Turbidity AO --[10k]--+-------------- GPIO34
                     |
                    [15k]
                     |
GND bersama ---------+-------------- Turbidity GND

pH AO -- pengukuran/conditioning ---- GPIO32 (<=3.3V)
pH GND ----------------------------- GND bersama
pH VCC ----------------------------- catu sesuai datasheet aktual

TDS AO ----------------------------- GPIO35 (<=3.3V)
TDS GND ---------------------------- GND bersama

ESP32 VIN (5V) --------------------- Ultrasonik VCC
ESP32 GPIO27 ----------------------- Ultrasonik TRIG
Ultrasonik ECHO -- pembagi tegangan -- GPIO25 (<=3.3V)
GND bersama ------------------------ Ultrasonik GND

ESP32 GPIO21 ----------------------- LCD SDA
ESP32 GPIO22 ----------------------- LCD SCL

5V regulated >=2A ------------------- SG90 V+
ESP32 GPIO18 ----------------------- SG90 signal
GND bersama ------------------------ SG90 GND

Relay 24V: TIDAK DIHUBUNGKAN
GPIO23: dicadangkan untuk relay pengganti yang telah diverifikasi
Sisi beban AC: tidak termasuk diagram uji awal ini
```

Jika memakai adaptor 12V, gunakan buck 12V→5V dengan rating output minimum 2A dan margin arus yang cukup untuk beban gabungan. Atur dan ukur output tanpa beban, lalu uji dengan beban rendah sebelum menghubungkan elektronik. Untuk tahap awal, gunakan USB untuk ESP32 dan catu 5V servo terpisah. Kapasitor elektrolit 470–1000 µF di dekat catu servo dapat membantu transien; cek polaritas/rating, dan tidak menggantikan catu yang memadai. Jangan menyatukan rail 5V USB dengan output buck tanpa rancangan power-path yang benar.

## Pengukuran dan power-on bertahap

1. Semua catu mati: cocokkan board 30 pin, pin label, identitas probe, dan rating catu. Periksa short 3V3/5V/GND. Lepaskan servo linkage, relay dan seluruh beban AC.
2. ESP32 saja melalui Micro-USB data. Catat port COM dan identitas board. Tidak adanya COM belum membuktikan board rusak: cek kabel data, driver USB serial, port dan Device Manager.
3. Sensor saja dengan catu yang telah diverifikasi. Ukur AO turbidity terhadap GND dalam kondisi terang/keruh; catat nilai minimum/maksimum. Ukur titik divider: harus tetap <=3.3V. Jangan menyambung AO langsung ke GPIO34. Ukur juga AO TDS dan ECHO ultrasonik setelah pembagi tegangan: keduanya harus tetap <=3.3V.
4. Ukur AO pH tanah terhadap GND dalam rentang pemakaian dan transien power-on. **Hasil saat ini: BELUM DIUKUR.** Jangan aktifkan pembacaan/pasang GPIO32 sebelum tegangan aman. Catat catu, nilai resistor conditioning dan rasio aktual; kontrak awal hanya melaporkan tegangan pada ADC, bukan pH air.
5. DS18B20 setelah kabel terkonfirmasi, gunakan pull-up 4.7k. Bandingkan suhu dengan termometer referensi; status disconnected/unverified harus menghasilkan null, bukan angka palsu.
6. Flash hanya setelah board/COM dipastikan dan operator siap. Boot dengan fitur aktuator OFF. Buktikan WiFi, timestamp UTC, telemetry mentah serta key perangkat dahulu.
7. Servo tanpa linkage dan tanpa beban AC: pasang catu 5V >=2A, ground bersama, verifikasi sudut tutup/buka. Baru aktifkan flag feeder untuk satu command pendek. Amati gerak, penutupan, ACK dan log sebagai bukti terpisah.
8. Relay pengganti diuji dengan beban DC rendah terlebih dahulu sesudah datasheet trigger, polaritas aktif, VCC/JD-VCC, dan isolasi disetujui. Default boot/reconnect harus OFF. Relay 24V yang tersedia tetap tidak digunakan.

Jangan merakit atau menyentuh sisi mains saat hidup. Jangan menjalankan pengujian pompa AC otomatis. Gunakan enclosure, terminal tertutup, fuse/proteksi sesuai beban dan bantuan orang kompeten. Tegangan/daya pompa belum diketahui; integrasi AC/aerator tetap **PARTIAL**.

## Bukti yang masih diperlukan

- Foto label/datasheet dan urutan kabel DS18B20, pH, turbidity, serta relay pengganti.
- Multimeter: catu aktual, AO turbidity sebelum/sesudah divider, AO pH (belum ada hasil).
- Catu servo 5V >=2A, resistor 4.7k/10k/15k, buck bila memakai 12V, kabel Micro-USB data; kapasitor opsional.
- Kalibrasi turbidity dengan larutan referensi sebelum mengklaim NTU. ADC, reconstructed voltage, dan mapping persentase sementara bukan NTU.
- Foto label modul TDS, ultrasonik, dan LCD; hasil ukur ECHO setelah pembagi tegangan.
- Kalibrasi TDS dengan larutan referensi sebelum mengklaim ppm.
- Sensor pH air yang sesuai beserta conditioning dan buffer kalibrasi diperlukan untuk requirement akurasi pH air.

Referensi teknis: [Espressif ADC1/ADC2](https://docs.espressif.com/projects/esp-idf/en/v4.2/esp32/api-reference/peripherals/adc.html), [Arduino ESP32 ADC](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html), [DFRobot SEN0189 sebagai pembanding saja](https://www.dfrobot.com/product-1394.html).
