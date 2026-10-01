import { icon } from './icons.js';
import { apiMode } from './state-store.js';

// Public pages: landing, login, register.
// The markup carries an id contract with binders that live elsewhere
// (#open-demo, #login-form, #toggle-password, #register-form and friends).
// Renaming an id here silently breaks a querySelector in another module.
// brand, featureCard and networkCard stay private: their only callers are the
// three page functions in this module.
function brand() {
  return `<span class="brand"><img src="assets/images/logo.svg" alt=""><span>AquaSmart<small>AIoT Monitoring</small></span></span>`;
}

export function landingPage() {
  return `
    <div class="public-page">
      <nav class="public-nav" aria-label="Navigasi utama">
        <div class="container">
          <a class="brand" href="#/home"><img src="assets/images/logo.svg" alt="Logo AquaSmart"><span>AquaSmart<small>AIoT Monitoring</small></span></a>
          <div class="public-actions">
            <a class="btn btn-sm" href="#/home" data-scroll="fitur">Fitur</a>
            <a class="btn btn-primary btn-sm" href="#/login">Masuk Dashboard ${icon('arrow', 'icon-sm')}</a>
          </div>
        </div>
      </nav>

      <main id="main-content">
        <div class="hero-band">
          <header class="hero container">
            <div class="hero-copy-block">
              <p class="eyebrow">AKUAKULTUR CERDAS, KEPUTUSAN LEBIH CEPAT</p>
              <h1>Kualitas air terjaga. Budidaya lebih tenang.</h1>
              <p class="hero-copy">AquaSmart AIoT memantau pH, suhu, dan kekeruhan air secara real-time — serta membantu mengatur aerator dan pemberian pakan dari satu dashboard.</p>
              <div class="hero-actions">
                <a class="btn btn-primary" href="#/login">Buka Dashboard ${icon('arrow', 'icon-sm')}</a>
                <button class="btn" id="open-demo" type="button">${icon('play', 'icon-sm')} Lihat Demo Sistem</button>
              </div>
              <div class="hero-note"><span class="pulse" aria-hidden="true"></span> Prototype mode aktif — data simulasi aman untuk demonstrasi</div>
            </div>
            <div class="hero-visual" aria-label="Visualisasi tabung sampel air dengan pembacaan pH, suhu, dan kekeruhan">
              <div class="water-sample-stage" id="water-sample-stage" data-ph="7.1" data-temperature="28.4" data-turbidity="42">
                <div class="tube-grid" aria-hidden="true"></div>
                <canvas id="water-sample-canvas" aria-hidden="true"></canvas>
                <img class="water-static-fallback" src="assets/images/water-sample-static.svg" alt="Tabung sampel air dengan partikel kekeruhan">
                <div class="tube-label tube-label-ph"><strong data-tube-value="ph">pH 7.1</strong><span>Keasaman air</span></div>
                <div class="tube-label tube-label-temp"><strong data-tube-value="temperature">28.4°C</strong><span>Suhu air</span></div>
                <div class="tube-label tube-label-ntu"><strong data-tube-value="turbidity">42 NTU</strong><span>Kekeruhan</span></div>
              </div>
            </div>
          </header>
        </div>

        <section class="landing-section compact-section" id="fitur">
          <div class="container">
            <div class="section-head section-head-actions">
              <div>
                <p class="eyebrow">DASHBOARD TERPADU</p>
                <h2>Pemantauan Real-Time</h2>
                <p>Kualitas air terjaga dari satu titik kontrol.</p>
              </div>
              <button class="btn btn-primary" id="open-demo-features" type="button"><span>${icon('play', 'icon-sm')}</span>Lihat Demo Sistem</button>
            </div>
            <div class="live-readout-panel">
              <div class="readout-heading"><div><p class="eyebrow">STATUS AIR</p><h2>Pembacaan Langsung</h2></div><p>Satu panel readout untuk tiga instrumen utama.</p></div>
              <article class="readout-gauge gauge-ph">
                <span class="readout-gauge-label">PH AIR</span>
                <div class="gauge-arc" aria-hidden="true"><span class="gauge-fill"></span></div>
                <div class="sensor-value">7.1<small>pH</small></div>
                <span class="gauge-status">Dalam batas aman</span>
              </article>
              <article class="readout-gauge gauge-temp">
                <span class="readout-gauge-label">SUHU AIR</span>
                <div class="gauge-arc" aria-hidden="true"><span class="gauge-fill"></span></div>
                <div class="sensor-value">28.4<small>°C</small></div>
                <span class="gauge-status">Stabil</span>
              </article>
              <article class="readout-gauge gauge-turbidity warning">
                <span class="readout-gauge-label">KEKERUHAN</span>
                <div class="gauge-arc" aria-hidden="true"><span class="gauge-fill"></span></div>
                <div class="sensor-value">42<small>NTU</small></div>
                <span class="gauge-status">Perlu dipantau</span>
              </article>
            </div>
          </div>
        </section>

        <section class="landing-section white-island" id="jaringan-sistem">
          <div class="container">
            <div class="section-head"><p class="eyebrow">JARINGAN SISTEM</p><h2 class="section-title">Dari kolam ke keputusan</h2></div>
            <div class="system-flow">
              <svg class="system-flow-svg" viewBox="0 0 1000 100" aria-hidden="true">
                <path id="system-flow-path" d="M40 52 C210 8 280 92 500 52 S790 8 960 52"></path>
                <circle id="system-flow-dot" cx="40" cy="52" r="5"></circle>
              </svg>
              <div class="network-grid">
                ${networkCard(1, 'Perangkat Kolam', 'ESP32, sensor pH, suhu, dan turbidity')}
                ${networkCard(2, 'REST API', 'Telemetri tervalidasi dan tersimpan aman')}
                ${networkCard(3, 'Dashboard Anda', 'Monitoring dan kontrol dari perangkat apa pun')}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer class="main-footer"><div class="container"><div class="footer-grid"><div><a class="brand" href="#/home"><img src="assets/images/logo.svg" alt=""><span>AquaSmart<small>AIoT Monitoring</small></span></a><p>Prototype monitoring kualitas air dan otomasi akuakultur skala kecil.</p></div><div><h4>Tautan</h4><div class="footer-links"><a href="#/home" data-scroll="fitur">Fitur</a><button class="footer-link-button" id="open-demo-footer" type="button">Live Demo</button><a href="#/login">Dashboard</a></div></div><div><h4>Tim Proyek</h4><p>Alpin Aditya Pratama<br>Dimas Aryo Sejati</p></div></div><div class="copyright">© 2026 AquaSmart AIoT. Prototype akademik — data yang tampil merupakan simulasi.</div></div></footer>
    </div>`;
}

function featureCard(iconName, title, copy) { return `<article class="feature-card neu-card"><div class="feature-icon">${icon(iconName, 'icon-lg')}</div><h3>${title}</h3><p>${copy}</p></article>`; }
function networkCard(step, title, copy) { return `<article class="network-card neu-card"><div class="step">${step}</div><h3>${title}</h3><p>${copy}</p></article>`; }

export function loginPage() {
  return `
    <main class="auth-page" id="main-content" tabindex="-1">
      <section class="auth-form-side">
        <div class="auth-card neu-card">
          <a class="brand auth-brand" href="#/home"><img src="assets/images/logo.svg" alt="Logo AquaSmart"><span>AquaSmart<small>AIoT Monitoring</small></span></a>
          <h1>Selamat datang kembali</h1>
          <p>Masuk untuk memantau kualitas air dan perangkat budidaya Anda.</p>
          <form class="form-stack" id="login-form" novalidate>
            <div class="field"><label for="username">Username</label><div class="input-shell">${icon('user', 'icon-sm')}<input id="username" name="username" autocomplete="username" placeholder="Masukkan username" required></div></div>
            <div class="field"><label for="password">Password</label><div class="input-shell">${icon('lock', 'icon-sm')}<input id="password" name="password" type="password" autocomplete="current-password" placeholder="Masukkan password" required><button class="btn-ghost" type="button" id="toggle-password" aria-label="Tampilkan password">${icon('eye', 'icon-sm')}</button></div></div>
            <div class="auth-error" id="login-error" role="alert">Username atau password tidak sesuai.</div>
            <button class="btn btn-primary" type="submit">${icon('lock', 'icon-sm')} Masuk Dashboard</button>
          </form>
          <p class="auth-switch">Belum punya akun? <a href="#/register">Buat akun di sini</a></p>
          <div class="demo-note"><b>${apiMode === 'api' ? 'Autentikasi server aktif' : 'Backend tidak tersedia'}</b><br><span>${apiMode === 'api' ? 'Masukkan akun yang dikonfigurasi pada server lokal.' : 'Mode demo hanya memakai data simulasi di browser dan tidak mengakses database.'}</span>${apiMode === 'demo' ? '<button class="btn btn-sm demo-mode-button" type="button" id="demo-mode-button">Buka Mode Demo</button>' : ''}</div>
          <a class="back-link" href="#/home">← Kembali ke halaman utama</a>
        </div>
      </section>
      <section class="auth-visual" aria-hidden="true"><div class="auth-visual-content"><p class="eyebrow auth-eyebrow">Monitoring tanpa menebak</p><h2>Rawat ekosistem air dengan data yang mudah dipahami.</h2><p>Parameter penting, kontrol aktuator, peringatan, dan histori tersedia dalam satu alur kerja.</p><div class="auth-stat-row"><div class="auth-stat"><b>3</b><span>parameter air</span></div><div class="auth-stat"><b>≤60s</b><span>target peringatan</span></div><div class="auth-stat"><b>Lokal</b><span>mode prototipe</span></div></div></div></section>
    </main>`;
}

export function registerPage() {
  return `
    <main class="auth-page" id="main-content" tabindex="-1">
      <section class="auth-form-side">
        <div class="auth-card">
          <a class="brand auth-brand" href="#/home"><img src="assets/images/logo.svg" alt="Logo AquaSmart"><span>AquaSmart<small>AIoT Monitoring</small></span></a>
          <h1>Buat akun AquaSmart</h1>
          <p>Siapkan akses monitoring sekarang. Perangkat dapat dihubungkan saat daftar atau nanti dari Pengaturan.</p>
          <form class="form-stack" id="register-form" novalidate>
            <div class="field">
              <label for="register-name">Nama Lengkap</label>
              <div class="input-shell">${icon('user', 'icon-sm')}<input id="register-name" name="name" type="text" autocomplete="name" placeholder="Nama sesuai identitas" aria-describedby="register-name-error" maxlength="100" required></div>
              <div class="field-error" id="register-name-error" role="alert">Isi nama lengkap, maksimal 100 karakter.</div>
            </div>
            <div class="field">
              <label for="register-contact">Email atau No. WhatsApp</label>
              <div class="input-shell">${icon('wifi', 'icon-sm')}<input id="register-contact" name="contact" type="text" autocomplete="email" inputmode="email" placeholder="email@contoh.com atau 08xxxxxxxxxx" aria-describedby="register-contact-error" required></div>
              <div class="field-error" id="register-contact-error" role="alert">Format email atau nomor WA belum sesuai.</div>
            </div>
            <div class="field">
              <label for="register-password">Password</label>
              <div class="input-shell">${icon('lock', 'icon-sm')}<input id="register-password" name="password" type="password" autocomplete="new-password" placeholder="Minimal 8 karakter" aria-describedby="register-password-error" required minlength="8"><button class="btn-ghost" type="button" data-toggle-password="register-password" aria-label="Tampilkan password">${icon('eye', 'icon-sm')}</button></div>
              <div class="field-error" id="register-password-error" role="alert">Password minimal 8 karakter.</div>
            </div>
            <div class="field">
              <label for="register-password-confirmation">Konfirmasi Password</label>
              <div class="input-shell">${icon('lock', 'icon-sm')}<input id="register-password-confirmation" name="password_confirmation" type="password" autocomplete="new-password" placeholder="Ulangi password" aria-describedby="register-confirmation-error" required><button class="btn-ghost" type="button" data-toggle-password="register-password-confirmation" aria-label="Tampilkan password">${icon('eye', 'icon-sm')}</button></div>
              <div class="field-error" id="register-confirmation-error" role="alert">Password dan konfirmasi belum sama.</div>
            </div>
            <div class="field">
              <div class="serial-label-row"><label for="register-serial">Serial Number Alat (opsional)</label><button class="tooltip-trigger" type="button" aria-label="Informasi serial number" aria-describedby="serial-tooltip">${icon('info', 'icon-sm')}</button><div class="tooltip-copy" id="serial-tooltip" role="tooltip">Isi kalau kamu sudah punya perangkat AquaSmart terdaftar. Bisa ditambahkan nanti dari Pengaturan.</div></div>
              <div class="input-shell">${icon('server', 'icon-sm')}<input id="register-serial" name="serial_number" type="text" autocomplete="off" placeholder="Kosongkan jika belum punya perangkat"></div>
            </div>
            <div class="auth-error" id="register-error" role="alert"></div>
            <button class="btn btn-primary" type="submit">${icon('user', 'icon-sm')} Buat Akun</button>
          </form>
          <p class="auth-switch">Sudah punya akun? <a href="#/login">Masuk di sini</a></p>
          <a class="back-link" href="#/home">← Kembali ke halaman utama</a>
        </div>
      </section>
      <section class="auth-visual" aria-hidden="true"><div class="auth-visual-content"><p class="eyebrow auth-eyebrow">AKUN UNTUK SATU EKOSISTEM AIR</p><h2>Mulai dari data. Hubungkan alat saat Anda siap.</h2><p>Akun tetap bisa dibuat tanpa perangkat. Serial AquaSmart dapat ditambahkan kemudian tanpa kehilangan histori profil.</p><div class="auth-stat-row"><div class="auth-stat"><b>3</b><span>parameter air</span></div><div class="auth-stat"><b>1</b><span>dashboard terpadu</span></div><div class="auth-stat"><b>Lokal</b><span>mode prototipe</span></div></div></div></section>
    </main>`;
}
