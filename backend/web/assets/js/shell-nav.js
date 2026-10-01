import { icon } from './icons.js';
import { app, escapeHtml } from './dom.js';
import { initials } from './format.js';
import { apiMode, connectionLabel, currentDevice, state } from './state-store.js';

// App shell: sidebar drawer and the signed-in chrome.
// `link` is a local helper inside sidebar(), not a module binding.
// pageMeta is exported: render() in app.js reads it for the topbar title.
export const pageMeta = {
  dashboard: ['DASHBOARD KUALITAS AIR', 'Pemantauan real-time'],
  alerts: ['PERINGATAN & REKOMENDASI', 'Status kualitas air'],
  reports: ['LAPORAN & LOG SISTEM', 'Analitik operasional'],
  settings: ['PENGATURAN SISTEM', 'Threshold dan perangkat'],
  profile: ['PROFIL PENGGUNA', 'Informasi akun']
};

function sidebar(active) {
  const unread = state.alerts.filter(a => !a.read).length;
  const link = (path, label, iconName, count = '') => `<a class="nav-link ${active === path ? 'active' : ''}"${active === path ? ' aria-current="page"' : ''} href="#/${path}">${icon(iconName)}<span>${label}</span>${count ? `<span class="nav-count">${count}</span>` : ''}</a>`;
  return `
    <div class="drawer-overlay" id="drawer-overlay"></div>
    <aside class="sidebar" id="sidebar" aria-label="Menu aplikasi">
      <div class="sidebar-head"><a class="brand" href="#/dashboard"><img src="assets/images/logo.svg" alt=""><span>AquaSmart<small>AIoT Monitoring</small></span></a><button class="btn icon-btn" id="close-sidebar" aria-label="Tutup menu">${icon('close')}</button></div>
      <nav class="sidebar-nav">
        <div class="sidebar-label">Monitoring</div>
        <a class="nav-link" href="units.html">${icon('wifi')}<span>Unit Aquaponik & Aktivasi</span></a>
        ${link('dashboard', 'Dashboard Kualitas Air', 'gauge')}
        ${link('alerts', 'Peringatan & Rekomendasi', 'bell', unread)}
        ${link('reports', 'Laporan & Log', 'report')}
        <div class="sidebar-label">Akun & Sistem</div>
        ${link('settings', 'Pengaturan', 'settings')}
        ${link('profile', 'Profil', 'user')}
        <span class="sidebar-spacer"></span>
        <button class="nav-link" id="logout-button" type="button">${icon('logout')}<span>Keluar</span></button>
      </nav>
      <div class="sidebar-user"><div class="avatar">${initials(state.user.name)}</div><div><b>${escapeHtml(state.user.name)}</b><span>${escapeHtml(state.user.role)}</span></div></div>
    </aside>`;
}

export function appShell(active, content) {
  const meta = pageMeta[active] || pageMeta.dashboard;
  return `
    <div class="app-shell">
      ${sidebar(active)}
      <header class="app-topbar"><div class="topbar-inner"><button class="btn icon-btn" id="open-sidebar" aria-label="Buka menu">${icon('menu')}</button><div class="page-ident"><b>${meta[0]}</b><span>${meta[1]}</span></div><div class="topbar-right"><span class="badge" data-connection-mode="${apiMode}">${connectionLabel()}</span><div class="weather">${icon('wifi', 'icon-sm')}<span>${currentDevice()?.online ? 'Perangkat online' : 'Perangkat offline'}</span></div></div></div></header>
      <main class="app-main" id="main-content" tabindex="-1">${content}</main>
    </div>`;
}
