const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, ImageRun, AlignmentType, VerticalAlign,
} = require('docx');

// Jalankan dari folder ini: node build_laporan_gabungan.js
// Butuh: npm install docx (tidak ikut di-commit, lihat README_MANDIRI.md)
const SC = __dirname;
const TM = path.join(SC, 'tugas_mandiri');
const BUKTI = path.join(TM, 'bukti');
const MEDIA = path.join(TM, 'media');

const PAGE_W = 12240;
const MARGIN = 1440;
const CONTENT_W = PAGE_W - 2 * MARGIN;

function h1(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 150 } }); }
function h2(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } }); }
function p(children, opts = {}) { return new Paragraph({ children: Array.isArray(children) ? children : [new TextRun(children)], spacing: { after: 160 }, ...opts }); }
function bold(text) { return new TextRun({ text, bold: true }); }
function txt(text) { return new TextRun(text); }
function caption(text) { return new Paragraph({ children: [new TextRun({ text, italics: true, size: 20 })], spacing: { after: 200 }, alignment: AlignmentType.CENTER }); }

function cell(text, opts = {}) {
  const { width, header = false, shade = null } = opts;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: shade ? { type: ShadingType.CLEAR, color: 'auto', fill: shade } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text: String(text), bold: header })] })],
  });
}

function table(headerRow, rows, colWidths) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  if (Math.abs(total - CONTENT_W) > 5) {
    const scale = CONTENT_W / total;
    colWidths = colWidths.map((w) => Math.round(w * scale));
  }
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({ tableHeader: true, children: headerRow.map((t, i) => cell(t, { width: colWidths[i], header: true, shade: 'D9E2F3' })) }),
      ...rows.map((r) => new TableRow({ children: r.map((t, i) => cell(t, { width: colWidths[i] })) })),
    ],
  });
}

function imageFrom(dir, file, widthPx, heightPx, maxWidthIn = 5.8) {
  const buf = fs.readFileSync(path.join(dir, file));
  const widthIn = Math.min(maxWidthIn, widthPx / 150);
  const heightIn = widthIn * (heightPx / widthPx);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({ data: buf, transformation: { width: widthIn * 96, height: heightIn * 96 }, type: 'png' })],
  });
}

const doc = new Document({
  sections: [{
    properties: { page: { size: { width: PAGE_W, height: 15840 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
    children: [
      p([bold('PRAKTIKUM PYTHON UNTUK SISTEM CERDAS')], { alignment: AlignmentType.CENTER }),
      p([txt('Mata kuliah Python untuk Sistem Cerdas')], { alignment: AlignmentType.CENTER }),
      p([txt('D3 Teknik Informatika Kampus Kabupaten Madiun')], { alignment: AlignmentType.CENTER }),
      p([txt('Sekolah Vokasi Universitas Sebelas Maret')], { alignment: AlignmentType.CENTER, spacing: { after: 300 } }),

      table(['Anggota tim', 'NIM'], [['Alpin Aditya Pratama', 'V3925004'], ['Dimas Aryo Sejati', 'V3925022']], [6000, 3360]),
      p(''),

      h1('Tugas Mandiri AquaSmart AIoT'),
      p([txt('Laporan ini menjawab seluruh soal Tugas Mandiri project AquaSmart AIoT: '), bold('MODUL_PRAKTIKUM1.pdf'), txt(' Soal 1–5 (project framing, EDA, pembersihan data, baseline, dan pemeriksaan data leakage) dan '), bold('MODUL_PRAKTIKUM2.pdf'), txt(' Soal 1–3 (evaluasi dan perbandingan model), '), bold('Bagian 1 — Machine Learning dan Deep Learning'), txt('. Keduanya disusun sebagai satu paket berkelanjutan, bukan laporan terpisah per pertemuan: Bagian B melanjutkan langsung model dan pembagian data dari Bagian A.')]),
      p([bold('Project.'), txt(' AquaSmart AIoT, akuakultur — memprediksi status ambang pH/suhu pada interval lima menit berikutnya dari data sensor kolam nyata. Pada holdout waktu, Random Forest memperoleh macro F1 0,8951, sedikit di bawah aturan ambang terakhir (0,9158). Hasil ini mendukung penggunaan baseline non-AI sebagai pembanding awal; belum ada bukti bahwa model ML perlu menggantikannya.')]),
      p([bold('Batas hasil.'), txt(' Label dibuat dari aturan aplikasi, bukan penilaian ahli. Dataset tidak memiliki kekeruhan sehingga hasil bukan status kualitas air lengkap. Evaluasi menggunakan satu sumber kolam dan belum merupakan validasi perangkat AquaSmart di lapangan.')]),

      h2('Berkas pelaksanaan'),
      p([txt('Kode dan output lengkap berada di '), bold('notebooks/01_eda.ipynb'), txt(', '), bold('02_baseline.ipynb'), txt(', dan '), bold('03_evaluasi_perbandingan.ipynb'), txt(' pada akar repository. Data bersih, model tersimpan, tabel hasil, dan tangkapan layar berada di '), bold('01_AquaSmart/08_Sistem-Cerdas/tugas_mandiri/'), txt('.')]),
      p([bold('Kontribusi Git.'), txt(' Modul mensyaratkan commit dari kedua anggota. Syarat ini belum diklaim selesai; setiap anggota harus meninjau dan melakukan commit sendiri. Tidak dibuat commit dengan identitas anggota lain.')]),

      // ============ BAGIAN A ============
      h1('Bagian A — MODUL_PRAKTIKUM1: Project Framing, EDA, dan Baseline'),

      h2('Soal 1 — Project framing'),
      p([bold('Project, sektor, pengguna.'), txt(' AquaSmart AIoT, akuakultur. Pengguna utama adalah pembudidaya kolam skala kecil yang memantau kualitas air melalui dashboard. Kode ini merupakan eksperimen offline, belum terhubung ke kendali perangkat.')]),
      p([bold('Masalah terukur.'), txt(' Memprediksi apakah median pH atau suhu pada interval lima menit berikutnya akan keluar dari ambang aplikasi. Prediksi dibuat pada awal interval t; input terakhir berasal dari interval t−1 yang sudah selesai. Keberhasilan dinilai terhadap baseline persistensi ambang pada periode uji yang lebih akhir. Tidak ditetapkan target skor tanpa dasar.')]),
      p([bold('Input dan output.'), txt(' Input berupa riwayat pH, TDS, suhu, dan timestamp pada CSV sensor kolam yang sudah ada di project. Output berupa kelas 0 (pH dan suhu dalam ambang) atau 1 (salah satu di luar ambang). Ini adalah status parsial, bukan jaminan air aman: kekeruhan dan oksigen terlarut tidak tersedia. TDS bukan kekeruhan.')]),
      p([bold('Tipe AI.'), txt(' Klasifikasi berurutan waktu untuk peringatan dini lima menit, menggunakan Random Forest sesuai tabel AquaSmart pada modul. Target diturunkan dari median pembacaan pada interval mendatang menggunakan ambang ThresholdRules.php. Label ini adalah proksi aturan, bukan hasil penilaian ahli atau label kesehatan ikan.')]),
      p([bold('Alasan dan baseline non-AI.'), txt(' Pola perubahan historis mungkin membantu memperkirakan pelanggaran ambang berikutnya. Aturan ambang pada pembacaan terakhir merupakan baseline non-AI (asumsi persistensi). AI hanya layak dilanjutkan bila unggul secara terukur. Mengklasifikasikan nilai saat ini dengan label dari aturan yang sama hanya meniru aturan; karena itu eksperimen ini memakai fitur masa lalu untuk target interval mendatang. Dummy kelas mayoritas menjadi pembanding tambahan.')]),
      p([bold('Metrik.'), txt(' Macro F1 menjadi metrik utama agar dua kelas diberi bobot sama; recall alarm menunjukkan berapa banyak pelanggaran proksi yang terdeteksi. Balanced accuracy dan confusion matrix melengkapi evaluasi; accuracy tidak dipakai sendirian karena kemungkinan ketimpangan kelas. Semua metrik berlaku terhadap label proksi, bukan kejadian kerusakan nyata.')]),

      h2('Batas lingkup dan sumber data'),
      p([bold('Bias dan privasi.'), txt(' Satu sumber kolam, rentang waktu terbatas, drift sensor, dan perbedaan ambang suhu antara aplikasi dan dataset dapat menyebabkan bias. Evaluasi berurutan waktu, distribusi per periode, serta pelaporan kedua kelas mengurangi salah tafsir, tetapi belum membuktikan generalisasi ke kolam lain. Tidak ada nama, nomor telepon, atau data akun pada CSV; ID baris dibuang dari fitur. Pada pengumpulan internal berikutnya, pseudonimkan ID kolam, batasi akses dan retensi, serta jangan sertakan kredensial perangkat. Pembudidaya tetap memeriksa alarm sebelum tindakan.')]),
      p([bold('Rencana bertahap.'), txt(' Audit data, pembersihan, fitur historis, dan baseline dikerjakan lebih dulu; dilanjutkan analisis kesalahan dan validasi temporal, lalu evaluasi dan perbandingan model (Bagian B di bawah). Peninjauan label bersama domain expert, uji integrasi prediksi offline, dan demonstrasi akhir masih berupa rencana lanjutan. Di luar lingkup: pelatihan ulang firmware, kalibrasi fisik, aktuasi aerator otomatis, uji lintas kolam, dan klaim kelayakan produksi.')]),
      h2('Sumber dataset dan keterbatasan verifikasi'),
      p([txt('Boby Siswanto. A Simple Dataset of Aquaponic Fish Pond Water Quality Measurement using Internet of Things devices. Mendeley Data versi 2, 27 Maret 2023. DOI 10.17632/yd36bx6f8f.2. Lisensi pada halaman sumber: CC BY 4.0. https://data.mendeley.com/datasets/yd36bx6f8f/2')]),
      p([txt('README project mengatribusikan file lokal ke sumber tersebut. Halaman publik menyebut 118.286 baris terfilter, sedangkan file lokal berisi 505.730 baris. Kesetaraan file lokal dengan unduhan versi 2 belum diverifikasi. Eksperimen mengidentifikasi file lokal melalui SHA-256, bukan menyamakan kedua jumlah itu.')]),
      p([bold('SHA-256 file lokal: '), txt('ac69aff715a31f3f35439247b02d9e7bf95e409652bf88e5f15329c6effb9dba')]),
      p([txt('Aturan dibaca langsung dari server/src/ThresholdRules.php: pH 6,5–8,5 dan suhu 25–30°C. Ini adalah ambang default project, bukan klaim standar universal. TDS digunakan sebagai fitur tambahan; ambang kekeruhan tidak diterapkan pada TDS.')]),
      p([txt('Bukti output framing dan ambang yang dibaca dari kode: '), bold('bukti/soal_1.png'), txt('.')]),

      h2('Soal 2 — EDA dataset project'),
      table(['Pemeriksaan', 'Hasil eksekusi'], [
        ['Ukuran mentah', '505.730 baris × 5 kolom'],
        ['Kolom', 'id, created_date, water_pH, TDS, water_temp'],
        ['Duplikat semua kolom', '0'],
        ['Tuple waktu & nilai berulang digabung', '8.518'],
        ['Timestamp tidak valid', '0'],
        ['pH di luar 0–14', '219'],
        ['Grid lima menit termasuk jeda', '15.928'],
        ['Interval kosong', '4.820'],
        ['Label proksi dalam ambang', '1.073'],
        ['Label proksi di luar ambang', '10.033'],
      ], [5000, 4360]),
      p(''),
      p([txt('Tidak ada kategori substantif pada CSV. Kolom created_date dikonversi menjadi timestamp, sedangkan id adalah ID baris dan tidak digunakan sebagai fitur. df.info(), df.describe(), missing value per kolom serta lima baris pertama disertakan lengkap dalam notebook dan tangkapan layar soal_2.png.')]),
      p([txt('• Kelas di luar ambang mencakup 90,34% label. Dampak: gunakan macro F1, balanced accuracy, dan baseline dummy; accuracy saja tidak cukup.')]),
      p([txt('• Median pH harian berkisar 5,54–11,71. Dampak: evaluasi harus berurutan waktu karena perubahan kondisi atau drift sensor tidak boleh tercampur secara acak.')]),
      p([txt('• Korelasi pH dengan TDS sebesar -0,172. Dampak: keduanya dipertahankan untuk baseline, tetapi korelasi tidak membuktikan kausalitas atau menjadikan TDS pengganti kekeruhan.')]),
      p([txt('• Ada 4.820 interval kosong dari 15.928 interval lima menit. Dampak: pertahankan grid waktu, jangan menghubungkan lag melintasi jeda seolah pengukuran berurutan.')]),

      imageFrom(MEDIA, 'grafik_eda.png', 1920, 1280),
      caption('Gambar 1. Empat grafik dari eksekusi notebook: distribusi label proksi, histogram pH, tren suhu harian, dan korelasi sensor.'),
      p([txt('Alarm proksi dominan karena banyak pH atau suhu berada di luar rentang aplikasi. Hal ini bisa mencerminkan karakter kolam sumber atau drift sensor; dataset ini tidak cukup untuk menetapkan penyebab. Skor evaluasi tidak boleh diterjemahkan sebagai akurasi deteksi ikan sakit atau kekeruhan.')]),

      h2('Soal 3 — Pembersihan dan fitur turunan'),
      p([txt('Tanggal dibersihkan dari spasi dan dikonversi dengan format eksplisit. Angka yang tidak dapat diparsing menjadi missing. pH di luar 0–14, TDS negatif, dan suhu di luar 0–100°C ditandai missing sebagai pemeriksaan kewajaran fisik umum air cair pada konteks kolam, bukan ambang optimal budidaya. Tidak digunakan batas TDS atas tanpa spesifikasi sensor. Pembacaan di luar ambang budidaya tetap dipertahankan sebagai kandidat alarm.')]),
      p([txt('Timestamp hanya beresolusi menit sehingga pembacaan dengan waktu dan nilai sama belum tentu duplikasi peristiwa. Kebijakan di sini menggabungkan tuple identik agar tidak mendapat bobot berlebih; ID unik tidak dipakai untuk menyembunyikan repetisi pengukuran. Data diagregasi median pada grid lima menit. Bin kosong tetap ada; tidak ada interpolasi atau backward fill.')]),
      p([txt('Untuk setiap sensor dibuat lag satu dan dua interval, rata-rata dan simpangan baku 12 interval terakhir. Semua rolling memakai shift(1). Minimal tiga pembacaan diperlukan untuk rolling; nilai fitur kosong ditangani imputer pada Pipeline setelah split. Prediksi hanya dievaluasi jika pH dan suhu interval sebelumnya dan target tersedia, dengan pemanasan 12 interval.')]),
      table(['Kelompok fitur', 'Makna dan ketersediaan'], [
        ['ph_lag1, tds_lag1, temp_lag1', 'Median sensor pada interval t−1 yang telah selesai'],
        ['ph_lag2, tds_lag2, temp_lag2', 'Median sensor pada interval t−2'],
        ['ph_mean12, tds_mean12, temp_mean12', 'Rata-rata maksimal 12 interval sebelum t, minimal 3 nilai'],
        ['ph_std12, tds_std12, temp_std12', 'Simpangan baku pada jendela historis yang sama'],
      ], [4000, 5360]),
      p(''),
      p([txt('Data bersih disimpan sebagai data_bersih_5menit.csv. Fitur dan label proksi disimpan sebagai fitur_dan_target.csv. Missing value fitur sengaja masih terlihat pada file tersebut; imputasi dilakukan saat fit Pipeline. Kedua CSV tidak mengandung identitas akun atau kredensial.')]),

      h2('Soal 4 — Baseline project'),
      p([txt('Pembagian dilakukan menurut urutan waktu, sekitar 80 persen sampel awal untuk latih dan 20 persen akhir untuk uji. Sampel satu jam sebelum awal uji dikeluarkan dari latih. Semua baseline memakai sampel uji yang sama.')]),
      table(['Bagian', 'Jumlah', 'Periode'], [
        ['Latih', '8.525', '2023-01-26 12:05 s/d 2023-03-07 20:35'],
        ['Uji', '2.135', '2023-03-07 21:40 s/d 2023-03-22 17:50'],
      ], [2000, 1800, 5560]),
      p(''),
      p([txt('Baseline non-AI menerapkan ambang project ke pH dan suhu terakhir, kemudian mengasumsikan status tetap pada interval berikutnya. Dummy selalu memilih kelas mayoritas. Random Forest memakai 160 pohon, max_depth 10, min_samples_leaf 5, class_weight balanced, dan random_state 42.')]),
      table(['Model', 'Macro F1', 'Balanced accuracy', 'Recall alarm', 'Accuracy'], [
        ['Dummy mayoritas', '0,4686', '0,5000', '1,0000', '0,8820'],
        ['Ambang terakhir non-AI', '0,9158', '0,9165', '0,9798', '0,9649'],
        ['Random Forest', '0,8951', '0,9155', '0,9660', '0,9541'],
      ], [2400, 1800, 1800, 1600, 1760]),
      p(''),
      p([txt('Selisih macro F1 Random Forest terhadap aturan persistensi adalah -0,0207. Random Forest belum mengungguli aturan persistensi; baseline non-AI tetap menjadi pilihan awal.')]),
      p([txt('TimeSeriesSplit lima fold pada data latih menghasilkan macro F1 rata-rata 0,7981 dengan simpangan 0,2053. Variasi antarperiode cukup besar; hasil satu holdout tidak cukup untuk menyatakan model stabil. Fold validasi kelima hanya memuat kelas alarm; macro F1 tetap dihitung pada dua label dengan zero_division 0, sehingga skor fold tersebut bukan pengukuran kemampuan membedakan dua kelas.')]),

      imageFrom(MEDIA, 'confusion_matrix_baseline_ketiga_model.png', 2080, 640),
      caption('Gambar 2. Confusion matrix ketiga baseline pada 2.135 sampel uji. Dalam berarti pH dan suhu berada pada ambang aplikasi, bukan sertifikasi air aman; Luar berarti sedikitnya salah satu parameter melanggar ambang.'),
      p([txt('Pipeline Random Forest disimpan pada pipeline_random_forest.joblib. Pengujian memuat ulang model dan membandingkan seluruh prediksi data uji menghasilkan prediksi identik. Tidak dilakukan tuning setelah melihat hasil holdout pada tahap ini (tuning dikerjakan terpisah pada Bagian B, dengan data uji yang sama tetap disegel hingga langkah akhir).')]),

      h2('Soal 5 — Pemeriksaan data leakage'),
      p([bold('Daftar fitur.'), txt(' Dua belas kolom: pH, TDS, dan suhu masing-masing memiliki lag1, lag2, mean12, dan std12. Seluruhnya tersedia sebelum interval target dimulai. ID baris, timestamp mentah, nilai sensor interval target, target_proxy, keputusan aktuator, dan hasil tindakan tidak menjadi fitur.')]),
      p([bold('Preprocessing.'), txt(' Agregasi median per interval dan pemeriksaan batas fisik tidak belajar parameter dari data. Fitur historis dibentuk sebelum split karena operasi kausal tanpa fit. Imputasi median dan scaling belajar dari latih di dalam ColumnTransformer dan Pipeline; hal yang sama dilakukan ulang pada setiap fold.')]),
      p([bold('Objek yang sama.'), txt(' CSV tidak memuat ID sensor/kolam terpisah; latih dan uji diasumsikan berasal dari sumber sensor yang sama. Purge satu jam menjaga batas holdout dari tumpang tindih jendela fitur; untuk klaim lintas kolam diperlukan data beberapa kolam dan GroupKFold/holdout kolam.')]),
      p([bold('Risiko yang tersisa.'), txt(' Autokorelasi dan perubahan distribusi masih mungkin. Label proksi berasal dari aturan tetap, sehingga skor tinggi tidak membuktikan label ahli. Data uji di sini bukan uji lapangan independen.')]),
      p([txt('Verifikasi yang dijalankan: timestamp latih/uji tidak beririsan (purge >1 jam), daftar fitur tepat 12 kolom historis, statistik imputer identik dengan median data latih, kausalitas fitur tidak berubah oleh data masa depan, dan prediksi model identik setelah disimpan-dimuat ulang.')]),

      // ============ BAGIAN B ============
      h1('Bagian B — MODUL_PRAKTIKUM2: Evaluasi dan Perbandingan Model'),
      p([txt('Bagian ini melanjutkan langsung model dan pembagian data Bagian A. Semua angka pada bagian ini adalah keluaran nyata dari menjalankan '), bold('evaluasi_model.py'), txt(' dan '), bold('03_evaluasi_perbandingan.ipynb'), txt(', tersimpan di '), bold('tugas_mandiri/evaluasi_perbandingan.json'), txt(' dan berkas CSV/PNG pendukung. Tidak ada angka yang ditulis manual.')]),

      h2('Soal 1 — Bagian, Metrik, dan Pembanding'),
      p([bold('a. Bagian yang dikerjakan dan alasannya. '), txt('Bagian 1 (Machine Learning dan Deep Learning). AquaSmart Bagian A melatih model sendiri (Random Forest) dari data sensor tabular miliknya, bukan memanggil LLM pre-trained. Bagian B ini melanjutkan model dan pembagian data yang sama, bukan memulai project baru.')]),
      p([bold('b. Metrik utama beserta alasannya. '), txt('Metrik utama: macro F1 dan balanced accuracy, dengan recall alarm sebagai metrik pelengkap — sama seperti definisi score() pada mandiri.py. Alasannya:')]),
      p([txt('• Kelas pada data ini sangat tidak seimbang, tetapi terbalik dari contoh modul (triase): kelas "di luar ambang" (alarm) adalah mayoritas (~91% di data latih), bukan minoritas. Accuracy saja menyesatkan karena classifier yang selalu menjawab "di luar ambang" sudah mendapat accuracy tinggi tanpa belajar apa pun (baseline Dummy mayoritas: accuracy 0,882 tetapi macro F1 hanya 0,469).')]),
      p([txt('• Macro F1 dan balanced accuracy memberi bobot setara ke kedua kelas, sehingga kegagalan pada kelas minoritas ("dalam ambang") tetap terlihat walau jumlahnya sedikit.')]),
      p([txt('• Recall alarm tetap dipantau karena ini konteks skrining kualitas air: alarm yang terlewat (FN pada kelas "di luar ambang") berisiko lebih mahal daripada alarm palsu.')]),

      h2('Soal 2 — Evaluasi dan Perbandingan'),
      h2('a. Confusion matrix baseline (data uji)'),
      imageFrom(BUKTI, 'evaluasi_confusion_matrix_baseline.png', 960, 720),
      caption('Gambar 3. Confusion matrix Random Forest baseline (n_estimators=160, max_depth=10, min_samples_leaf=5, threshold 0,5) pada data uji (2.135 baris).'),
      table(['Metrik', 'Nilai'], [['Macro F1', '0,8951'], ['Balanced accuracy', '0,9155'], ['Recall alarm', '0,9660'], ['Accuracy', '0,9541']], [6360, 3000]),
      p(''),
      h2('Perbandingan minimal dua model (5-fold cross-validation, data latih)'),
      table(['Model', 'Precision alarm', 'Recall alarm', 'Macro F1'], [
        ['Logistic Regression', '0,992 ± 0,011', '0,825 ± 0,180', '0,739 ± 0,155'],
        ['Random Forest', '0,974 ± 0,031', '0,939 ± 0,064', '0,776 ± 0,114'],
      ], [3000, 2200, 2200, 1960]),
      p([txt('Random Forest unggul pada macro F1 dan recall alarm; simpangannya juga lebih kecil, jadi lebih stabil antar fold. Logistic Regression punya precision lebih tinggi tetapi recall jauh lebih rendah dan sangat bervariasi (± 0,180) — beberapa fold gagal menangkap kelas minoritas.')]),
      h2('Hyperparameter tuning (GridSearchCV pada Random Forest)'),
      p([txt('Kombinasi dicoba: n_estimators ∈ {100, 160, 300} × max_depth ∈ {6, 10, None}, scoring macro F1, 5-fold. Parameter terbaik: '), bold('max_depth=6, n_estimators=100'), txt(', macro F1 (CV) = 0,798.')]),
      h2('c. Tabel perbandingan akhir'),
      table(['Konfigurasi', 'Macro F1 (CV, data latih)', 'Macro F1 (data uji, sekali)'], [
        ['Baseline (n_estimators=160, max_depth=10, min_samples_leaf=5, threshold 0,5)', '0,798', '0,8951'],
        ['Hasil tuning (max_depth=6, n_estimators=100) + threshold 0,3', '0,798', '0,7012'],
      ], [4560, 2400, 2400]),
      p(''),
      p([bold('Model/konfigurasi yang dipilih dan alasannya: '), txt('tetap baseline Bagian A (Random Forest n_estimators=160, max_depth=10, min_samples_leaf=5, threshold default 0,5), bukan hasil GridSearchCV + threshold 0,3. Meskipun skor cross-validation keduanya sama-sama 0,798, baseline jauh lebih baik saat benar-benar diuji satu kali di data uji (macro F1 0,8951 vs 0,7012). Detail dan dugaan penyebabnya ada di Soal 3c. Random Forest belum mengungguli baseline aturan ambang pada Bagian A, dan sekarang terbukti pula belum mengungguli konfigurasi Random Forest Bagian A sendiri.')]),

      h2('Soal 3 — Keputusan dan Pemeriksaan'),
      h2('a. Threshold dan pemeriksaan overfitting'),
      table(['Threshold', 'Precision alarm', 'Recall alarm', 'Macro F1'], [
        ['0,3', '0,973', '0,968', '0,841'],
        ['0,4', '0,976', '0,960', '0,836'],
        ['0,5', '0,980', '0,938', '0,812'],
        ['0,6', '0,983', '0,933', '0,811'],
        ['0,7', '0,985', '0,920', '0,798'],
        ['0,8', '0,987', '0,795', '0,667'],
        ['0,9', '0,999', '0,747', '0,646'],
      ], [2000, 2400, 2400, 2560]),
      p([txt('Threshold 0,3 memberi macro F1 tertinggi di data latih, sehingga dipilih untuk uji akhir (lihat Soal 3c).')]),
      imageFrom(BUKTI, 'evaluasi_overfitting.png', 900, 600),
      caption('Gambar 4. Skor Macro F1 Decision Tree pada data latih vs validasi (5-fold CV) di berbagai max_depth.'),
      p([txt('Skor latih naik terus mendekati 1 saat max_depth membesar, sedangkan skor validasi memuncak di kedalaman menengah (sekitar 3) lalu melandai/menurun — pola overfitting seperti dijelaskan pada Dasar Teori modul. Ini menjadi salah satu alasan memilih max_depth terbatas (6–10), bukan pohon tanpa batas, pada Random Forest.')]),

      h2('c. Tiga contoh kesalahan model/sistem dan dugaan penyebabnya'),
      p([bold('1. Model hasil tuning tampak lebih baik di cross-validation tetapi lebih buruk di data uji. '), txt('Macro F1 CV keduanya sama (0,798), tetapi di data uji baseline mencapai macro F1 0,8951 sedangkan hasil tuning + threshold 0,3 hanya 0,7012 — balanced accuracy bahkan turun dari 0,9155 ke 0,6553. Dugaan penyebab: data ini adalah deret waktu dari satu kolam dengan simpangan CV yang sangat tinggi (0,7981 ± 0,2053) dan satu fold yang hanya berisi satu kelas. Kombinasi max_depth lebih dangkal (6) dan threshold lebih rendah (0,3) kemungkinan cocok dengan pola pada sebagian periode data latih tetapi tidak berlaku lagi pada periode data uji (pergeseran kondisi/drift sensor antar waktu), bukan generalisasi yang sesungguhnya.')]),
      p([bold('2. Threshold rendah menaikkan recall alarm tetapi menenggelamkan kelas minoritas. '), txt('Pada threshold 0,3, recall alarm di data uji mencapai 0,985 (lebih tinggi dari baseline 0,966), tetapi balanced accuracy anjlok ke 0,655. Dugaan penyebab: karena kelas "di luar ambang" adalah mayoritas (~91%), menurunkan threshold membuat model semakin sering menjawab "alarm", sehingga banyak kejadian "dalam ambang" yang sebenarnya justru ikut tertebak alarm — kebalikan dari kasus triase pada modul (di sana alarm/Urgent minoritas).')]),
      p([bold('3. GridSearchCV memilih max_depth=6 yang lebih dangkal dari baseline (max_depth=10), padahal kurva overfitting menunjukkan skor validasi Decision Tree relatif stabil pada kedalaman menengah maupun lebih dalam. '), txt('Dugaan penyebab: scoring GridSearchCV memilih rata-rata macro F1 tertinggi lintas 5 fold, tetapi dengan simpangan antar-fold sebesar itu, kombinasi yang menang belum tentu benar-benar lebih baik secara umum — mirip peringatan Dasar Teori modul: "jika selisih dua model lebih kecil daripada simpangannya, keduanya sebenarnya setara."')]),

      imageFrom(BUKTI, 'evaluasi_confusion_matrix_final.png', 960, 720),
      caption('Gambar 5. Confusion matrix model hasil tuning + threshold 0,3 pada data uji, menunjukkan naiknya false positive kelas "Dalam ambang" dibanding Gambar 3.'),

      // ============ PENUTUP ============
      h1('Kesimpulan'),
      p([txt('Baseline Random Forest dari Bagian A tetap menjadi konfigurasi yang direkomendasikan untuk keseluruhan project. Tuning hyperparameter dan pemilihan threshold pada Bagian B terbukti tidak otomatis meningkatkan performa pada data uji, dan itu dilaporkan apa adanya, bukan diganti dengan hasil yang terlihat lebih baik.')]),

      h1('Batasan'),
      p([txt('Hasil ini adalah status proksi ambang sensor pada satu kolam/satu sumber data, bukan bukti keamanan air, bukan label ahli, dan bukan bukti aktuasi perangkat fisik. CV mempunyai simpangan tinggi (0,7981 ± 0,2053) dan salah satu fold hanya berisi satu kelas; ketidakstabilan yang sama kemungkinan menjadi penyebab GridSearchCV memilih konfigurasi yang tidak bertahan baik di luar data latihnya. Lihat README repo bagian Status untuk batasan proyek AquaSmart secara umum.')]),

      h1('Kontribusi kedua anggota'),
      p([txt('Modul mewajibkan kedua anggota melakukan commit. Syarat ini belum diklaim selesai pada pengerjaan ini dan tidak dipalsukan identitas penulis; Alpin dan Dimas perlu meninjau pekerjaan, membagi perubahan yang benar-benar mereka tinjau/kerjakan, lalu melakukan commit masing-masing menggunakan akun Git sendiri.')]),

      h1('Lampiran bukti'),
      imageFrom(MEDIA, 'audit_output_notebook.png', 1120, 839),
      caption('Gambar 6. Tangkapan layar output audit fitur dan pemeriksaan otomatis dari notebook 02_baseline.ipynb.'),
      table(['Soal', 'Tangkapan layar / berkas bukti'], [
        ['MODUL_PRAKTIKUM1 Soal 1', 'bukti/soal_1.png'],
        ['MODUL_PRAKTIKUM1 Soal 2', 'bukti/soal_2.png'],
        ['MODUL_PRAKTIKUM1 Soal 3', 'bukti/soal_3.png'],
        ['MODUL_PRAKTIKUM1 Soal 4', 'bukti/soal_4.png'],
        ['MODUL_PRAKTIKUM1 Soal 5', 'bukti/soal_5.png'],
        ['MODUL_PRAKTIKUM2 Soal 2a (baseline)', 'bukti/evaluasi_confusion_matrix_baseline.png'],
        ['MODUL_PRAKTIKUM2 Soal 3a (overfitting)', 'bukti/evaluasi_overfitting.png'],
        ['MODUL_PRAKTIKUM2 Soal 3c (model final)', 'bukti/evaluasi_confusion_matrix_final.png'],
      ], [4360, 5000]),
      p(''),
      p([txt('Notebook 01–03 sudah dieksekusi dan menyimpan output. Tangkapan layar soal_1–soal_5 adalah hasil render HTML dari output notebook, bukan foto tampilan antarmuka Jupyter.')]),
      p([txt('Yang masih harus dilakukan tim sebelum pengumpulan: tinjau hasil dan batasannya, lalu pastikan Alpin dan Dimas masing-masing melakukan commit menggunakan akun sendiri. Tidak ada klaim bahwa syarat dua commit sudah terpenuhi.')]),
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(TM, 'Tugas_Mandiri_AquaSmart.docx');
  fs.writeFileSync(out, buf);
  console.log('Ditulis:', out, buf.length, 'bytes');
});
