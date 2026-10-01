import {launch,until,wait} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'operations-red');
try{
 await t.viewport(1440,1024);await t.login();const d=(await t.api('/api/devices')).body.devices[0];
 // Schedule creation/deletion: verify exact server record, not a toast.
 await t.fill('#schedule-time','13:37');await t.fill('#schedule-duration','11');await t.fill('#schedule-days','Senin - Jumat');await t.click('#schedule-form [type=submit]');
 let schedules;await until(async()=>{schedules=(await t.api('/api/devices/'+d.id+'/schedules')).body.schedules;return schedules.some(s=>s.time==='13:37');});const created=schedules.find(s=>s.time==='13:37');
 t.check('Schedule persists requested duration and days',created.duration===11&&created.days==='Senin - Jumat');
 await t.click('[data-delete-schedule="'+created.id+'"]');await t.key('Tab');t.check('Confirmation Tab traps focus',await t.evaluate('!!document.activeElement.closest("[role=dialog]")'));await t.click('#modal-confirm');
 await until(async()=>!(await t.api('/api/devices/'+d.id+'/schedules')).body.schedules.some(s=>s.id===created.id));t.check('Schedule delete persisted',true);
 // Settings success/reload readback.
 await t.hash('settings','#threshold-form');await t.fill('#turbidity-max','77');await t.click('#threshold-form [type=submit]');await until(async()=>(await t.api('/api/settings/thresholds')).body.thresholds.turbidity_max===77);t.check('Threshold persists on API',true);
 await t.navigate('settings');t.check('Threshold reload matches API',await t.evaluate('document.querySelector("#turbidity-max").value==="77"'));
 // Profile save must survive reload and preserve escaping.
 await t.hash('profile','#edit-profile');await t.click('#edit-profile');await t.fill('#edit-name','Uji <review> & aman');await t.fill('#edit-phone','081234567890');await t.click('#profile-form [type=submit]');await until(()=>t.evaluate('!document.querySelector("#profile-form")'));
 const me=(await t.api('/api/auth/me')).body.user;t.check('Profile change persisted',me.name==='Uji <review> & aman');await t.navigate('profile');t.check('Profile special characters remain text',await t.evaluate('document.querySelector(".profile-hero h2").textContent==="Uji <review> & aman"&&!document.querySelector("review")'));
 // Failed alert acknowledgement must recover, not reference event.currentTarget after await.
 await t.hash('alerts','#mark-read');const unread=(await t.api('/api/alerts')).body.alerts.find(a=>!a.acknowledged);
 await t.intercept('/api/alerts/'+unread.id+'/acknowledge',503,{error:{code:'busy',message:'Tes acknowledge gagal'}});await t.click('#mark-read');await wait(600);
 t.check('Failed acknowledge re-enables button',await t.evaluate('!document.querySelector("#mark-read").disabled'));
 t.check('Failed acknowledge error shown',await t.evaluate('document.body.innerText.includes("Tes acknowledge gagal")'));
 t.check('No uncaught exceptions',t.errors.length===0,t.errors);await t.shot('acknowledge-failure');
}catch(e){t.check('Operations completed',false,e.stack);}finally{await t.close();}process.exitCode=t.results.some(r=>!r.pass)?1:0;
