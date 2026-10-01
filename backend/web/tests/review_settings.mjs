import {launch} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'settings-red');
try{
 await t.viewport(1440,1024);await t.login();const devices=(await t.api('/api/devices')).body.devices;devices[1].online=false;await t.intercept('/api/devices',200,{devices});await t.navigate('settings');
 const rows=await t.evaluate('Array.from(document.querySelectorAll(".settings-card table tbody tr")).map(r=>r.innerText)');
 t.check('Device status matches actual API',devices.every(d=>rows.some(r=>r.includes(d.id)&&r.includes(d.online?'Online':'Offline'))),rows);
 t.check('No fabricated RSSI signal',await t.evaluate('!document.body.innerText.includes("-61 dBm")'));
 t.check('Actual API polling interval disclosed',await t.evaluate('document.body.innerText.includes("15 detik")'));
 await t.shot('settings-status');
}catch(e){t.check('Settings flow',false,e.stack);}finally{await t.close();}process.exitCode=t.results.some(r=>!r.pass)?1:0;
