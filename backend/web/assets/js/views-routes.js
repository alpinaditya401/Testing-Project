import { icon } from './icons.js';
import { escapeHtml } from './dom.js';
import { average, formatTime, initials, sensorNumber } from './format.js';
import { apiMode, connectionLabel, currentDevice, state } from './state-store.js';
import { dataModeCopy, diagnosticPanel, provenanceBadge, rowSource, sourceCountsView, sourceNames } from './provenance.js';
import { appShell } from './shell-nav.js';
import { deviceEmptyState, qualityIssues, qualityRecommendations, readingStatus } from './views-dashboard.js';

// Markup for the signed-in routes: alerts, reports, settings, profile.
// The binders that drive these panels stay in app.js because they assign
// simulationTimer, which app.js still owns.
export function alertsPage() {
  return appShell('alerts', `<div class="page-heading"><p class="eyebrow">Rule-based monitoring</p><h1>Peringatan & Rekomendasi</h1><p>Kondisi di luar batas aman dan tindakan yang disarankan.</p></div><div class="content-grid"><section class="col-8 alert-list">${state.alerts.map(alert => `<article class="alert-item neu-card ${alert.level === 'critical' ? 'critical' : ''}"><div class="alert-icon">${icon(alert.level === 'info' ? 'check' : 'alert')}</div><div><h3>${escapeHtml(alert.title)} ${!alert.read ? '<span class="badge badge-warning badge-new">Baru</span>' : ''}</h3>${provenanceBadge(rowSource(alert))}<p>${escapeHtml(alert.message)}</p></div><time>${escapeHtml(alert.time)}</time></article>`).join('')}</section><aside class="col-4"><div class="settings-card neu-card"><h2>${icon('bulb')} Panduan Tindakan</h2><div class="recommendation"><div class="rec-head">pH terlalu rendah</div><p>Periksa sumber air, aerasi, dan lakukan koreksi bertahap. Hindari perubahan mendadak.</p></div><div class="recommendation"><div class="rec-head">Kekeruhan tinggi</div><p>Periksa sisa pakan, filter, dan sirkulasi. Kurangi pemberian pakan bila diperlukan.</p></div><button class="btn btn-primary mark-read-button" id="mark-read">${icon('check','icon-sm')} Tandai semua dibaca</button></div></aside></div>`);
}

function operationsPanels() {
  if (apiMode !== 'api') return '';
  const today = new Date().toISOString().slice(0,10);
  return `<section class="settings-card neu-card col-12"><h2>Observasi Pertumbuhan</h2><p>Catatan sampel manual; bukan hasil sensor atau prediksi AI. Tanggal pengamatan menggunakan UTC.</p>
    ${state.user.accessRole==='admin'?`<form class="settings-form" id="growth-form"><label for="growth-date">Tanggal pengamatan</label><input class="form-control" id="growth-date" type="date" value="${today}" required><label for="growth-weight">Berat sampel (gram, opsional)</label><input class="form-control" id="growth-weight" type="number" min="0.01" step="0.01"><label for="growth-length">Panjang sampel (cm, opsional)</label><input class="form-control" id="growth-length" type="number" min="0.01" step="0.01"><label for="growth-notes">Catatan pengamatan</label><textarea class="form-control" id="growth-notes" maxlength="2000"></textarea><button class="btn" type="submit">Simpan observasi</button></form>`:''}
    <div id="growth-list" class="table-wrap" aria-live="polite">Memuat observasi…</div></section>
    <section class="settings-card neu-card col-12"><h2>Status Perintah & Log Feeder</h2><p>Eksekusi simulator lokal, bukan bukti hardware. Pending: antre; delivered: dikirim; succeeded/failed: hasil simulator; timeout: tanpa ACK tepat waktu.</p><div id="command-list" class="table-wrap" aria-live="polite">Memuat perintah…</div></section>`;
}

function filteredExportPanel() {
  if (apiMode !== 'api') return '';
  return `<section class="settings-card neu-card col-12"><h2>Ekspor Data Berfilter</h2><p>Unduh data milik ruang budidaya ini. Batas 10.000 baris per berkas; minggu dimulai Senin. Label simulasi disertakan.</p>
    <form class="filter-bar" id="filtered-export-form">
      <label for="export-device">Perangkat<select class="select-shell" id="export-device" name="device_id">${state.devices.map(d=>`<option value="${escapeHtml(d.id)}" ${d.id===currentDevice().id?'selected':''}>${escapeHtml(d.name)}</option>`).join('')}</select></label>
      <label for="export-kind">Jenis data<select class="select-shell" id="export-kind" name="kind"><option value="readings">Pembacaan sensor</option><option value="alerts">Peringatan</option><option value="commands">Perintah aktuator</option><option value="feeding_logs">Log pakan selesai</option><option value="reports">Agregat laporan</option><option value="telemetry">Telemetry mentah (diagnostik)</option></select></label>
      <label for="export-date">Tanggal acuan (UTC)<input class="form-control" id="export-date" name="date" type="date" value="${new Date().toISOString().slice(0,10)}" min="0001-01-01" max="9999-12-31" required></label>
      <label for="export-period">Periode<select class="select-shell" id="export-period" name="period"><option value="day">Harian</option><option value="week">Mingguan</option><option value="month">Bulanan</option></select></label>
      <label for="export-format">Format<select class="select-shell" id="export-format" name="format"><option value="csv">CSV</option><option value="json">JSON</option></select></label>
      <button class="btn btn-primary" type="submit">Unduh data</button>
    </form><p id="filtered-export-status" role="status">Pilih filter untuk menyiapkan berkas.</p></section>`;
}

function calendarReportPanel() {
  if (apiMode !== 'api') return '<section class="settings-card neu-card col-12"><h2>Laporan kalender</h2><p>Mode demo / offline: laporan kalender server tidak tersedia. Riwayat simulasi di bawah bukan laporan kalender.</p></section>';
  return `<section class="settings-card neu-card col-12" id="calendar-report"><div class="panel-head"><div><h2>Laporan Kalender UTC</h2><p>Agregat harian seluruh sampel dalam periode. Minggu dimulai Senin.</p></div></div>
    <form class="filter-bar" id="calendar-form">
      <label for="calendar-device">Perangkat laporan<select class="select-shell" id="calendar-device">${state.devices.map(d => `<option value="${escapeHtml(d.id)}" ${d.id === currentDevice().id ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}</select></label>
      <label for="calendar-date">Tanggal acuan (UTC)<input class="form-control" type="date" id="calendar-date" value="${new Date().toISOString().slice(0,10)}" min="0001-01-01" max="9999-12-31" required></label>
      <label for="calendar-period">Periode<select class="select-shell" id="calendar-period"><option value="day">Harian</option><option value="week">Mingguan</option><option value="month">Bulanan</option></select></label>
      <button class="btn btn-primary" type="submit" id="calendar-submit">Tampilkan laporan</button>
    </form><div id="calendar-results" aria-live="polite"><p>Pilih perangkat, tanggal, dan periode lalu tampilkan laporan.</p></div></section>`;
}

export function calendarResults(report) {
  return `<p>UTC · ${escapeHtml(report.start_at)} sampai ${escapeHtml(report.end_at_exclusive)} (akhir tidak termasuk).</p>
    <p>Total sampel: ${report.total_samples} · Simulasi: ${report.simulation_samples} · Non-simulasi: ${report.non_simulation_samples}. Flag non-simulasi bukan bukti pengukuran hardware fisik.</p>
    ${sourceCountsView(report.source_counts)}
    ${report.groups.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Agregat harian UTC, geser untuk semua kolom"><table><thead><tr><th scope="col">Tanggal UTC</th><th scope="col">Sampel</th><th scope="col">Rata-rata pH</th><th scope="col">Rata-rata suhu °C</th><th scope="col">Rata-rata kekeruhan NTU</th><th scope="col">Simulasi</th><th scope="col">Non-simulasi</th></tr></thead><tbody>${report.groups.map(g => `<tr><td>${escapeHtml(g.day)}</td><td>${g.cnt}</td><td>${sensorNumber(g.ph_avg,2)}</td><td>${sensorNumber(g.temperature_avg,1)}</td><td>${sensorNumber(g.turbidity_avg,1)}</td><td>${g.simulation_samples}</td><td>${g.non_simulation_samples}${sourceCountsView(Object.fromEntries(Object.keys(sourceNames).map(key=>[key,g['source_'+key]])))}</td></tr>`).join('')}</tbody></table></div>` : '<p>Tidak ada sampel pada periode ini.</p>'}`;
}

export function reportsPage() {
  if (!currentDevice()) return appShell('reports', deviceEmptyState());
  const rows = state.readings.slice(-(state.reportLimit || 12)).reverse();
  const summaries = [['ph', 'pH', 2, ''], ['temp', 'Suhu', 1, '°C'], ['turbidity', 'Kekeruhan', 0, ' NTU']].map(([key,label,decimals,unit]) => {
    const value = rows.length ? average(rows, key) : null;
    return `<article class="summary-card neu-card col-4"><span>Rata-rata ${label}</span><strong>${sensorNumber(value, decimals)}${unit}</strong><small>${readingStatus(key, value)[0]} · ${rows.length} pembacaan</small></article>`;
  }).join('');
  const auditLogs = state.auditLogs || [];
  return appShell('reports', `<div class="dashboard-intro"><div><p class="eyebrow">Ringkasan operasi</p><h1>Laporan & Log Sistem</h1><p>${dataModeCopy()}.</p></div><button class="btn btn-primary" id="export-csv" ${rows.length ? '' : 'disabled'}>${icon('download','icon-sm')} Ekspor CSV pembacaan dimuat</button></div>
    <section class="content-grid">${summaries}
    <section class="settings-card neu-card col-12"><div class="panel-head"><div><h2>Riwayat Pembacaan Sensor</h2><p>Data terbatas pada pembacaan yang dimuat, bukan laporan bulanan lengkap.</p></div><div class="filter-bar"><label>Perangkat<select class="select-shell" id="report-device" aria-label="Perangkat">${state.devices.map((d,i)=>`<option value="${i}" ${i===state.activeDevice?'selected':''}>${escapeHtml(d.name)}</option>`).join('')}</select></label><label>Jumlah data<select class="select-shell" id="report-limit" aria-label="Jumlah data"><option value="12" ${state.reportLimit!==36?'selected':''}>12 terbaru</option><option value="36" ${state.reportLimit===36?'selected':''}>36 terbaru</option></select></label></div></div>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Riwayat sensor, geser untuk melihat semua kolom"><table><thead><tr><th>Waktu</th><th>pH</th><th>Suhu</th><th>Kekeruhan</th><th>Status</th><th>Sumber</th></tr></thead><tbody>${rows.length ? rows.map(r => `<tr><td>${formatTime(r.time)}</td><td>${sensorNumber(r.ph,2)}</td><td>${sensorNumber(r.temp,1)}°C</td><td>${sensorNumber(r.turbidity,0)} NTU</td><td>${qualityIssues(r).length ? 'Di luar batas' : 'Dalam batas'}</td><td>${provenanceBadge(rowSource(r))}</td></tr>`).join('') : '<tr><td colspan="6">Belum ada pembacaan sensor.</td></tr>'}</tbody></table></div></section>
    ${calendarReportPanel()}${filteredExportPanel()}${diagnosticPanel()}
    <section class="settings-card neu-card col-12"><h2>Log Aktuator & Audit Sistem</h2><p>Log perubahan state server; bukan bukti eksekusi atau ACK hardware.</p><div class="table-wrap" tabindex="0" role="region" aria-label="Audit sistem"><table><thead><tr><th>Waktu</th><th>Aksi</th><th>Detail</th></tr></thead><tbody>${auditLogs.length ? auditLogs.map(log=>`<tr><td>${escapeHtml(log.time)}</td><td>${provenanceBadge(rowSource(log))} ${escapeHtml(log.action)}</td><td>${escapeHtml(JSON.stringify(log.metadata))}</td></tr>`).join('') : '<tr><td class="audit-empty-row" colspan="3">Belum ada audit log.</td></tr>'}</tbody></table></div></section>${operationsPanels()}</section>`);
}

function workspacePanel() {
  if (apiMode !== 'api') return '';
  return `<section class="settings-card neu-card col-12"><h2>Ruang Budidaya</h2><p>${state.user.accessRole === 'viewer' ? 'Viewer — akses baca' : 'Admin — hanya ruang budidaya sendiri'}</p>
    ${state.user.accessRole === 'admin' ? `<form id="invite-form" class="settings-form"><label for="invite-contact">Undang viewer dengan email atau nomor WA</label><input class="form-control" id="invite-contact" required maxlength="254"><button class="btn" type="submit">Buat undangan</button><output id="invite-output" class="form-help" aria-live="polite"></output></form>` : ''}
    ${state.devices.length === 0 && state.user.accessRole === 'admin' ? `<form id="accept-invite-form" class="settings-form"><label for="invite-token">Kode undangan (berlaku 24 jam)</label><input class="form-control" id="invite-token" required pattern="[a-f0-9]{64}" autocomplete="off"><button class="btn" type="submit">Terima undangan viewer</button></form>` : ''}
    <div id="workspace-members" aria-live="polite"></div></section>`;
}

export function settingsPage() {
  const t = state.thresholds;
  return appShell('settings', `<div class="page-heading"><p class="eyebrow">Konfigurasi sistem</p><h1>Pengaturan</h1><p>Atur ambang kualitas air dan identitas perangkat.</p></div><div class="content-grid"><section class="settings-card neu-card col-7"><h2>${icon('gauge')} Ambang Batas Kualitas Air</h2><form class="settings-form" id="threshold-form"><div class="threshold-row"><div><label for="parameter-ph">Parameter</label><input class="form-control" id="parameter-ph" value="pH Air" readonly></div><div><label for="ph-min">Minimum</label><input class="form-control" id="ph-min" type="number" step="0.1" value="${t.phMin}" required></div><div><label for="ph-max">Maksimum</label><input class="form-control" id="ph-max" type="number" step="0.1" value="${t.phMax}" required></div></div><div class="threshold-row"><div><label for="parameter-temperature">Parameter</label><input class="form-control" id="parameter-temperature" value="Suhu Air (°C)" readonly></div><div><label for="temp-min">Minimum</label><input class="form-control" id="temp-min" type="number" step="0.1" value="${t.tempMin}" required></div><div><label for="temp-max">Maksimum</label><input class="form-control" id="temp-max" type="number" step="0.1" value="${t.tempMax}" required></div></div><div class="threshold-row"><div><label for="parameter-turbidity">Parameter</label><input class="form-control" id="parameter-turbidity" value="Kekeruhan (NTU)" readonly></div><div class="threshold-wide"><label for="turbidity-max">Batas maksimum</label><input class="form-control" id="turbidity-max" type="number" step="1" value="${t.turbidityMax}" required></div></div><p class="form-help">Perubahan threshold memengaruhi status kartu sensor dan peringatan. Bukan pemicu otomatis feeder.</p><button class="btn btn-primary" type="submit">${icon('check','icon-sm')} Simpan Threshold</button></form></section><aside class="settings-card neu-card col-5"><h2>${icon('server')} Informasi Sistem</h2><div class="info-list"><div class="info-row"><span>Versi aplikasi</span><b>AquaSmart v1.0 Prototype</b></div><div class="info-row"><span>Mode data</span><b>${connectionLabel()}</b></div><div class="info-row"><span>Interval pembaruan dashboard</span><b>${apiMode==='api'?'15 detik':'5 detik (demo)'}</b></div><div class="info-row"><span>Transport target</span><b>REST HTTPS/JSON</b></div><div class="info-row"><span>PWA</span><b>${navigator.serviceWorker?.controller?'Shell offline tersedia':'Menunggu service worker'}</b></div></div><div class="warning-box system-note">${icon('alert','icon-sm')}<span>Prototype ini tidak mengirim perintah ke hardware sungguhan. Integrasi produksi wajib memakai backend tervalidasi dan autentikasi aman.</span></div></aside><section class="settings-card neu-card col-12"><h2>${icon('wifi')} Perangkat Terdaftar</h2><div class="table-wrap"><table><thead><tr><th>Device ID</th><th>Nama</th><th>Lokasi</th><th>Status</th><th>Sinyal</th></tr></thead><tbody>${state.devices.map(d => `<tr><td>${escapeHtml(d.id)}</td><td>${escapeHtml(d.name)}</td><td>${escapeHtml(d.location)}</td><td><span class="badge">${d.online ? 'Online' : 'Offline'}</span></td><td>Belum diukur</td></tr>`).join('')}</tbody></table></div></section>${workspacePanel()}</div>`);
}

export function profilePage() {
  return appShell('profile', `<div class="page-heading"><p class="eyebrow">Akun pengguna</p><h1>Profil Saya</h1><p>Informasi pengguna prototype AquaSmart.</p></div><div class="content-grid"><section class="profile-hero neu-card col-5"><div class="profile-avatar">${initials(state.user.name)}</div><h2>${escapeHtml(state.user.name)}</h2><p>${escapeHtml(state.user.role)}</p><button class="btn btn-primary" id="edit-profile">${icon('edit','icon-sm')} Edit Profil</button></section><section class="settings-card neu-card col-7"><h2>${icon('user')} Informasi Akun</h2><div class="info-list"><div class="info-row"><span>Nama lengkap</span><b>${escapeHtml(state.user.name)}</b></div><div class="info-row"><span>Username</span><b>${escapeHtml(state.user.username)}</b></div><div class="info-row"><span>Nomor telepon</span><b>${escapeHtml(state.user.phone)}</b></div><div class="info-row"><span>Role</span><b>${escapeHtml(state.user.role)}</b></div><div class="info-row"><span>Perangkat dikelola</span><b>${state.devices.length} perangkat</b></div><div class="info-row"><span>Password</span><b>••••••••••••</b></div></div></section></div>`);
}
