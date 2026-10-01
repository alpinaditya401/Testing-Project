import {launch,until,wait} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'feeder-red');
try{
 await t.viewport(1440,1024);await t.login();await t.click('#feed-now');await t.click('#modal-confirm');await wait(300);
 t.check('Queued command is not displayed as physical active',await t.evaluate('document.querySelector("#feeder-status").textContent.includes("Menunggu")'));
 await wait(8500);const commands=(await t.api('/api/devices/AQS-KOLAM-01/commands')).body.commands;
 t.check('Browser does not synthesize stop/ACK after eight seconds',commands.length===1&&commands[0].status==='pending'&&t.events.filter(e=>e.method==='Network.requestWillBeSent'&&e.params.request.url.endsWith('/control')).length===1,commands.map(c=>({status:c.status,value:c.value})));
 t.check('No runtime errors',t.errors.length===0,t.errors);
}catch(e){t.check('Feeder flow',false,e.stack);}finally{await t.close();}process.exitCode=t.results.some(r=>!r.pass)?1:0;
