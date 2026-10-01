import { apiMode, currentDevice, state } from './state-store.js';

// Provenance labels for telemetry rows.
// sourceNames must stay a single object owned here: Object.keys order drives
// both the badge counts and the CSV column order, so a second copy elsewhere
// would be a different object with its own ordering.
// loadDiagnostics stays in app.js for now; it needs apiRequest, which still
// depends on csrfToken living there.
export const sourceNames = {simulation:'Simulation', device:'Device', manual:'Manual', seed:'Seed', legacy_unverified:'Legacy / belum diketahui'};
export function provenanceBadge(source) {
  const key = Object.hasOwn(sourceNames, source) ? source : 'legacy_unverified';
  return `<span class="badge provenance-badge" data-provenance="${key}">${sourceNames[key]}</span>`;
}
export function rowSource(row) { return apiMode === 'api' ? (row?.provenance || 'legacy_unverified') : 'simulation'; }
export function sourceCountsView(counts) {
  return `<div class="provenance-counts">${Object.keys(sourceNames).map(key=>`<span>${provenanceBadge(key)} <strong>${Number(counts?.[key] || 0)}</strong></span>`).join('')}</div>`;
}
export function diagnosticPanel() {
  return apiMode !== 'api' ? '' : `<section class="settings-card neu-card col-12"><h2>Diagnostik telemetry mentah</h2><p>PLACEHOLDER SENSOR TANAH, BUKAN pH AIR TERKALIBRASI. Mapping turbidity bukan NTU.</p><div id="raw-telemetry" role="status">Memuat telemetry...</div></section>`;
}

export function dataModeCopy() {
  if (apiMode !== 'api') return 'Data simulasi tersimpan di browser';
  if (!Number.isFinite(currentDevice()?.ph)) return 'Belum ada pembacaan sensor';
  const sources=[...new Set(state.readings.map(row=>rowSource(row)))];
  return `Sumber data: ${sources.map(key=>sourceNames[key]).join(', ') || sourceNames[rowSource(currentDevice())]}. Bukan validasi hardware atau kalibrasi`;
}
