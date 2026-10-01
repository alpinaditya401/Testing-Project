import { formatTime } from './format.js';
import { state } from './state-store.js';

// Shape server payloads into the objects the views expect.
// alertTitle stays module private: nothing outside these mappers calls it.
export function mapServerDevice(device) {
  const reading = device.latest_reading || {};
  return {
    id: device.id,
    name: device.name,
    location: device.location,
    ph: reading.ph == null ? null : Number(reading.ph),
    temp: reading.temperature == null ? null : Number(reading.temperature),
    turbidity: reading.turbidity == null ? null : Number(reading.turbidity),
    online: Boolean(device.online),
    aerator: Boolean(device.aerator),
    feeder: Boolean(device.feeder),
    auto: Boolean(device.auto),
    lastSeen: device.last_seen || reading.created_at || null,
    provenance: reading.provenance || 'legacy_unverified', source_session: reading.source_session || null,
    simulation: Boolean(reading.simulation)
  };
}

export function mapServerReading(reading) {
  return {
    time: reading.time,
    ph: Number(reading.ph),
    temp: Number(reading.temperature),
    turbidity: Number(reading.turbidity),
    provenance: reading.provenance || 'legacy_unverified', source_session: reading.source_session || null,
    simulation: Boolean(reading.simulation)
  };
}

function alertTitle(alert) {
  if (alert.severity === 'critical') return 'Kondisi air membutuhkan tindakan';
  if (alert.severity === 'warning') return 'Parameter kualitas air perlu dipantau';
  return 'Aktivitas sistem selesai';
}

export function mapServerAlert(alert) {
  const device = state.devices.find(item => item.id === alert.device_id);
  return {
    id: Number(alert.id),
    deviceId: alert.device_id,
    level: alert.severity, provenance: alert.provenance,
    title: alertTitle(alert),
    message: `${device?.name || alert.device_id} · ${alert.source || 'UNVERIFIED'} · ${alert.message}`,
    time: formatTime(alert.created_at),
    read: Boolean(alert.acknowledged)
  };
}

export function mapServerAuditLog(log) {
  return {
    id: Number(log.id),
    action: log.action, provenance: log.provenance,
    metadata: log.metadata || {},
    time: formatTime(log.created_at)
  };
}
