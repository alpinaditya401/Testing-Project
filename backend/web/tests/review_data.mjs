import {launch,until,wait} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'data-red');
try{
 await t.viewport(1440,1024);await t.login();
 const d=(await t.api('/api/devices')).body.devices[0];
 // Actual HTTP ingestion into temporary DB; the application itself is never mocked.
 let stamp=Date.now();
 async function ingest(ph,temperature,turbidity){const r=await fetch(t.base+'/api/devices/'+d.id+'/readings',{method:'POST',headers:{'Content-Type':'application/json','X-Device-Key':t.deviceKey},body:JSON.stringify({ph,temperature,turbidity,simulation:true,created_at:new Date(stamp+=1000).toISOString()})});if(r.status!==201)throw Error('Ingestion failed '+await r.text());}
 await ingest(9.5,33,75);await t.navigate('dashboard');await until(()=>t.evaluate('document.querySelector("[data-live-value=ph]")?.textContent.includes("9.5")'));
 let text=await t.evaluate('document.querySelector("main").innerText');
 t.check('Abnormal pH does not recommend pH is good',!text.includes('pH dalam kondisi baik'));
 t.check('Breach banner does not say approaching limit',!text.includes('mendekati batas'));
 await t.hash('reports','#export-csv');
 const row=await t.evaluate('document.querySelector("tbody tr")?.innerText');
 t.check('Report labels breached row outside limits',!!row&&!row.includes('Normal'),row);await t.shot('reports-breach');
 await ingest(7,27,10);await t.navigate('dashboard');await until(()=>t.evaluate('document.querySelector("[data-live-value=turbidity]")?.textContent.includes("10")'));
 text=await t.evaluate('document.querySelector("main").innerText');t.check('Normal data has no fabricated turbidity warning',!text.includes('mendekati batas')&&!text.includes('Nilai mendekati ambang'));
 await t.shot('dashboard-normal');
 await t.hash('reports','#export-csv');const opts=await t.evaluate('[...document.querySelectorAll(".filter-bar select")].map(s=>({id:s.id,options:[...s.options].map(o=>o.text)}))');
 t.check('Report offers only implemented bounded period, not false 30-day coverage',!JSON.stringify(opts).includes('30 hari'),opts);
 // No-reading state from actual registration with provisioned serial.
 await t.api('/api/auth/logout','POST',{});await t.navigate('register');
 for(const [id,v] of Object.entries({'register-name':'Uji Kosong','register-contact':'empty-'+Date.now()+'@example.test','register-password':t.password,'register-password-confirmation':t.password,'register-serial':'AQS-REVIEW-NEW'}))await t.fill('#'+id,v);
 await t.click('#register-form [type=submit]');await until(()=>t.evaluate('!!document.querySelector("#feed-now")'),'new claimed device');
 const metrics=await t.evaluate('[...document.querySelectorAll("[data-live-value]")].map(n=>n.textContent)');
 t.check('Device with no readings never invents sensor numbers',metrics.length===3&&metrics.every(x=>x.includes('—')),metrics);await t.shot('no-reading');
 t.check('No uncaught exceptions',t.errors.length===0,t.errors);
}catch(e){t.check('Data test completed',false,e.stack);}finally{await t.close();}process.exitCode=t.results.some(r=>!r.pass)?1:0;
