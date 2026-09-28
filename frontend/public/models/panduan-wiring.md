# AquaSmart: panduan komponen dan wiring

Acuan: model Blender 23 September 2026, wiring_netlist.json (expanded_nets), hardware/WIRING.md dan firmware/esp32/config.example.h.
Rancangan belum diuji fisik. Nomor marker menunjukkan komponen, bukan urutan kaki board.
Matikan catu sebelum wiring. Cocokkan label pin dan datasheet modul aktual.
Pin firmware per 26 September 2026: suhu GPIO4, turbidity GPIO34, TDS GPIO35, pH tanah GPIO32, ultrasonik GPIO27 (TRIG) dan GPIO25 (ECHO), LCD GPIO21 (SDA) dan GPIO22 (SCL), servo GPIO18, relay GPIO23.
Model masih memakai GPIO35 untuk pH, GPIO32 untuk tombol pakan, GPIO27 untuk float switch, dan GPIO25 untuk LED pompa. Pin itu kini dipakai firmware; ikuti firmware.
Wokwi historis memiliki mapping berbeda: jangan menggunakannya untuk rancangan ini.
Model pH air adalah usulan; firmware masih soil_placeholder. OLED, tombol, LED dan level memerlukan ekstensi firmware.

## ESP32 DOIT 30 pin

Pin firmware per 26 September 2026

Pusat pembacaan sensor dan kontrol feeder/pompa.

- Micro-USB → USB komputer untuk tahap awal
- 3V3 → jalur logika 3,3 V; GND → ground bersama
- GPIO4 suhu · GPIO34 kekeruhan · GPIO35 TDS · GPIO32 pH tanah · GPIO18 servo · GPIO23 relay
- GPIO27 TRIG dan GPIO25 ECHO ultrasonik · GPIO21 SDA dan GPIO22 SCL LCD

Kabel di model mengikuti rancangan 23 September dan belum memuat TDS, ultrasonik, maupun LCD. Cocokkan tulisan GPIO pada board fisik, bukan urutan kaki di model. Jangan masukkan 12 V atau gabungkan 5 V USB dengan output buck.

## Sensor suhu DS18B20

GPIO4 · sesuai firmware

Mengukur suhu air melalui probe waterproof yang sudah dikonfirmasi identitasnya.

- VDD → ESP32 3V3
- GND → GND bersama
- DATA / DQ → GPIO4
- Resistor 4,7 kΩ antara DATA dan 3V3

Konfirmasi urutan kabel probe dari label/datasheet; warna kabel bukan patokan tunggal.

## Probe & board pH

GPIO32 di firmware · model masih GPIO35

Model menampilkan usulan probe pH air dan board pengondisi sinyal.

- Probe → konektor BNC board pH
- AO → GPIO32 (default firmware) hanya setelah tegangan aman ≤3,3 V
- GND → GND bersama
- VCC → catu sesuai modul aktual; 3V3 di model hanya untuk kandidat kompatibel

Sejak 26 September firmware memindahkan pH tanah ke GPIO32 karena GPIO35 dipakai TDS; kabel di model masih ke GPIO35. Firmware masih soil_placeholder, belum pH air terkalibrasi. Sensor tanah yang tersedia tidak otomatis cocok untuk air. Board/BNC tetap kering; verifikasi catu dan conditioning sebelum menyambung AO.

## Sensor kekeruhan

GPIO34 · melalui divider

Membaca sinyal analog kekeruhan; nilai mentah belum merupakan NTU terkalibrasi.

- VCC → 5 V regulated jika modul aktual mendukung
- GND → GND bersama
- AO → resistor 10 kΩ → titik ADC → GPIO34
- Titik ADC → resistor 15 kΩ → GND

Jangan sambungkan AO langsung ke ESP32. Ukur titik ADC dahulu: harus ≤3,3 V; divider rancangan mengubah 5 V menjadi 3 V.

## Divider 10 kΩ / 15 kΩ

Proteksi level sinyal turbidity

Menurunkan tegangan analog sebelum masuk ADC ESP32.

- AO turbidity → 10 kΩ → node ADC
- Node ADC → GPIO34
- Node ADC → 15 kΩ → GND

Vadc = 0,6 × Vout. Pastikan nilai resistor, sambungan ground, dan hasil ukur; attenuation ADC bukan pelindung overvoltage.

## Pull-up 4,7 kΩ

Jalur DATA DS18B20

Menahan jalur data sensor suhu pada level logika tinggi saat idle.

- Satu ujung → 3V3
- Ujung lain → sambungan DATA DS18B20 / GPIO4

Resistor dipasang antara DATA dan 3V3, bukan seri di kabel DATA. Rancangan memakai tiga kabel, bukan parasite power.

## Servo SG90 / feeder

GPIO18 · sesuai firmware

Membuka dan menutup mekanisme pakan.

- Signal → GPIO18
- V+ → catu eksternal 5 V regulated minimum 2 A
- GND → GND catu dan ESP32

Jangan mengambil daya servo dari pin daya ESP32. Uji sudut buka/tutup dengan linkage dilepas dahulu; sisakan margin arus untuk beban lain.

## Buck 12 V → 5 V

Jalur daya DC

Menurunkan catu adaptor untuk servo dan modul yang kompatibel 5 V.

- IN+ → keluaran fuse 12 V
- IN− → negatif adaptor
- OUT+ / 5V → cabang servo, relay pengganti, turbidity
- OUT− / G → ground bersama

Atur dan ukur output 5 V sebelum memasang elektronik. Minimum 2 A untuk servo plus margin beban lain. Jangan satukan output buck dengan rail 5 V USB.

## Input DC & fuse

Konsep 12 V DC

Masukan daya dan proteksi cabang beban.

- Adaptor +12 V → input fuse
- FUSE OUT → buck IN+, relay COM, dan cabang aerator
- Negatif adaptor → ground daya

Rating fuse, kabel, adaptor dan beban harus ditentukan dari komponen aktual. Jalur 12 V tidak masuk ke GPIO, servo, atau sensor 5 V.

## Relay pengganti 5 V

GPIO23 · kompatibilitas belum terverifikasi

Mengendalikan kontak daya pompa konsep DC.

- IN → GPIO23 hanya jika trigger 3,3 V didukung eksplisit
- VCC / JD-VCC / GND → ikuti datasheet modul dan skema isolasinya
- Konsep beban DC: fuse OUT → COM; NO → pompa +

Relay stok 24 V H/L tidak digunakan. Verifikasi polaritas aktif dan kondisi boot OFF. Rute ground pada model bukan bukti isolasi; jangan menjembatani isolasi modul sembarang.

## Pompa sirkulasi

Beban konsep DC 12 V

Mengirim air akuarium menuju grow bed.

- Konsep DC: relay NO → pompa +
- Pompa − → negatif catu DC
- Dioda beban induktif: katoda ke +, anoda ke − jika sesuai jenis beban

Tegangan dan tipe pompa fisik belum terkonfirmasi. Rute ini hanya untuk konsep DC12V; jangan dipakai untuk pompa AC. Rating relay, fuse dan dioda mengikuti beban.

## Terminal aerator

Aerasi kontinu · konsep DC

Memberi suplai ke aerator; pada model terpisah dari relay pompa.

- Konsep DC12V: fuse OUT → aerator +
- Aerator − → negatif catu

Verifikasi rating aerator aktual. GPIO tidak memberi daya langsung. Model tidak mengimplementasikan kontrol aerasi kontinu di firmware.

## Kapasitor reservoir 470 µF

Cabang daya servo

Membantu meredam transien pada suplai servo.

- Kaki + → rail 5 V servo
- Kaki − → GND servo
- Pasang dekat konektor daya servo

Periksa polaritas dan rating tegangan komponen. Kapasitor tidak menggantikan catu yang mampu memasok arus servo.

## OLED SSD1306

Usulan · firmware memakai LCD 16x2

Menampilkan pembacaan/status lokal pada tutup casing.

- SDA → GPIO21
- SCL → GPIO22
- VCC → 3V3 jika modul kompatibel
- GND → GND bersama

Firmware belum mendukung OLED ini; sejak 26 September firmware menggerakkan LCD I²C 16x2 (alamat 0x27) di SDA GPIO21 dan SCL GPIO22. Tulisan pada model adalah data demo, bukan pembacaan sensor.

## Tombol pakan

GPIO32 di model · bentrok dengan pH tanah

Usulan pemicu pemberian pakan manual.

- Satu kontak → GPIO32 (model; kini dipakai pH tanah)
- Kontak pasangan → GND
- Firmware perlu konfigurasi pull-up dan debounce

Sejak 26 September firmware memakai GPIO32 untuk pH tanah, jadi tombol ini perlu pin lain sebelum diimplementasikan. GPIO23 sudah dipakai relay; jangan memakai pin tombol dari Wokwi historis. Pastikan pasangan kontak switch memakai multimeter.

## Tombol pompa

GPIO26 · usulan firmware

Usulan kontrol pompa manual.

- Satu kontak → GPIO26
- Kontak pasangan → GND
- Firmware perlu konfigurasi pull-up dan debounce

Tombol tidak membawa arus pompa. Fungsi manual dan aturan interlock belum diterapkan pada firmware.

## Float switch / level air

GPIO27 di model · bentrok dengan ultrasonik

Usulan deteksi air minimum sebelum pompa diaktifkan.

- Kontak float → GPIO27 (model; kini TRIG ultrasonik)
- Kontak lain → GND
- Usulan mode input: INPUT_PULLUP

Sejak 26 September GPIO27 menjadi keluaran TRIG ultrasonik, yang tidak boleh ditarik ke GND oleh float switch; pilih pin lain. Periksa kondisi kontak pada level tinggi/rendah. Interlock pompa belum diimplementasikan; model visual tidak memberi perlindungan dry-run.

## LED indikator pompa

GPIO25 di model · bentrok dengan ultrasonik

Usulan penanda perintah pompa.

- GPIO25 → resistor 220 Ω → anoda LED (model; kini ECHO ultrasonik)
- Katoda LED → GND

Sejak 26 September firmware memakai GPIO25 sebagai ECHO ultrasonik, jadi LED ini perlu pin lain. Cocokkan polaritas LED dan kebutuhan resistor aktual. LED menyala tidak membuktikan pompa benar-benar mengalir.

## LED indikator feeder

GPIO33 · usulan firmware

Usulan penanda proses pemberian pakan.

- GPIO33 → resistor 220 Ω → anoda LED
- Katoda LED → GND

Jangan pasang LED langsung tanpa resistor. Indikator perlu implementasi firmware.

## Casing kontrol / zona kering

Buka scene Rangkaian untuk wiring

Melindungi dan menempatkan elektronik di samping instalasi.

- Kabel sensor dan aktuator → gland masing-masing
- Buat lengkungan kabel turun sebelum masuk casing
- Lihat scene Rangkaian untuk pin ESP32 dan modul

Model casing dan gland belum diuji kedap air. Board pH, konektor, dan semua elektronik harus tetap kering.
