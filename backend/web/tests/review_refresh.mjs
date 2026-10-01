import {launch,until,wait} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'refresh-red');
try{
 await t.viewport(1440,1024);await t.login();const d=(await t.api('/api/devices')).body.devices[0];
 const started=performance.now();
 const r=await fetch(t.base+'/api/devices/'+d.id+'/readings',{method:'POST',headers:{'Content-Type':'application/json','X-Device-Key':t.deviceKey},body:JSON.stringify({ph:9.8,temperature:34,turbidity:88,simulation:true,created_at:new Date(Date.now()+1000).toISOString()})});t.check('Telemetry accepted',r.status===201);
 await until(()=>t.evaluate('document.querySelector("[data-live-value=ph]")?.textContent.includes("9.8")'),'poll updates numbers',19000);
 const card=await t.evaluate('document.querySelector(".metric-ph").innerText');t.check('Polling updates status with new value',card.includes('Di luar batas'),card);
 t.check('Polling updates recommendations',await t.evaluate('document.querySelector("#quality-recommendations").innerText.includes("pH di luar batas")'));
 t.check('Ingestion to dashboard breach stays below 60 seconds',performance.now()-started<60000,{elapsed_ms:Math.round(performance.now()-started)});
 await t.hash('alerts','#mark-read');
 t.check('Persisted breach appears in alert page',await t.evaluate('document.querySelector("main").innerText.includes("pH 9.8")'));
 await t.shot('poll-breach');
 // Genuine valid session followed by injected server failure, not transport outage.
 await t.intercept('/api/auth/me',503,{error:{code:'unavailable',message:'Tes layanan sesi gagal'}});await t.navigate('dashboard');await wait(400);
 const mode=await t.evaluate('document.querySelector("[data-connection-mode]")?.getAttribute("data-connection-mode")');
 t.check('HTTP 503 never silently changes authenticated session into demo',mode!=='demo',mode);
 t.check('No uncaught exceptions',t.errors.length===0,t.errors);
}catch(e){t.check('refresh test completed',false,e.stack);}finally{await t.close();}process.exitCode=t.results.some(r=>!r.pass)?1:0;
