# AquaSmart SPA/PWA

Frontend aktif memakai HTML/CSS/JavaScript native dan API PHP/SQLite same-origin. Jalur utama Windows PowerShell, dari root aplikasi:

```powershell
python server/run_local.py
```

[LOCAL_GUIDE.md](../LOCAL_GUIDE.md) memuat credential runtime, seed, key per-device, simulator, backup dan pengujian. [REVIEW_REPORT.md](../REVIEW_REPORT.md) adalah sumber status/evidence terbaru.

Route: home, login, register, dashboard, alerts, reports, settings, profile. Mode API memakai session/CSRF; mode demo browser hanya melalui tindakan eksplisit saat API tidak tersedia. Command tetap SIMULASI. File service worker hanya menyimpan shell publik yang diizinkan, bukan respons API atau credential.

Library GSAP/Three existing berada di assets/vendor dan dimuat sesuai kebutuhan. Mobile/reduced motion/WebGL gagal memakai fallback HTML/SVG. Tidak ada proses build atau CDN wajib untuk membuka aplikasi.

Runner browser: `python web/tests/verify_frontend_fixes.py` dari root. Runtime test terpisah dari database/browser pengguna. Detail skrip arsip: [tests/README.md](tests/README.md).
