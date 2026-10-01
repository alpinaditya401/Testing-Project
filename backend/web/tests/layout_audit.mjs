const tabs = await (await fetch('http://localhost:9222/json')).json();
const tab = tabs.find(item => item.type === 'page' && item.url.startsWith('http://localhost:8080'));
if (!tab) throw new Error('AquaSmart tab not found');

const ws = new WebSocket(tab.webSocketDebuggerUrl);
let id = 1;
const pending = new Map();
ws.addEventListener('message', event => {
  const data = JSON.parse(event.data);
  if (!data.id || !pending.has(data.id)) return;
  const task = pending.get(data.id);
  pending.delete(data.id);
  data.error ? task.reject(new Error(data.error.message)) : task.resolve(data.result);
});
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const requestId = id++;
  pending.set(requestId, { resolve, reject });
  ws.send(JSON.stringify({ id: requestId, method, params }));
});
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

await send('Page.enable');
await send('Runtime.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.reload', { ignoreCache: true });
await wait(300);
await evaluate(`sessionStorage.setItem('aquasmart-session', 'true')`);

const viewports = [
  { name: 'desktop', width: 1365, height: 900, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true }
];
const routes = ['home', 'login', 'dashboard', 'alerts', 'reports', 'settings', 'profile'];
let failures = 0;

for (const viewport of viewports) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile
  });
  for (const route of routes) {
    if (route === 'login') await evaluate(`sessionStorage.removeItem('aquasmart-session')`);
    else await evaluate(`sessionStorage.setItem('aquasmart-session', 'true')`);
    await evaluate(`location.hash = '#/${route}'`);
    await wait(120);
    const audit = await evaluate(`(() => {
      const vw = document.documentElement.clientWidth;
      const visible = element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const identify = element => element.id || element.getAttribute('aria-label') || (element.innerText || element.tagName).trim().slice(0, 45);
      const outside = [...document.querySelectorAll('body *')].filter(visible).filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > vw + 1;
      }).filter(element => !element.closest('.sidebar') && !element.closest('.table-wrap'))
        .slice(0, 10).map(identify);
      const clippedText = [...document.querySelectorAll('h1,h2,h3,p,span,b,small,button,a,label')]
        .filter(visible)
        .filter(element => element.scrollWidth > element.clientWidth + 2 && getComputedStyle(element).overflow !== 'visible')
        .slice(0, 10).map(identify);
      const smallTargets = [...document.querySelectorAll('button,input[type=checkbox],a.btn,.nav-link')]
        .filter(visible)
        .map(element => ({ name: identify(element), w: Math.round(element.getBoundingClientRect().width), h: Math.round(element.getBoundingClientRect().height) }))
        .filter(item => item.w < 40 || item.h < 40)
        .slice(0, 20);
      return {
        overflow: document.documentElement.scrollWidth - vw,
        outside,
        clippedText,
        smallTargets
      };
    })()`);
    const hardFailure = audit.overflow > 1 || audit.outside.length || audit.clippedText.length;
    if (hardFailure) failures++;
    console.log(JSON.stringify({ viewport: viewport.name, route, ...audit }));
  }
}

ws.close();
if (failures) {
  console.error(`LAYOUT AUDIT FAILED (${failures} route/view combinations)`);
  process.exit(1);
}
console.log('LAYOUT AUDIT PASSED');
