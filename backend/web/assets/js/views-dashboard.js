import { icon } from './icons.js';
import { escapeHtml } from './dom.js';
import { formatTime, sensorNumber } from './format.js';
import { apiMode, connectionLabel, currentDevice, state } from './state-store.js';
import { dataModeCopy, provenanceBadge, rowSource } from './provenance.js';
import { appShell } from './shell-nav.js';

// Dashboard markup.
// The emitted attributes are a contract with the binders: metricCard writes
// data-live-value, controlCard writes the switch ids, scheduleList writes the
// delete-button aria-labels. Renaming any of them breaks a querySelector
// elsewhere with no load-time error.
export function readingStatus(kind, value) {
  if (!Number.isFinite(value)) return ['Belum ada data', 'muted'];
  const t = state.thresholds;
  if (kind === 'ph') return value >= t.phMin && value <= t.phMax ? ['Aman', 'text-success'] : ['Di luar batas', 'text-danger'];
  if (kind === 'temp') return value >= t.tempMin && value <= t.tempMax ? ['Stabil', 'text-success'] : ['Perlu tindakan', 'text-danger'];
  return value <= t.turbidityMax ? ['Dalam batas', 'text-success'] : ['Tinggi', 'text-danger'];
}

export function qualityIssues(d) {
  if (!d) return [];
  return [['ph', 'pH', d.ph], ['temp', 'Suhu', d.temp], ['turbidity', 'Kekeruhan', d.turbidity]]
    .filter(([kind, , value]) => readingStatus(kind, value)[1] === 'text-danger');
}
export function qualitySummary(d) {
  if (![d.ph, d.temp, d.turbidity].every(Number.isFinite)) return '<div class="alert-banner">Belum ada pembacaan lengkap. Status kualitas air belum dapat dinilai.</div>';
  const issues = qualityIssues(d);
  return issues.length ? `<div class="alert-banner">${icon('alert')}<div><strong>Di luar batas:</strong> ${issues.map(([, label]) => label).join(', ')}. Periksa pembacaan dan ambang yang dikonfigurasi.</div></div>` : '<p class="quality-normal">Semua parameter terukur berada dalam batas yang dikonfigurasi.</p>';
}
export function qualityRecommendations(d) {
  const issues = qualityIssues(d);
  const advice = { ph: 'Periksa sensor pH dan sumber air. Hindari koreksi mendadak.', temp: 'Periksa suhu dan sirkulasi air sebelum tindakan.', turbidity: 'Periksa sisa pakan, filter, dan sirkulasi air.' };
  return provenanceBadge(rowSource(d)) + (issues.length ? issues.map(([kind, label]) => `<div class="recommendation"><div class="rec-head text-danger">${label} di luar batas</div><p>${advice[kind]}</p></div>`).join('') : `<div class="recommendation"><p>${[d.ph, d.temp, d.turbidity].every(Number.isFinite) ? 'Lanjutkan pemantauan berkala. Tidak ada pelanggaran ambang pada pembacaan terakhir.' : 'Tunggu pembacaan sensor sebelum mengambil keputusan kualitas air.'}</p></div>`) + '<a class="rec-action" href="#/reports">Tinjau histori →</a>';
}
function metricCard(kind, iconName, label, value, unit, range, className) {
  const status = readingStatus(kind, value === '—' ? null : Number(value));
  return `<article class="metric-card neu-card ${className}"><div class="metric-head"><div class="metric-icon">${icon(iconName)}</div><span class="metric-status ${status[1]}">${status[0]}</span></div><div class="metric-label">${label}</div><div class="metric-value" data-live-value="${kind}">${value}<small>${unit}</small></div><div class="metric-range">Batas acuan: ${range}</div></article>`;
}

export function dashboardPage() {
  const d = currentDevice();
  if (!d) return appShell('dashboard', deviceEmptyState());
  return appShell('dashboard', `
    <section class="dashboard-intro">
      <div>
        <p class="eyebrow">${escapeHtml(d.location)}</p>
        <h1>Kualitas Air</h1>
        <p>Data terakhir diperbarui <span id="last-updated">${d.lastSeen ? formatTime(d.lastSeen) : (apiMode === 'api' ? 'belum tersedia' : 'simulasi browser')}</span> · <span id="data-source-copy">${dataModeCopy()}</span></p>
        <button class="btn btn-primary btn-sm demo-dashboard-btn" type="button"><span>${icon('play', 'icon-sm')}</span>Lihat Demo Sistem</button>
      </div>
      <div class="device-tabs" role="tablist">${state.devices.map((device, i) => `<button class="device-tab ${i === state.activeDevice ? 'active' : ''}" data-device="${i}" role="tab" aria-selected="${i === state.activeDevice}">${escapeHtml(device.name)}</button>`).join('')}</div>
    </section>
    <div id="quality-summary">${qualitySummary(d)}</div>
    <section class="metrics-grid" aria-label="Metrik kualitas air">
      ${metricCard('ph', 'droplet', 'pH Air', sensorNumber(d.ph, 1), 'pH', `${state.thresholds.phMin}–${state.thresholds.phMax}`, 'metric-ph')}
      ${metricCard('temp', 'thermometer', 'Suhu Air', sensorNumber(d.temp, 1), '°C', `${state.thresholds.tempMin}–${state.thresholds.tempMax}°C`, 'metric-temp')}
      ${metricCard('turbidity', 'waves', 'Kekeruhan', sensorNumber(d.turbidity, 0), 'NTU', `≤ ${state.thresholds.turbidityMax} NTU`, 'metric-turbidity')}
      <article class="metric-card neu-card metric-device"><div class="metric-head"><div class="metric-icon">${icon('wifi')}</div><span class="metric-status ${d.online ? 'text-success' : 'text-danger'}">${d.online ? 'Online' : 'Offline'}</span></div><div class="metric-label">Status Perangkat</div><div class="metric-value metric-value-device">${d.online ? 'Terhubung' : 'Terputus'}</div><div class="metric-range">${escapeHtml(d.id)} · ${connectionLabel()}</div></article>
    </section>

    <section class="dashboard-two">
      <div class="panel neu-card"><div class="panel-head"><div class="panel-title">${icon('power')}<div><h2>Kontrol Aktuator</h2><p>Manual dan otomatis</p></div></div><span class="badge">Perangkat aktif</span></div><div class="control-grid">
        ${controlCard('aerator', 'wind', 'Aerator', 'Meningkatkan sirkulasi dan oksigen air.', d.aerator)}
        <article class="control-card"><div class="control-top"><div class="metric-icon control-icon">${icon('feeder')}</div><span class="badge ${d.feeder ? '' : 'badge-warning'}" id="feeder-status">${apiMode==='api' ? 'Lihat log simulator' : d.feeder ? 'Aktif' : 'Siap'}</span></div><h3>Feeder</h3><p>Jalankan motor pakan selama 8 detik.</p><button class="btn btn-primary btn-sm quick-feed" id="feed-now">${icon('power','icon-sm')} Beri Pakan</button></article>
        ${controlCard('auto', 'robot', 'Mode Otomatis', 'Jadwal simulator berjalan saat scheduler lokal aktif.', d.auto)}
      </div></div>
      <aside class="panel neu-card"><div class="panel-head"><div class="panel-title">${icon('bulb')}<div><h2>Rekomendasi</h2><p>Berdasarkan kondisi terbaru</p></div></div></div><div id="quality-recommendations">${qualityRecommendations(d)}</div></aside>
    </section>

    <section class="panel neu-card chart-panel"><div class="panel-head"><div class="panel-title">${icon('chart')}<div><h2>Data History</h2><p>Pembacaan terbaru yang tersedia</p></div></div><div class="chart-legend"><span class="legend-item"><i class="legend-dot legend-ph"></i>pH</span><span class="legend-item"><i class="legend-dot legend-temp"></i>Suhu</span><span class="legend-item"><i class="legend-dot legend-turbidity"></i>Kekeruhan</span></div></div><div class="chart-wrap"><canvas id="history-chart" role="img" aria-label="Grafik histori pH, suhu dan kekeruhan"></canvas></div></section>

    <section class="panel neu-card scheduler"><div class="panel-head"><div class="panel-title">${icon('calendar')}<div><h2>Jadwal Pakan</h2><p>Feeder terjadwal untuk ${escapeHtml(d.name)}</p></div></div><span class="badge">${state.schedules.filter(s => s.active).length} jadwal aktif</span></div><div class="scheduler-grid"><div><h3 class="scheduler-subtitle">Jadwal Aktif</h3><div class="schedule-list">${scheduleList()}</div></div><div><h3 class="scheduler-subtitle">Tambah Jadwal Baru</h3><form class="schedule-form" id="schedule-form"><div class="time-row"><div><label for="schedule-time">Waktu pemberian pakan</label><input id="schedule-time" type="time" value="12:00" required></div><div><label for="schedule-duration">Durasi feeder (detik)</label><input id="schedule-duration" type="number" min="1" max="30" value="8" required></div></div><div><label for="schedule-days">Pengulangan</label><select id="schedule-days" class="form-control"><option>Setiap hari</option><option value="Senin - Jumat">Senin–Jumat</option><option>Akhir pekan</option></select></div><button class="btn btn-primary" type="submit">${icon('plus','icon-sm')} Tambah Jadwal</button></form></div></div></section>`);
}

export function deviceEmptyState() {
  return `<section class="device-empty-state neu-card"><div class="empty-state-mark">${icon('server', 'icon-lg')}</div><p class="eyebrow">BELUM ADA PERANGKAT</p><h1>Hubungkan alat pertama Anda</h1><p>Akun sudah aktif, tetapi belum ada serial AquaSmart yang terhubung. Tambahkan perangkat dari Pengaturan saat alat tersedia.</p><a class="btn btn-primary" href="#/settings">Buka Pengaturan ${icon('arrow', 'icon-sm')}</a></section>`;
}

function controlCard(key, iconName, title, copy, checked) {
  return `<article class="control-card"><div class="control-top"><div class="metric-icon control-icon">${icon(iconName)}</div><label class="switch"><input type="checkbox" data-control="${key}" ${checked ? 'checked' : ''} aria-label="Aktifkan ${title}"><span></span></label></div><h3>${title}</h3><p>${copy}</p><div class="rec-action" id="${key}-status">${apiMode==='api' ? 'Permintaan' : 'Status'}: ${checked ? 'Aktif' : 'Nonaktif'}</div></article>`;
}

function scheduleList() {
  if (!state.schedules.length) return '<div class="schedule-empty">Belum ada jadwal pakan.</div>';
  return state.schedules.map(s => `<div class="schedule-item"><div class="schedule-time">${icon('clock','icon-sm')}<div><b>${escapeHtml(s.time)} · ${s.duration} detik</b><small>${escapeHtml(s.days)}</small></div></div><button class="btn icon-btn btn-sm" data-delete-schedule="${s.id}" aria-label="Hapus jadwal ${escapeHtml(s.time)}">${icon('trash','icon-sm')}</button></div>`).join('');
}
