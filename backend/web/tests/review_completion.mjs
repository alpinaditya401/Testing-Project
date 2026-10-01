import {launch, until} from './review_runtime.mjs';
const t = await launch(process.argv[2] || 'completion');
try {
  await t.viewport(390,844);
  await t.navigate('login');
  t.check('Login does not load rendering libraries', await t.evaluate('!window.THREE && !window.gsap'));
  t.check('Core page requests no external assets', !t.events.some(e => e.method === 'Network.requestWillBeSent' && /^https?:/.test(e.params.request.url) && !e.params.request.url.startsWith(t.base)));
  await t.send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await t.navigate('home');
  await t.click('#open-demo');
  await until(() => t.evaluate('!!document.querySelector("#demo-ntu")'));
  await t.fill('#demo-ntu','120');
  await t.click('[data-frame-jump="4"]');
  t.check('Critical turbidity changes visual and recommendation', await t.evaluate('document.querySelector("#demo-visual").textContent.includes("120 NTU") && document.querySelector("#demo-result").textContent.includes("Breach")'));
  await t.fill('#demo-ntu','20');
  t.check('Normal turbidity removes breach display', await t.evaluate('document.querySelector("#demo-frame-title").textContent === "Status Normal" && !document.querySelector("#demo-result").textContent.includes("Breach")'));
  await t.click('#demo-tab-feeding');
  for (const status of ['succeeded','failed','timeout']) {
    await t.fill('#demo-outcome',status);
    await t.click('[data-frame-jump="4"]');
    t.check('Feeder outcome ' + status, await t.evaluate(`document.querySelector('#demo-visual').textContent.includes('${status}')`));
  }
  await t.click('#demo-restart');
  t.check('Replay resets frame', await t.evaluate('document.querySelector("#frame-counter").textContent.includes("1 / 5")'));
  for (const width of [320,375,768,1024,1440]) {
    await t.viewport(width,900);
    t.check('Demo document fits ' + width, await t.evaluate('document.documentElement.scrollWidth <= innerWidth'));
  }
  t.check('No copyrighted thumbnails', await t.evaluate('!document.querySelector(".demo-dialog img")'));
  t.check('Reduced motion uses fallback without Three', await t.evaluate('!window.THREE'));
  await t.shot('interactive-demo');
  t.check('No uncaught exceptions', t.errors.length === 0, t.errors);
} catch (error) {
  t.check('Completion scenarios completed', false, error.stack);
} finally {
  await t.close();
}
process.exitCode = t.results.some(row => !row.pass) ? 1 : 0;
