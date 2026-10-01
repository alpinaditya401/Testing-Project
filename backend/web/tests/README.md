# Pengujian AquaSmart

Runner utama: `python web/tests/verify_frontend_fixes.py` dari root aplikasi. Setiap suite membuat PHP, SQLite, dan profil Edge sementara miliknya sendiri. `results.json`, screenshot, dan log disimpan di `../05_Desain-Figma/review-hermes/`.

`advanced_e2e_audit.py`, `complete_audit.py`, dan `full_audit.py` kini alias runner utama; versi lama yang rusak disimpan dalam backup selektif. Skrip eksplorasi lain seperti `e2e.mjs`, `layout_audit.mjs`, dan `complete_audit.js` dipertahankan sebagai arsip diagnostik dan tidak menjadi evidence kelulusan baru. Sebagian mengharapkan browser pada port tetap; jangan gunakan terhadap sesi pengguna atau database aktif.

`test_static.py` berisi tiga fungsi assertion tanpa kebutuhan runtime pytest. Bila pytest tidak terpasang, fungsi tersebut dapat dibungkus `unittest.FunctionTestCase`; laporan akhir mencatat perintah yang benar-benar dijalankan. Jalankan `python server/tests/review_inventory.py` untuk syntax check tanpa mengeksekusi skrip lama. Syntax pass tidak menyatakan setiap skrip arsip berfungsi end-to-end.
