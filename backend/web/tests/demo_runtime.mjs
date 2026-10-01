const tabs = await (await fetch('http://127.0.0.1:9333/json')).json();
const tab = tabs.find(item => item.type === 'page' && item.url.startsWith('http://127.0.0.1:8080'));
if (!tab) throw new Error('AquaSmart tab not found on CDP port 9222');

const ws = new WebSocket(tab.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const runtimeErrors = [];
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') {
    runtimeErrors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'Unknown runtime exception');
  }
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
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Evaluation failed');
  }
  return result.result?.value;
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(expression, label, timeout = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await wait(100);
  }
  throw new Error(`Timed out: ${label}\nRuntime errors:\n${runtimeErrors.join('\n') || '(none)'}`);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: `http://127.0.0.1:8080/?demo-test=${Date.now()}#/home` });
await waitFor(`document.readyState === 'complete' && document.querySelector('#open-demo')`, 'landing button');
await evaluate(`document.querySelector('#open-demo').click()`);
await waitFor(`document.querySelector('.demo-dialog')`, 'demo dialog after click', 2000);
const result = await evaluate(`({
  title: document.querySelector('#demo-title')?.textContent,
  tabCount: document.querySelectorAll('[data-demo-tab]').length,
  frameTitle: document.querySelector('#demo-frame-title')?.textContent,
  dialogWidth: Math.round(document.querySelector('.demo-dialog').getBoundingClientRect().width),
  viewportWidth: innerWidth
})`);
console.log('DEMO RUNTIME PASS', JSON.stringify(result));
ws.close();
