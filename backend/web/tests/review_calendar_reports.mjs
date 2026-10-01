import {launch,until} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'calendar-reports');
try {
 await t.viewport(1440,1024);await t.login();
 const devices=(await t.api('/api/devices')).body.devices;
 for(const [created_at,ph,simulation] of [['2020-02-03T01:00:00Z',6,true],['2020-02-03T02:00:00Z',8,false],['2020-02-29T23:59:59Z',9,true],['2020-03-01T00:00:00Z',5,true]]) {
  const r=await fetch(t.base+'/api/devices/'+devices[0].id+'/readings',{method:'POST',headers:{'Content-Type':'application/json','X-Device-Key':t.deviceKey},body:JSON.stringify({created_at,ph,temperature:28,turbidity:20,simulation})});
  if(r.status!==201)throw Error('fixture ingestion '+r.status);
 }
 await t.hash('reports','#export-csv');
 const present=await t.evaluate('!!document.querySelector("#calendar-date")');
 t.check('Calendar date filter exists',present);
 if(!present)throw Error('Missing calendar reports integration');
 await t.fill('#calendar-date','2020-02-17');await t.fill('#calendar-period','month');await t.click('#calendar-submit');
 await until(()=>t.evaluate('document.querySelector("#calendar-results")?.textContent.includes("2020-02-29")'),'calendar month data');
 let rows=await t.evaluate('[...document.querySelectorAll("#calendar-results tbody tr")].map(x=>x.innerText)');
 t.check('Full leap month uses daily aggregates, excludes March',rows.length===2&&rows[0].includes('7.00')&&!rows.join('').includes('2020-03-01'),rows);
 const text=await t.evaluate('document.querySelector("#calendar-results").innerText');
 t.check('Mixed source counts and UTC are explicit',text.includes('Simulasi: 2')&&text.includes('Non-simulasi: 1')&&text.includes('UTC')&&text.includes('bukan bukti'),text);
 const requests=t.events.filter(x=>x.method==='Network.requestWillBeSent').map(x=>x.params.request.url);
 t.check('Request carries selected device date and period',requests.some(x=>{const u=new URL(x);return u.pathname==='/api/reports'&&u.searchParams.get('device_id')===devices[0].id&&u.searchParams.get('date')==='2020-02-17'&&u.searchParams.get('period')==='month';}));
 await t.shot('calendar-desktop');
 await t.fill('#calendar-date','2020-02-03');await t.fill('#calendar-period','day');await t.click('#calendar-submit');
 await until(()=>t.evaluate('document.querySelector("#calendar-results")?.textContent.includes("Simulasi: 1")'),'day result');
 t.check('Day selection shows one aggregate',await t.evaluate('document.querySelectorAll("#calendar-results tbody tr").length===1'));
 await t.fill('#calendar-period','week');await t.click('#calendar-submit');
 await until(()=>t.evaluate('document.querySelector("#calendar-results")?.textContent.includes("2020-02-10")'),'Monday weekly boundary');
 t.check('Week uses server Monday boundaries',await t.evaluate('document.querySelector("#calendar-results").textContent.includes("2020-02-03")'));
 await t.fill('#calendar-device',devices[1].id);await t.click('#calendar-submit');
 await until(()=>t.evaluate('document.querySelector("#calendar-results")?.textContent.includes("Tidak ada sampel")'),'empty device period');
 t.check('Device selector changes API request, empty has no invented rows',await t.evaluate('document.querySelectorAll("#calendar-results tbody tr").length===0'));
 await t.viewport(390,844);
 await t.fill('#calendar-device',devices[0].id);await t.fill('#calendar-period','month');await t.click('#calendar-submit');
 await until(()=>t.evaluate('document.querySelectorAll("#calendar-results tbody tr").length===2'),'mobile calendar result');
 await t.evaluate('document.querySelector("#calendar-report").scrollIntoView({block:"start"})');await t.shot('calendar-mobile');
 t.check('Existing CSV explicitly exports loaded readings, not calendar',await t.evaluate('document.querySelector("#export-csv").textContent.includes("lectures")||document.querySelector("#export-csv").textContent.includes("pembacaan")'));
 t.check('Mobile has no document overflow',await t.evaluate('document.documentElement.scrollWidth<=innerWidth'));
 t.check('Calendar inputs have accessible labels',await t.evaluate('["calendar-device","calendar-date","calendar-period"].every(id=>document.getElementById(id).labels.length>0)'));
 t.check('No inline styles introduced',await t.evaluate('document.querySelectorAll("#calendar-report [style]").length===0'));
 t.check('No runtime exceptions',t.errors.length===0,t.errors);
} catch(e) {t.check('Calendar test completed',false,e.stack);} finally {await t.close();}
process.exitCode=t.results.some(x=>!x.pass)?1:0;
