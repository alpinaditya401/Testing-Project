// Pure formatting and numeric helpers. No application state, no DOM.
// sensorNumber returns an em dash for non-finite input; that placeholder is
// what the dashboard renders for a missing reading.
export function sensorNumber(value, decimals) { return Number.isFinite(value) ? value.toFixed(decimals) : '—'; }
export function initials(name) { return name.split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase(); }
export function average(rows, key) { return rows.reduce((sum, row) => sum + Number(row[key]), 0) / Math.max(rows.length, 1); }
export function formatTime(iso) { return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(new Date(iso)); }
export function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
export function random(min, max) { return Math.random() * (max - min) + min; }
