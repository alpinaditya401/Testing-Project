import {launch,until,wait} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'threshold-red');
try{
 await t.viewport(1440,1024);await t.login();await t.hash('settings','#threshold-form');
 await t.intercept('/api/settings/thresholds',503,{error:{code:'unavailable',message:'Tes: layanan threshold tidak tersedia.'}});
 await t.click('#threshold-form [type=submit]');await wait(700);
 const state=await t.evaluate(`({disabled:document.querySelector('#threshold-form [type=submit]').disabled,text:document.body.innerText})`);
 t.check('Failed threshold save re-enables submit',!state.disabled);
 t.check('Failed threshold save displays server error',state.text.includes('Tes: layanan threshold tidak tersedia.'));
 t.check('Failed threshold save has zero uncaught exceptions',t.errors.length===0,t.errors);
 await t.shot('threshold-failure');
}catch(e){t.check('test completed',false,e.stack);}finally{await t.close();}process.exitCode=t.results.some(r=>!r.pass)?1:0;
