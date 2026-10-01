// Application state and its persistence. `state` is REASSIGNED wholesale by
// setState (demo-mode reset replaces the object, it does not merge), so importers
// must read the live binding. Destructuring it at module scope would freeze a
// stale object and silently break the reset.

export const APP_KEY = 'aquasmart-prototype-v1';
export const SESSION_KEY = 'aquasmart-session';

const defaults = {
  activeDevice: 0,
  user: { name: 'Alpin Aditya', username: 'aquasmart', role: 'Pembudidaya / Admin', phone: '08xx-xxxx-2650' },
  devices: [
    { id: 'AQS-KOLAM-01', name: 'Kolam Lele 1', location: 'Area Budidaya Utama', ph: 7.1, temp: 28.4, turbidity: 42, online: true, aerator: true, feeder: false, auto: true },
    { id: 'AQS-AQUA-02', name: 'Bak Aquaponik', location: 'Greenhouse Timur', ph: 6.8, temp: 27.8, turbidity: 35, online: true, aerator: false, feeder: false, auto: true }
  ],
  thresholds: { phMin: 6.5, phMax: 8.5, tempMin: 25, tempMax: 30, turbidityMax: 50 },
  schedules: [
    { id: 1, time: '07:00', duration: 8, days: 'Setiap hari', active: true },
    { id: 2, time: '16:30', duration: 8, days: 'Setiap hari', active: true }
  ],
  alerts: [
    { id: 1, level: 'warning', title: 'Kekeruhan mendekati ambang batas', message: 'Kolam Lele 1 tercatat 42 NTU. Periksa sirkulasi dan sisa pakan.', time: 'Hari ini, 10:18', read: false },
    { id: 2, level: 'info', title: 'Jadwal pakan berhasil dijalankan', message: 'Feeder Kolam Lele 1 aktif selama 8 detik.', time: 'Hari ini, 07:00', read: true },
    { id: 3, level: 'critical', title: 'pH sempat di bawah batas aman', message: 'Bak Aquaponik menyentuh pH 6.3 dan kembali stabil setelah aerasi.', time: 'Kemarin, 21:40', read: true }
  ],
  readings: [],
  auditLogs: []
};

function seedReadings() {
  const now = Date.now();
  return Array.from({ length: 18 }, (_, i) => ({
    time: new Date(now - (17 - i) * 5 * 60000).toISOString(),
    ph: +(7 + Math.sin(i / 3) * .18 + (i % 3) * .02).toFixed(2),
    temp: +(28.1 + Math.sin(i / 4) * .65).toFixed(1),
    turbidity: Math.round(36 + Math.cos(i / 3) * 6 + i * .25)
  }));
}

export function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(APP_KEY));
    const state = parsed?.mode === 'demo' ? { ...defaults, ...parsed } : structuredClone(defaults);
    state.readings = Array.isArray(state.readings) && state.readings.length ? state.readings : seedReadings();
    return state;
  } catch (_) {
    const state = structuredClone(defaults);
    state.readings = seedReadings();
    return state;
  }
}

export let state = loadState();

export function setState(next) {
  state = next;
}

// Transport mode: 'checking' until the session probe resolves, then 'api' or
// 'demo'. Read in 50 places, so importers must use the live binding rather than
// snapshotting it at module scope.
export let apiMode = 'checking';

export function setApiMode(next) {
  apiMode = next;
}

// Read-only views over the state this module owns.
export function connectionLabel() { return apiMode === 'api' ? 'API lokal' : 'Mode demo'; }
export function currentDevice() { return state.devices[state.activeDevice] || state.devices[0]; }

// Session flags. Kept as two separate bindings, and the setters are called in
// the same order the assignments used to run, so the brief window where
// authenticated is already false while csrfToken still holds a value is
// preserved exactly as it was.
export let authenticated = false;
export let csrfToken = '';

export function setAuthenticated(next) {
  authenticated = next;
}

export function setCsrfToken(next) {
  csrfToken = next;
}

// Fold the server's user payload into state, keeping existing values as fallback.
export function applyServerUser(user) {
  if (!user) return;
  state.user = {
    id: user.id,
    accessRole: user.role,
    workspaceOwnerId: user.workspace_owner_id,
    name: user.name || state.user.name,
    username: user.username || state.user.username,
    role: user.role === 'admin' ? 'Pembudidaya / Admin' : (user.role || state.user.role),
    phone: user.phone || user.contact || state.user.phone,
    contact: user.contact || user.phone || state.user.contact || ''
  };
}

export function saveState() {
  if (apiMode !== 'demo') { localStorage.removeItem(APP_KEY); return; }
  localStorage.setItem(APP_KEY, JSON.stringify({ ...state, mode: 'demo' }));
}

export function isAuthed() { return authenticated; }
