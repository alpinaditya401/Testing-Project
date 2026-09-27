const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path');
const { pathToFileURL } = require('url');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1240, height: 980 }, deviceScaleFactor: 1 });
  for (let n = 1; n <= 5; n++) {
    const base = path.join(__dirname, 'tugas_mandiri', 'bukti', `soal_${n}`);
    await page.goto(pathToFileURL(base + '.html').href);
    await page.locator('body').screenshot({ path: base + '.png' });
    console.log(`Soal ${n}: tangkapan layar tersimpan`);
  }
  await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
