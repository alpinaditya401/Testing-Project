# Dependency lokal

File upstream dipertahankan utuh, termasuk header lisensi.

| Library | Versi | Ukuran | Pemakaian |
|---|---|---:|---|
| GSAP | 3.12.5 | 72,214 byte | Lazy-load saat demo dibuka tanpa reduced motion; transisi frame |
| Three.js | 0.160.1 | 669,884 byte | Lazy-load pada landing dengan visual sampel air, lebar minimal 760 px, tanpa reduced motion |

Keduanya sudah digunakan proyek sebelum revisi melalui CDN. Revisi menyimpan versi yang sama secara lokal; tidak menambah framework/build system. ScrollTrigger yang tidak digunakan dihapus dari HTML. Font memakai fallback lokal tanpa Google Fonts request.

Asal: paket npm pada jsDelivr, `gsap@3.12.5/dist/gsap.min.js` dan `three@0.160.1/build/three.min.js`. Lisensi Three.js: `THREE-LICENSE.txt` (MIT). GSAP menyertakan copyright dan tautan [standard license](https://gsap.com/standard-license) dalam header; paket versi ini tidak menyediakan file `LICENSE` atau `LICENSE.md` pada CDN. Jangan menghapus header tersebut.

Library tidak dimasukkan ke precache PWA agar shell tetap kecil; offline memakai SVG/HTML dan timer native jika library belum dimuat. Berkas Three.js cukup besar, sehingga rute login/dashboard tidak memuatnya. Profil FPS perangkat fisik belum dijalankan.
