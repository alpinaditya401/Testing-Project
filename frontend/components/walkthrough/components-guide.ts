export type ComponentGuide = {
  id: string
  name: string
  status: string
  purpose: string
  wires: string[]
  note: string
}

export const COMPONENTS: ComponentGuide[] = [
  {
    id: "esp",
    name: "ESP32 DOIT 30 pin",
    status: "Pin inti sesuai firmware",
    purpose: "Pusat pembacaan sensor dan kontrol feeder/pompa.",
    wires: [
      "Micro-USB → USB komputer untuk tahap awal",
      "3V3 → jalur logika 3,3 V; GND → ground bersama",
      "GPIO4 suhu · GPIO34 kekeruhan · GPIO35 pH · GPIO18 servo · GPIO23 relay",
    ],
    note: "Cocokkan tulisan GPIO pada board fisik, bukan urutan kaki di model. Jangan masukkan 12 V atau gabungkan 5 V USB dengan output buck.",
  },
  {
    id: "temp",
    name: "Sensor suhu DS18B20",
    status: "GPIO4 · sesuai firmware",
    purpose: "Mengukur suhu air melalui probe waterproof yang sudah dikonfirmasi identitasnya.",
    wires: [
      "VDD → ESP32 3V3",
      "GND → GND bersama",
      "DATA / DQ → GPIO4",
      "Resistor 4,7 kΩ antara DATA dan 3V3",
    ],
    note: "Konfirmasi urutan kabel probe dari label/datasheet; warna kabel bukan patokan tunggal.",
  },
  {
    id: "ph",
    name: "Probe & board pH",
    status: "GPIO35 · sensor masih perlu dikonfirmasi",
    purpose: "Model menampilkan usulan probe pH air dan board pengondisi sinyal.",
    wires: [
      "Probe → konektor BNC board pH",
      "AO → GPIO35 hanya setelah tegangan aman ≤3,3 V",
      "GND → GND bersama",
      "VCC → catu sesuai modul aktual; 3V3 di model hanya untuk kandidat kompatibel",
    ],
    note: "Firmware masih soil_placeholder, belum pH air terkalibrasi. Sensor tanah yang tersedia tidak otomatis cocok untuk air. Board/BNC tetap kering; verifikasi catu dan conditioning sebelum menyambung AO.",
  },
  {
    id: "turb",
    name: "Sensor kekeruhan",
    status: "GPIO34 · melalui divider",
    purpose: "Membaca sinyal analog kekeruhan; nilai mentah belum merupakan NTU terkalibrasi.",
    wires: [
      "VCC → 5 V regulated jika modul aktual mendukung",
      "GND → GND bersama",
      "AO → resistor 10 kΩ → titik ADC → GPIO34",
      "Titik ADC → resistor 15 kΩ → GND",
    ],
    note: "Jangan sambungkan AO langsung ke ESP32. Ukur titik ADC dahulu: harus ≤3,3 V; divider rancangan mengubah 5 V menjadi 3 V.",
  },
  {
    id: "divider",
    name: "Divider 10 kΩ / 15 kΩ",
    status: "Proteksi level sinyal turbidity",
    purpose: "Menurunkan tegangan analog sebelum masuk ADC ESP32.",
    wires: ["AO turbidity → 10 kΩ → node ADC", "Node ADC → GPIO34", "Node ADC → 15 kΩ → GND"],
    note: "Vadc = 0,6 × Vout. Pastikan nilai resistor, sambungan ground, dan hasil ukur; attenuation ADC bukan pelindung overvoltage.",
  },
  {
    id: "pullup",
    name: "Pull-up 4,7 kΩ",
    status: "Jalur DATA DS18B20",
    purpose: "Menahan jalur data sensor suhu pada level logika tinggi saat idle.",
    wires: ["Satu ujung → 3V3", "Ujung lain → sambungan DATA DS18B20 / GPIO4"],
    note: "Resistor dipasang antara DATA dan 3V3, bukan seri di kabel DATA. Rancangan memakai tiga kabel, bukan parasite power.",
  },
  {
    id: "servo",
    name: "Servo SG90 / feeder",
    status: "GPIO18 · sesuai firmware",
    purpose: "Membuka dan menutup mekanisme pakan.",
    wires: [
      "Signal → GPIO18",
      "V+ → catu eksternal 5 V regulated minimum 2 A",
      "GND → GND catu dan ESP32",
    ],
    note: "Jangan mengambil daya servo dari pin daya ESP32. Uji sudut buka/tutup dengan linkage dilepas dahulu; sisakan margin arus untuk beban lain.",
  },
  {
    id: "buck",
    name: "Buck 12 V → 5 V",
    status: "Jalur daya DC",
    purpose: "Menurunkan catu adaptor untuk servo dan modul yang kompatibel 5 V.",
    wires: [
      "IN+ → keluaran fuse 12 V",
      "IN− → negatif adaptor",
      "OUT+ / 5V → cabang servo, relay pengganti, turbidity",
      "OUT− / G → ground bersama",
    ],
    note: "Atur dan ukur output 5 V sebelum memasang elektronik. Minimum 2 A untuk servo plus margin beban lain. Jangan satukan output buck dengan rail 5 V USB.",
  },
  {
    id: "power",
    name: "Input DC & fuse",
    status: "Konsep 12 V DC",
    purpose: "Masukan daya dan proteksi cabang beban.",
    wires: [
      "Adaptor +12 V → input fuse",
      "FUSE OUT → buck IN+, relay COM, dan cabang aerator",
      "Negatif adaptor → ground daya",
    ],
    note: "Rating fuse, kabel, adaptor dan beban harus ditentukan dari komponen aktual. Jalur 12 V tidak masuk ke GPIO, servo, atau sensor 5 V.",
  },
  {
    id: "relay",
    name: "Relay pengganti 5 V",
    status: "GPIO23 · kompatibilitas belum terverifikasi",
    purpose: "Mengendalikan kontak daya pompa konsep DC.",
    wires: [
      "IN → GPIO23 hanya jika trigger 3,3 V didukung eksplisit",
      "VCC / JD-VCC / GND → ikuti datasheet modul dan skema isolasinya",
      "Konsep beban DC: fuse OUT → COM; NO → pompa +",
    ],
    note: "Relay stok 24 V H/L tidak digunakan. Verifikasi polaritas aktif dan kondisi boot OFF. Rute ground pada model bukan bukti isolasi; jangan menjembatani isolasi modul sembarang.",
  },
  {
    id: "pump",
    name: "Pompa sirkulasi",
    status: "Beban konsep DC 12 V",
    purpose: "Mengirim air akuarium menuju grow bed.",
    wires: [
      "Konsep DC: relay NO → pompa +",
      "Pompa − → negatif catu DC",
      "Dioda beban induktif: katoda ke +, anoda ke − jika sesuai jenis beban",
    ],
    note: "Tegangan dan tipe pompa fisik belum terkonfirmasi. Rute ini hanya untuk konsep DC12V; jangan dipakai untuk pompa AC. Rating relay, fuse dan dioda mengikuti beban.",
  },
  {
    id: "air",
    name: "Terminal aerator",
    status: "Aerasi kontinu · konsep DC",
    purpose: "Memberi suplai ke aerator; pada model terpisah dari relay pompa.",
    wires: ["Konsep DC12V: fuse OUT → aerator +", "Aerator − → negatif catu"],
    note: "Verifikasi rating aerator aktual. GPIO tidak memberi daya langsung. Model tidak mengimplementasikan kontrol aerasi kontinu di firmware.",
  },
  {
    id: "capacitor",
    name: "Kapasitor reservoir 470 µF",
    status: "Cabang daya servo",
    purpose: "Membantu meredam transien pada suplai servo.",
    wires: ["Kaki + → rail 5 V servo", "Kaki − → GND servo", "Pasang dekat konektor daya servo"],
    note: "Periksa polaritas dan rating tegangan komponen. Kapasitor tidak menggantikan catu yang mampu memasok arus servo.",
  },
  {
    id: "oled",
    name: "OLED SSD1306",
    status: "Usulan · belum didukung firmware",
    purpose: "Menampilkan pembacaan/status lokal pada tutup casing.",
    wires: ["SDA → GPIO21", "SCL → GPIO22", "VCC → 3V3 jika modul kompatibel", "GND → GND bersama"],
    note: "Perlu kode I²C dan verifikasi alamat/display aktual. Tulisan pada model adalah data demo, bukan pembacaan sensor.",
  },
  {
    id: "feed-button",
    name: "Tombol pakan",
    status: "GPIO32 · usulan firmware",
    purpose: "Usulan pemicu pemberian pakan manual.",
    wires: [
      "Satu kontak → GPIO32",
      "Kontak pasangan → GND",
      "Firmware perlu konfigurasi pull-up dan debounce",
    ],
    note: "GPIO23 sudah dipakai relay; jangan memakai pin tombol dari Wokwi historis. Pastikan pasangan kontak switch memakai multimeter.",
  },
  {
    id: "pump-button",
    name: "Tombol pompa",
    status: "GPIO26 · usulan firmware",
    purpose: "Usulan kontrol pompa manual.",
    wires: [
      "Satu kontak → GPIO26",
      "Kontak pasangan → GND",
      "Firmware perlu konfigurasi pull-up dan debounce",
    ],
    note: "Tombol tidak membawa arus pompa. Fungsi manual dan aturan interlock belum diterapkan pada firmware.",
  },
  {
    id: "level",
    name: "Float switch / level air",
    status: "GPIO27 · usulan firmware",
    purpose: "Usulan deteksi air minimum sebelum pompa diaktifkan.",
    wires: ["Kontak float → GPIO27", "Kontak lain → GND", "Usulan mode input: INPUT_PULLUP"],
    note: "Periksa kondisi kontak pada level tinggi/rendah. Interlock pompa belum diimplementasikan; model visual tidak memberi perlindungan dry-run.",
  },
  {
    id: "pump-led",
    name: "LED indikator pompa",
    status: "GPIO25 · usulan firmware",
    purpose: "Usulan penanda perintah pompa.",
    wires: ["GPIO25 → resistor 220 Ω → anoda LED", "Katoda LED → GND"],
    note: "Cocokkan polaritas LED dan kebutuhan resistor aktual. LED menyala tidak membuktikan pompa benar-benar mengalir.",
  },
  {
    id: "feed-led",
    name: "LED indikator feeder",
    status: "GPIO33 · usulan firmware",
    purpose: "Usulan penanda proses pemberian pakan.",
    wires: ["GPIO33 → resistor 220 Ω → anoda LED", "Katoda LED → GND"],
    note: "Jangan pasang LED langsung tanpa resistor. Indikator perlu implementasi firmware.",
  },
  {
    id: "controller",
    name: "Casing kontrol / zona kering",
    status: "Buka scene Rangkaian untuk wiring",
    purpose: "Melindungi dan menempatkan elektronik di samping instalasi.",
    wires: [
      "Kabel sensor dan aktuator → gland masing-masing",
      "Buat lengkungan kabel turun sebelum masuk casing",
      "Lihat scene Rangkaian untuk pin ESP32 dan modul",
    ],
    note: "Model casing dan gland belum diuji kedap air. Board pH, konektor, dan semua elektronik harus tetap kering.",
  },
]

export const guideFor = (id: string) => COMPONENTS.find((item) => item.id === id)
