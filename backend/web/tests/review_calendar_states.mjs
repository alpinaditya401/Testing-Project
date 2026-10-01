import {launch,until,wait} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'calendar-states');
try {
 await t.login();await t.hash('reports','#calendar-form');
 await t.send('Network.setBypassServiceWorker',{bypass:true});
 let release;
 t.on('Fetch.requestPaused',async p=>{await new Promise(r=>{release=r;});await t.send('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:500,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({error:{message:'Rapport indisponible test'}})).toString('base64')});});
 await t.send('Fetch.enable',{patterns:[{urlPattern:t.base+'/api/reports*'}]});
 await t.evaluate('document.querySelector("#calendar-submit").focus()');await t.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await t.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await until(()=>!!release,'paused report request');
 t.check('Keyboard submit shows loading and clears old output',await t.evaluate('document.querySelector("#calendar-results").textContent.includes("Memuat")&&document.querySelector("#calendar-results").getAttribute("aria-busy")==="true"'));
 t.check('Filters locked while loading',await t.evaluate('[...document.querySelector("#calendar-form").elements].every(e=>e.disabled)'));
 release();await wait(400);
 t.check('HTTP failure visible, no demo fallback or fake aggregates',await t.evaluate('document.querySelector("#calendar-results").textContent.includes("Rapport indisponible test")&&!!document.querySelector("#calendar-form")&&!document.querySelector("#calendar-results tbody")'));
 t.check('Retry available, busy state cleared, keyboard focus retained',await t.evaluate('!document.querySelector("#calendar-submit").disabled&&document.querySelector("#calendar-results").getAttribute("aria-busy")!=="true"&&document.activeElement.id==="calendar-submit"'));
 await t.send('Fetch.disable');
 await t.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await t.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await until(()=>t.evaluate('document.querySelector("#calendar-results").textContent.includes("Total sampel:")'),'successful retry');
 t.check('Retry recovers with actual API result',true);
 await t.fill('#calendar-date','2000-01-01');
 t.check('Changed filter invalidates previous results',await t.evaluate('!document.querySelector("#calendar-results").textContent.includes("Total sampel:")'));
 await t.shot('calendar-states');
 t.check('No uncaught exceptions',t.errors.length===0,t.errors);
} catch(e) {t.check('States completed',false,e.stack);} finally {await t.close();}
process.exitCode=t.results.some(x=>!x.pass)?1:0;
