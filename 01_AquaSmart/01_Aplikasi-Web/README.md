# AquaSmart AIoT — aplikasi lokal

Jalankan dari Windows PowerShell:

```powershell
Set-Location C:\Testing-Project\backend
python server/run_local.py
```

Launcher mencetak akun admin/viewer dan key perangkat acak, membuat database baru, serta menjalankan PHP dan scheduler. Hentikan dengan Ctrl+C.

- [Panduan lokal](LOCAL_GUIDE.md): seed, simulator, ekspor, backup, pengujian.
- [Laporan dan matriks requirement](REVIEW_REPORT.md): status yang berlaku, evidence dan batasan.
- [Checkpoint](CHECKPOINT.md): titik stabil dan tindak lanjut sampai 16 September 2026.
- [Kontrak API](../../../backend/server/API.md).

Runtime API PHP dan dokumen root kompatibilitasnya sudah dipindah ke `../../../backend/`. Folder ini kini menyimpan firmware, perangkat keras, dan dokumen akademik AquaSmart. `05_Modern_UI_Frameworks`, `06_Meta_Frameworks`, `07_State_Management`, dan `Laporan_Praktikum_Modul_5_6_7` adalah contoh/arsip praktikum, tidak diimpor aplikasi aktif. Contoh tersebut belum merupakan aplikasi buildable: tidak ada package manifest, router lengkap, dan kontrak autentikasinya berbeda. Jangan memakai cookie contoh `session=authenticated`, placeholder API key, atau statistik praktikum sebagai integrasi aktual.

Semua kontrol perangkat saat ini SIMULASI. Bukti ESP32 fisik, kalibrasi, uptime, dan retensi enam bulan nyata belum tersedia. Backend PHP sudah tayang lewat HTTPS di Railway dan frontend Next.js di Vercel; tautan dan tanggal pemeriksaannya ada di README.md di root repo. Dokumen submission lama dipertahankan sebagai arsip, bukan bukti siap produksi.
