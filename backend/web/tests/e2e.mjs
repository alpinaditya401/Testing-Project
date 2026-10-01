import fs from 'node:fs/promises';

const testUsername = process.env.AQUASMART_TEST_USERNAME;
const testPassword = process.env.AQUASMART_TEST_PASSWORD;
if (!testUsername || !testPassword) throw new Error('Set AQUASMART_TEST_USERNAME and AQUASMART_TEST_PASSWORD for integrated E2E.');

const tabs = await (await fetch('http://localhost:9222/json')).json();
const tab = tabs.find(item => item.type === 'page' && item.url.startsWith('http://localhost:8080'));
if (!tab) throw new Error('AquaSmart tab not found on CDP port 9222');

const ws = new WebSocket(tab.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  message.error ? reject(new Error(message.error.message)) : resolve(message.result);
});
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, awaitPromise = true) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Evaluation failed');
  return result.result?.value;
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(expression, label, timeout = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await wait(100);
  }
  throw new Error(`Timed out: ${label}`);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await evaluate(`localStorage.removeItem('aquasmart-prototype-v1'); sessionStorage.clear()`);
await send('Page.reload', { ignoreCache: true });
await waitFor(`document.readyState === 'complete'`, 'fresh application reload');
await evaluate(`location.hash = '#/login'`);
await waitFor(`document.querySelector('#login-form')`, 'login form');

// Invalid credentials must stay on login and expose an error.
await evaluate(`(() => {
  document.querySelector('#username').value = 'invalid';
  document.querySelector('#password').value = 'invalid';
  document.querySelector('#login-form').requestSubmit();
})()`);
await wait(120);
assert(await evaluate(`document.querySelector('#login-error').classList.contains('show')`), 'invalid login shows validation error');

// Valid login must open the dashboard.
await evaluate(`(() => {
  document.querySelector('#username').value = ${JSON.stringify(testUsername)};
  document.querySelector('#password').value = ${JSON.stringify(testPassword)};
  document.querySelector('#login-form').requestSubmit();
})()`);
await waitFor(`location.hash === '#/dashboard' && document.querySelector('#history-chart')`, 'dashboard after login');
const dashboardText = await evaluate(`document.body.innerText`);
for (const label of ['Kualitas Air', 'pH Air', 'Suhu Air', 'Kekeruhan', 'Kontrol Aktuator', 'Jadwal Pakan']) {
  assert(dashboardText.includes(label), `dashboard contains ${label}`);
}

// Controls must persist state.
const priorAerator = await evaluate(`document.querySelector('[data-control="aerator"]').checked`);
await evaluate(`document.querySelector('[data-control="aerator"]').click()`);
await wait(80);
assert(await evaluate(`document.querySelector('[data-control="aerator"]').checked`) !== priorAerator, 'aerator switch changes state');

// Schedule creation must re-render and show the new time.
await evaluate(`(() => {
  document.querySelector('#schedule-time').value = '12:15';
  document.querySelector('#schedule-duration').value = '6';
  document.querySelector('#schedule-form').requestSubmit();
})()`);
await waitFor(`document.body.innerText.includes('12:15 · 6 detik')`, 'new schedule');
assert(true, 'feeding schedule can be created');

// Every protected page must render its core content.
const routes = [
  ['alerts', 'Panduan Tindakan'],
  ['reports', 'Riwayat Pembacaan Sensor'],
  ['settings', 'Ambang Batas Kualitas Air'],
  ['profile', 'Informasi Akun']
];
for (const [route, label] of routes) {
  await evaluate(`location.hash = '#/${route}'`);
  await waitFor(`document.body.innerText.includes(${JSON.stringify(label)})`, `${route} page`);
  assert(true, `${route} route renders ${label}`);
}

// Returning to dashboard must restore its canvas and state.
await evaluate(`location.hash = '#/dashboard'`);
await waitFor(`document.querySelector('#history-chart')`, 'dashboard return');

// Desktop screenshot.
await send('Emulation.setDeviceMetricsOverride', { width: 1365, height: 900, deviceScaleFactor: 1, mobile: false });
await wait(150);
let shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await fs.mkdir('tests/screenshots', { recursive: true });
await fs.writeFile('tests/screenshots/dashboard-desktop.png', Buffer.from(shot.data, 'base64'));

// Mobile layout must not overflow the viewport.
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await wait(180);
const overflow = await evaluate(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
assert(overflow <= 1, `mobile page has no horizontal overflow (delta ${overflow}px)`);
shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await fs.writeFile('tests/screenshots/dashboard-mobile.png', Buffer.from(shot.data, 'base64'));

// Public route and section-scroll hooks must exist.
await evaluate(`location.hash = '#/home'`);
await waitFor(`document.querySelector('[data-scroll="fitur"]')`, 'public landing page');
assert(await evaluate(`document.querySelectorAll('[data-scroll]').length >= 4`), 'landing section links use router-safe scroll hooks');

console.log('E2E VERIFICATION PASSED');
ws.close();
