import {launch, until} from './review_runtime.mjs';
const t = await launch(process.argv[2] || 'device-lifecycle');
try {
  await t.viewport(390,844); await t.login(); await t.hash('settings','#claim-device-form');
  await t.fill('#claim-serial','AQS-MISSING'); await t.click('#claim-device-form button');
  await until(()=>t.evaluate('document.querySelector("#device-management-status").textContent.includes("belum terdaftar")'));
  t.check('Invalid serial has actionable feedback',true);
  await t.fill('#claim-serial','AQS-REVIEW-NEW'); await t.click('#claim-device-form button');
  await until(()=>t.evaluate('!!document.querySelector("#edit-device-id option[value=AQS-REVIEW-NEW]")'));
  t.check('Claim persists new device', (await t.api('/api/devices')).body.devices.some(d=>d.id==='AQS-REVIEW-NEW'));
  await t.fill('#edit-device-id','AQS-REVIEW-NEW');
  await t.fill('#device-name','Bak <uji>'); await t.fill('#device-location','Lokasi lokal');
  await t.click('#edit-device-form button');
  await until(()=>t.evaluate('document.querySelector("#edit-device-id").textContent.includes("Bak <uji>")'));
  t.check('Name edits render as text', await t.evaluate('!document.querySelector("uji")'));
  await t.fill('#edit-device-id','AQS-REVIEW-NEW'); await t.click('#rotate-device-key');
  await until(()=>t.evaluate('document.querySelector("#device-key-output").textContent.includes("AQS-REVIEW-NEW:")'));
  t.check('Key does not overflow mobile', await t.evaluate('document.documentElement.scrollWidth<=innerWidth'));
  t.check('Scoped key authenticates heartbeat', await t.evaluate(`(async()=>{const key=document.querySelector('#device-key-output').textContent.split(': ')[1];const r=await fetch('/api/devices/AQS-REVIEW-NEW/heartbeat',{method:'POST',headers:{'Content-Type':'application/json','X-Device-Key':key},body:'{}'});return r.status===200;})()`));
  await t.hash('profile','#edit-profile');
  t.check('Key cleared when leaving settings', await t.evaluate('!document.querySelector("#device-key-output")'));
  await t.hash('settings','#claim-device-form');
  t.check('Key not reloaded into page', await t.evaluate('document.querySelector("#device-key-output").textContent === ""'));
  await t.shot('device-settings');
  t.check('No runtime exceptions', t.errors.length===0, t.errors);
} catch(error) { t.check('Device lifecycle completed',false,error.stack); }
finally { await t.close(); }
process.exitCode=t.results.some(row=>!row.pass)?1:0;
