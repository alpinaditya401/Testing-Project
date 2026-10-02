# Pengujian AquaSmart

Runner utama: `python web/tests/verify_frontend_fixes.py` dari root aplikasi. Setiap suite membuat PHP, SQLite, dan profil browser sementara miliknya sendiri. `results.json`, screenshot, dan log disimpan di `test-output/` (tidak di-commit).

Browser dicari berurutan: variabel `AQUASMART_BROWSER`, Microsoft Edge di Windows, lalu Chromium/Chrome/Edge di Linux dan macOS (termasuk `$PLAYWRIGHT_BROWSERS_PATH/chromium`). Saat berjalan sebagai root di Linux, Chromium otomatis diberi `--no-sandbox`.

`advanced_e2e_audit.py`, `complete_audit.py`, dan `full_audit.py` kini alias runner utama; versi lama yang rusak disimpan dalam backup selektif. Skrip eksplorasi lain seperti `e2e.mjs`, `layout_audit.mjs`, dan `complete_audit.js` dipertahankan sebagai arsip diagnostik dan tidak menjadi evidence kelulusan baru. Sebagian mengharapkan browser pada port tetap; jangan gunakan terhadap sesi pengguna atau database aktif.

`test_static.py` berisi tiga fungsi assertion tanpa kebutuhan runtime pytest. Bila pytest tidak terpasang, fungsi tersebut dapat dibungkus `unittest.FunctionTestCase`; laporan akhir mencatat perintah yang benar-benar dijalankan. Jalankan `python server/tests/review_inventory.py` untuk syntax check tanpa mengeksekusi skrip lama. Syntax pass tidak menyatakan setiap skrip arsip berfungsi end-to-end.
