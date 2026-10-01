import {launch,until,wait} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'offline-red');
try{
 await t.viewport(1440,1024);await t.login();
 const saved=await t.evaluate('localStorage.getItem("aquasmart-prototype-v1")');
 t.check('API session does not persist user/telemetry in demo localStorage',saved===null||!saved.includes(t.username));
 await t.send('Page.navigate',{url:t.base+'/#/dashboard'});await until(()=>t.evaluate('!!document.querySelector("#feed-now")'));
 await t.evaluate('navigator.serviceWorker.ready');await wait(500);
 const keys=await t.evaluate('(async()=>{const out=[];for(const k of await caches.keys())for(const r of await (await caches.open(k)).keys())out.push(r.url);return out;})()');
 t.check('No API response in actual CacheStorage',keys.every(k=>!new URL(k).pathname.startsWith('/api/')),keys);
 await t.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await t.send('Page.reload');await until(()=>t.evaluate('!!document.querySelector("h1")'),'cached offline shell');await wait(500);
 t.check('Offline transition requires explicit demo consent',await t.evaluate('!!document.querySelector("#demo-mode-button")&&!document.querySelector("#feed-now")'),await t.evaluate('({url:location.href,text:document.body.innerText.slice(0,1800),sw:!!navigator.serviceWorker?.controller})'));
 t.check('Offline shell fallback asset cached',keys.some(k=>k.endsWith('water-sample-static.svg')));
 await t.shot('offline-shell');t.check('No uncaught exceptions',t.errors.length===0,t.errors);
}catch(e){t.check('Offline test completed',false,e.stack);}finally{await t.close();}process.exitCode=t.results.some(r=>!r.pass)?1:0;
