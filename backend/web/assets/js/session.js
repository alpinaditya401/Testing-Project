import { escapeHtml, qs } from './dom.js';
import { ApiError, ApiUnavailableError, apiRequest } from './api-client.js';
import { apiMode, applyServerUser, authenticated, currentDevice, loadState, saveState, SESSION_KEY, setApiMode,
         setAuthenticated, setCsrfToken, setState, state } from './state-store.js';
import { mapServerAlert, mapServerAuditLog, mapServerDevice, mapServerReading } from './server-mappers.js';
import { provenanceBadge, sourceCountsView, sourceNames } from './provenance.js';
import { toast } from './ui-overlay.js';

// Session lifecycle and the API/demo probe.
// The recovery path here is NOT the same as a lone setApiMode('demo') elsewhere:
// useDemoMode also clears the token, drops authenticated, wipes sessionStorage
// and reloads state. That difference predates this refactor and is kept.
// syncApiData fills state.devices before mapping alerts; mapServerAlert depends
// on that order, so the statements must not be reordered.
export async function loadDiagnostics() {
  const panel=qs('#raw-telemetry'); if (!panel) return;
  try {
    const result=await apiRequest(`/api/devices/${encodeURIComponent(currentDevice().id)}/telemetry`);
    if (!panel.isConnected) return;
    const rows=result.telemetry;
    const counts=Object.fromEntries(Object.keys(sourceNames).map(key=>[key,rows.filter(row=>row.provenance===key).length]));
    panel.innerHTML=sourceCountsView(counts)+(rows.length?`<div class="table-wrap" tabindex="0" role="region" aria-label="Telemetry mentah"><table><thead><tr><th>UTC / sesi</th><th>Sumber</th><th>Suhu / status</th><th>Turbidity ADC / mV / sensor mV</th><th>Mapping %</th><th>pH tanah ADC / mV</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${escapeHtml(row.created_at)}<br>${escapeHtml(row.source_session)}</td><td>${provenanceBadge(row.provenance)}</td><td>${row.temperature??'—'} / ${escapeHtml(row.temperature_status)}</td><td>${row.turbidity_adc??'—'} / ${row.turbidity_mv??'—'} / ${row.turbidity_sensor_mv??'—'}</td><td>${row.turbidity_mapping_percent??'—'}</td><td>${row.soil_ph_adc??'—'} / ${row.soil_ph_mv??'—'}</td></tr>`).join('')}</tbody></table></div>`:'<p>Belum ada telemetry mentah. Tidak ada nilai sensor yang dibuat otomatis.</p>');
  } catch(error) {if(panel.isConnected)panel.textContent=`Telemetry gagal dimuat: ${error.message}`;}
}

export function useDemoMode() {
  setApiMode('demo');
  setCsrfToken('');
  setAuthenticated(false);
  sessionStorage.removeItem(SESSION_KEY);
  setState(loadState());
}

export async function restoreSession() {
  try {
    const payload = await apiRequest('/api/auth/me');
    setApiMode('api');
    setAuthenticated(true);
    setCsrfToken(payload.csrf_token || '');
    sessionStorage.setItem(SESSION_KEY, 'true');
    applyServerUser(payload.user);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      setApiMode('api');
      setAuthenticated(false);
      setCsrfToken('');
      sessionStorage.removeItem(SESSION_KEY);
    } else if (error instanceof ApiUnavailableError) {
      useDemoMode();
    } else {
      setApiMode('api');
      setAuthenticated(false);
      setCsrfToken('');
      sessionStorage.removeItem(SESSION_KEY);
      toast(error.message || 'Layanan sesi gagal. Muat ulang untuk mencoba lagi.', 'warning');
    }
  }
  try {
    const thresholdsPayload = await apiRequest('/api/settings/thresholds');
    state.thresholds = {
      phMin: thresholdsPayload.thresholds.ph_min,
      phMax: thresholdsPayload.thresholds.ph_max,
      tempMin: thresholdsPayload.thresholds.temperature_min,
      tempMax: thresholdsPayload.thresholds.temperature_max,
      turbidityMax: thresholdsPayload.thresholds.turbidity_max
    };
  } catch (_) {}
  try {
    const me = await apiRequest('/api/auth/me');
    applyServerUser(me.user);
  } catch (_) {}
}

export async function syncCurrentDeviceData() {
  const device = currentDevice();
  if (apiMode !== 'api') return;
  if (!device) { state.readings = []; state.schedules = []; return; }
  const encodedId = encodeURIComponent(device.id);
  const [readingPayload, schedulePayload] = await Promise.all([
    apiRequest(`/api/devices/${encodedId}/readings?limit=36`),
    apiRequest(`/api/devices/${encodedId}/schedules`)
  ]);
  state.readings = readingPayload.readings.map(mapServerReading);
  state.schedules = schedulePayload.schedules;
}

export async function syncApiData() {
 if (apiMode !== 'api' || !authenticated) return;
 const activeId = currentDevice()?.id;
 const devicesPayload = await apiRequest('/api/devices');
 state.devices = devicesPayload.devices.map(mapServerDevice);
 const activeIndex = state.devices.findIndex(device => device.id === activeId);
 state.activeDevice = activeIndex >= 0 ? activeIndex : 0;
 await syncCurrentDeviceData();
 const [alertPayload, auditPayload] = await Promise.all([
   apiRequest('/api/alerts?limit=50'),
   apiRequest('/api/audit-logs?limit=50')
 ]);
 state.alerts = alertPayload.alerts.map(mapServerAlert);
 state.auditLogs = auditPayload.audit_logs.map(mapServerAuditLog);
 saveState();
 }
