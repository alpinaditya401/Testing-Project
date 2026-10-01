import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9224;
const APP_PORT = 8095;
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const SCREENSHOTS_DIR = resolve('web/tests/screenshots');
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const userDataDir = join(tmpdir(), `edge-cdp-${Date.now()}`);
mkdirSync(userDataDir, { recursive: true });

console.log(`Starting isolated PHP test server on port ${APP_PORT}...`);
const php = spawn('php', ['-S', `127.0.0.1:${APP_PORT}`, '-t', 'web', 'server/router.php'], {
  env: {
    ...process.env,
    AQUASMART_APP_ENV: 'test',
    AQUASMART_DB_PATH: join(userDataDir, 'test.sqlite'),
    AQUASMART_SESSION_SECURE: '0',
    AQUASMART_SEED_USERNAME: 'aquasmart',
    AQUASMART_SEED_PASSWORD: 'AquasmartPassword123!',
    AQUASMART_DEVICE_KEY: 'test-device-key-mock'
  },
  cwd: resolve('.')
});

let edge = null;
const cleanup = () => {
  try { edge?.kill?.(); } catch (_) {}
  try { php?.kill?.(); } catch (_) {}
  try { rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
};
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

const wait = ms => new Promise(r => setTimeout(r, ms));

// 1. Wait for PHP server
let serverReady = false;
for (let i = 0; i < 30; i++) {
  try {
    const res = await fetch(`${APP_URL}/api/health`);
    if (res.ok) { serverReady = true; break; }
  } catch (_) {}
  await wait(200);
}
if (!serverReady) {
  cleanup();
  throw new Error('PHP test server failed to start on port ' + APP_PORT);
}
console.log('PHP server ready and healthy.');

// 2. Launch headless Edge
console.log('Launching headless Edge on CDP port', CDP_PORT);
edge = spawn(EDGE_PATH, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  `${APP_URL}/#/home`
]);

let tabs = null;
for (let i = 0; i < 30; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
    tabs = await res.json();
    if (tabs && tabs.length) break;
  } catch (_) {}
  await wait(200);
}
if (!tabs || !tabs.length) {
  cleanup();
  throw new Error('Failed to connect to Edge CDP');
}

const pageTab = tabs.find(t => t.type === 'page');
const wsUrl = pageTab.webSocketDebuggerUrl;
console.log('Connected to Edge page tab:', pageTab.id);

const ws = new WebSocket(wsUrl);
let nextId = 1;
const pending = new Map();
const consoleErrors = [];

ws.addEventListener('message', event => {
  const data = JSON.parse(event.data);
  if (data.method === 'Runtime.exceptionThrown') {
    const desc = data.params.exceptionDetails?.exception?.description || data.params.exceptionDetails?.text;
    consoleErrors.push(desc);
  }
  if (!data.id || !pending.has(data.id)) return;
  const { resolve, reject } = pending.get(data.id);
  pending.delete(data.id);
  data.error ? reject(new Error(data.error.message)) : resolve(data.result);
});

await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function setViewport(width, height, isMobile = false) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: isMobile
  });
  await wait(150);
}

async function captureScreenshot(filename) {
  const result = await send('Page.captureScreenshot', { format: 'png' });
  const buffer = Buffer.from(result.data, 'base64');
  const filePath = join(SCREENSHOTS_DIR, filename);
  writeFileSync(filePath, buffer);
  console.log(`  [Screenshot saved] ${filename}`);
  return filePath;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');

const results = [];
function check(testName, condition, detail = '') {
  const pass = Boolean(condition);
  results.push({ testName, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${testName} ${detail ? '(' + detail + ')' : ''}`);
  if (!pass) throw new Error(`Assertion failed: ${testName} - ${detail}`);
}

try {
  // Test 1: Landing Page Desktop (1440x1024)
  console.log('\n--- 1. Testing Landing Page (Desktop 1440x1024) ---');
  await setViewport(1440, 1024);
  await send('Page.navigate', { url: `${APP_URL}/#/home` });
  await wait(800);

  const landingChecks = await evaluate(`(() => {
    const heading = document.querySelector('h1')?.textContent;
    const readout = document.querySelector('.live-readout-panel');
    const openDemoBtn = document.querySelector('#open-demo');
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    return {
      heading,
      hasReadout: Boolean(readout),
      hasDemoBtn: Boolean(openDemoBtn),
      overflow
    };
  })()`);

  check('Landing heading loaded', landingChecks.heading?.includes('Kualitas air terjaga'));
  check('Landing readout panel present', landingChecks.hasReadout);
  check('Landing no horizontal overflow (1440px)', landingChecks.overflow <= 1, `overflow: ${landingChecks.overflow}`);
  await captureScreenshot('actual_landing_desktop.png');

  // Test 2: Landing Page Mobile (390x844)
  console.log('\n--- 2. Testing Landing Page (Mobile 390x844) ---');
  await setViewport(390, 844, true);
  await wait(300);

  const mobileLandingChecks = await evaluate(`(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const staticFallback = document.querySelector('.water-static-fallback');
    return { overflow, hasFallback: Boolean(staticFallback) };
  })()`);

  check('Landing no horizontal overflow (390px)', mobileLandingChecks.overflow <= 1, `overflow: ${mobileLandingChecks.overflow}`);
  await captureScreenshot('actual_landing_mobile.png');

  // Test 3: Demo Storyboard Modal & Accessibility
  console.log('\n--- 3. Testing Demo Storyboard Modal & Accessibility ---');
  await setViewport(1024, 768);
  await evaluate(`document.querySelector('#open-demo').click()`);
  await wait(400);

  const modalState1 = await evaluate(`(() => {
    const dialog = document.querySelector('.demo-dialog');
    const app = document.querySelector('#app');
    const title = document.querySelector('#demo-title')?.textContent;
    const frameTitle = document.querySelector('#demo-frame-title')?.textContent;
    const frameCaption = document.querySelector('#demo-frame-caption')?.textContent;
    const isAppAriaHidden = app.getAttribute('aria-hidden') === 'true';
    const isAppInert = app.hasAttribute('inert');
    const tabs = [...document.querySelectorAll('[data-demo-tab]')].map(t => t.textContent.trim());
    const width = dialog ? Math.round(dialog.getBoundingClientRect().width) : 0;
    return {
      isOpen: Boolean(dialog),
      title,
      frameTitle,
      frameCaption,
      isAppAriaHidden,
      isAppInert,
      tabs,
      width
    };
  })()`);

  check('Demo dialog opened', modalState1.isOpen);
  check('Background #app aria-hidden is true', modalState1.isAppAriaHidden);
  check('Background #app has inert attribute', modalState1.isAppInert);
  check('Frame 1 title is Baca Sensor', modalState1.frameTitle === 'Baca Sensor', modalState1.frameTitle);
  check('Has Kekeruhan Air & Pakan Otomatis tabs', modalState1.tabs.includes('Kekeruhan Air') && modalState1.tabs.includes('Pakan Otomatis'));
  check('Desktop modal is compact (<=960px)', modalState1.width <= 960, `width: ${modalState1.width}`);
  await captureScreenshot('actual_demo_modal_desktop.png');

  // Switch to Pakan Otomatis tab and go to Frame 4 ("Feeder Bekerja")
  console.log('  Testing tab switch to Pakan Otomatis & Frame 4 Feeder Bekerja...');
  await evaluate(`(() => {
    const feedTab = document.querySelector('[data-demo-tab="feeding"]');
    feedTab.click();
  })()`);
  await wait(200);

  // Jump to frame 4 (0-indexed 3)
  await evaluate(`document.querySelector('[data-frame-jump="3"]').click()`);
  await wait(300);

  const frame4State = await evaluate(`(() => {
    const frameTitle = document.querySelector('#demo-frame-title')?.textContent;
    return { frameTitle };
  })()`);
  check('Frame 4 caption exact Feeder Bekerja', frame4State.frameTitle === 'Feeder Bekerja', frame4State.frameTitle);

  // Test Escape key closes modal & returns focus
  console.log('  Testing Escape key dismiss & return focus...');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
  await wait(300);

  const postCloseState = await evaluate(`(() => {
    const dialog = document.querySelector('.demo-dialog');
    const app = document.querySelector('#app');
    const active = document.activeElement?.id;
    return {
      isOpen: Boolean(dialog),
      isAppAriaHidden: app.getAttribute('aria-hidden'),
      focusedId: active
    };
  })()`);

  check('Demo dialog closed via Escape', !postCloseState.isOpen);
  check('Background #app aria-hidden removed', postCloseState.isAppAriaHidden === null);
  check('Focus returned to trigger #open-demo', postCloseState.focusedId === 'open-demo', `active: ${postCloseState.focusedId}`);

  // Test 4: Login & Register Pages
  console.log('\n--- 4. Testing Login & Register Pages ---');
  await setViewport(1440, 1024);
  await evaluate(`location.hash = '#/login'`);
  await wait(300);
  const loginOverflow = await evaluate(`document.documentElement.scrollWidth - window.innerWidth`);
  check('Login no overflow (1440px)', loginOverflow <= 1);
  await captureScreenshot('actual_login_desktop.png');

  await setViewport(390, 844, true);
  await wait(200);
  const loginMobileOverflow = await evaluate(`document.documentElement.scrollWidth - window.innerWidth`);
  check('Login no overflow (390px)', loginMobileOverflow <= 1);
  await captureScreenshot('actual_login_mobile.png');

  await setViewport(1440, 1024);
  await evaluate(`location.hash = '#/register'`);
  await wait(300);
  const registerChecks = await evaluate(`(() => {
    const title = document.querySelector('h1')?.textContent;
    const form = document.querySelector('#register-form');
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    return { title, hasForm: Boolean(form), overflow };
  })()`);
  check('Register page title', registerChecks.title?.includes('Buat akun'));
  check('Register no overflow (1440px)', registerChecks.overflow <= 1);
  await captureScreenshot('actual_register_desktop.png');

  // Submit registration form with valid contact
  const testContact = `petani_${Date.now()}@aquasmart.id`;
  console.log(`  Submitting registration form for live session (${testContact})...`);
  await evaluate(`(() => {
    document.querySelector('#register-name').value = 'Alpin Aditya';
    document.querySelector('#register-contact').value = '${testContact}';
    document.querySelector('#register-password').value = 'PasswordRahasia123!';
    document.querySelector('#register-password-confirmation').value = 'PasswordRahasia123!';
    document.querySelector('#register-form').dispatchEvent(new Event('submit', { cancelable: true }));
  })()`);
  await wait(1200);

  // Test 5: Dashboard Operations (1440px, 1024px, 756px, 390px)
  console.log('\n--- 5. Testing Dashboard Operations Across Viewports ---');
  const viewportsToTest = [
    { name: 'desktop', w: 1440, h: 1024, mobile: false },
    { name: 'laptop', w: 1024, h: 768, mobile: false },
    { name: 'tablet', w: 756, h: 1024, mobile: false },
    { name: 'mobile', w: 390, h: 844, mobile: true }
  ];

  for (const vp of viewportsToTest) {
    await setViewport(vp.w, vp.h, vp.mobile);
    await wait(300);
    const dCheck = await evaluate(`(() => {
      const title = document.querySelector('h1')?.textContent;
      const overflow = document.documentElement.scrollWidth - window.innerWidth;
      const metricCards = document.querySelectorAll('.metric-card').length;
      return { title, overflow, metricCards };
    })()`);
    check(`Dashboard rendered on ${vp.name} (${vp.w}px)`, dCheck.title?.includes('Kualitas Air') || dCheck.title?.includes('Hubungkan alat'), dCheck.title);
    check(`Dashboard no overflow on ${vp.name} (${vp.w}px)`, dCheck.overflow <= 1, `overflow: ${dCheck.overflow}`);
    await captureScreenshot(`actual_dashboard_${vp.name}_${vp.w}px.png`);
  }

  // Test 6: Feeder Modal & Focus Trapping (if device present, or test Logout modal)
  console.log('\n--- 6. Testing Dialog Modal & Focus Trapping ---');
  await setViewport(1440, 1024);
  await evaluate(`(() => {
    const btn = document.querySelector('#logout-button');
    btn?.focus();
    btn?.click();
  })()`);
  await wait(300);

  const modalCheck = await evaluate(`(() => {
    const dialog = document.querySelector('.modal-card');
    const title = document.querySelector('#modal-title')?.textContent;
    const confirm = document.querySelector('#modal-confirm');
    const isFocused = document.activeElement === confirm;
    const appAria = document.querySelector('#app').getAttribute('aria-hidden');
    return {
      isOpen: Boolean(dialog),
      title,
      isFocused,
      appAria
    };
  })()`);

  check('Confirmation modal opened', modalCheck.isOpen);
  check('Confirmation modal confirm button focused', modalCheck.isFocused);
  check('App marked aria-hidden', modalCheck.appAria === 'true');
  await captureScreenshot('actual_modal_confirm.png');

  // Close modal via Escape
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
  await wait(200);

  const postModalClose = await evaluate(`(() => {
    const dialog = document.querySelector('.modal-card');
    const active = document.activeElement?.id;
    return { isOpen: Boolean(dialog), active };
  })()`);
  check('Modal closed via Escape', !postModalClose.isOpen);
  check('Focus returned to #logout-button trigger', postModalClose.active === 'logout-button', `active: ${postModalClose.active}`);

  // Test 7: Alerts, Reports, Settings, Profile Pages
  console.log('\n--- 7. Testing Alerts, Reports, Settings, Profile ---');
  const otherRoutes = ['alerts', 'reports', 'settings', 'profile'];
  for (const r of otherRoutes) {
    await evaluate(`location.hash = '#/${r}'`);
    await wait(350);
    const rCheck = await evaluate(`(() => {
      const overflow = document.documentElement.scrollWidth - window.innerWidth;
      const h1 = document.querySelector('h1')?.textContent;
      return { overflow, h1 };
    })()`);
    check(`Route ${r} loaded`, Boolean(rCheck.h1), rCheck.h1);
    check(`Route ${r} no overflow (1440px)`, rCheck.overflow <= 1, `overflow: ${rCheck.overflow}`);
    await captureScreenshot(`actual_${r}_desktop.png`);

    // Test mobile for each route
    await setViewport(390, 844, true);
    await wait(200);
    const rMobile = await evaluate(`document.documentElement.scrollWidth - window.innerWidth`);
    check(`Route ${r} no overflow (390px)`, rMobile <= 1, `overflow: ${rMobile}`);
    await captureScreenshot(`actual_${r}_mobile.png`);
    await setViewport(1440, 1024);
  }

  // Test 8: Profile Edit Modal & Accessibility
  console.log('\n--- 8. Testing Profile Edit Modal ---');
  await evaluate(`location.hash = '#/profile'`);
  await wait(200);
  await evaluate(`(() => {
    const btn = document.querySelector('#edit-profile');
    btn?.focus();
    btn?.click();
  })()`);
  await wait(300);

  const profileModalCheck = await evaluate(`(() => {
    const dialog = document.querySelector('.modal-card');
    const title = document.querySelector('#edit-title')?.textContent;
    const nameInput = document.querySelector('#edit-name');
    const isFocused = document.activeElement === nameInput;
    const appAria = document.querySelector('#app').getAttribute('aria-hidden');
    return { isOpen: Boolean(dialog), title, isFocused, appAria };
  })()`);

  check('Profile edit modal opened', profileModalCheck.isOpen);
  check('Profile edit title is Edit Profil', profileModalCheck.title === 'Edit Profil');
  check('First field is focused', profileModalCheck.isFocused);
  check('App marked aria-hidden', profileModalCheck.appAria === 'true');
  await captureScreenshot('actual_profile_modal.png');

  // Close via Escape
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
  await wait(200);

  const postProfileClose = await evaluate(`(() => {
    const dialog = document.querySelector('.modal-card');
    const active = document.activeElement?.id;
    return { isOpen: Boolean(dialog), active };
  })()`);
  check('Profile modal closed via Escape', !postProfileClose.isOpen);
  check('Focus returned to #edit-profile trigger', postProfileClose.active === 'edit-profile', `active: ${postProfileClose.active}`);

  // Test 9: Console Errors
  console.log('\n--- 9. Checking Console Exceptions ---');
  console.log('Logged runtime errors:', consoleErrors.length);
  check('Zero console exceptions during test', consoleErrors.length === 0, consoleErrors.join('; '));

  console.log('\n========================================');
  console.log(`ALL E2E BROWSER CHECKS PASSED (${results.length} checks)`);
  console.log('========================================\n');

} finally {
  ws.close();
  cleanup();
}
