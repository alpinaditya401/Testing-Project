import {launch,until} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'growth-ui-red');
try{
 await t.send('Emulation.setTimezoneOverride',{timezoneId:'Asia/Jakarta'});
 await t.viewport(1440,1024);await t.login();await t.hash('reports','#export-csv');
 t.check('Observation defaults to labelled UTC date',await t.evaluate('document.querySelector("#growth-date").value===new Date().toISOString().slice(0,10)'));
 t.check('Manual growth form exists',await t.evaluate('!!document.querySelector("#growth-form")'));
 if(await t.evaluate('!!document.querySelector("#growth-form")')){
 await t.fill('#growth-weight','125.5');await t.fill('#growth-length','18');await t.fill('#growth-notes','Observasi manual <aman>');await t.click('#growth-form [type=submit]');
 await until(()=>t.evaluate('document.querySelector("#growth-list").textContent.includes("125.5")'));t.check('Growth persists to API',(await t.api('/api/growth-observations')).body.observations[0].weight_g===125.5);
 await t.navigate('reports');t.check('Growth restored and escaped',await t.evaluate('document.querySelector("#growth-list").textContent.includes("<aman>")&&!document.querySelector("aman")'));
 const id=(await t.api('/api/growth-observations')).body.observations[0].id;
 await t.intercept('/api/growth-observations/'+id,500,{error:{message:'Pengujian gagal hapus'}});
 await t.click('[data-delete-growth]');await t.click('#modal-confirm');
 await until(()=>t.evaluate('document.querySelector("#toast-region").textContent.includes("Pengujian gagal hapus")'));
 t.check('Rejected delete stays retryable without unhandled rejection',await t.evaluate('!!document.querySelector("#modal-confirm")&&!document.querySelector("#modal-confirm").disabled'));
 await t.key('Escape');
 }
 t.check('Command status panel exists',await t.evaluate('!!document.querySelector("#command-list")'));
 await t.shot('growth-reports');t.check('No runtime exceptions',t.errors.length===0,t.errors);
}catch(e){
 t.check('Growth UI flow',false,e.stack);
 console.log('GROWTH_DIAGNOSTICS',JSON.stringify(await t.evaluate(`({inputs:[...document.querySelectorAll('#growth-form input,#growth-form textarea')].map(n=>({id:n.id,value:n.value,valid:n.validity.valid,message:n.validationMessage})),list:document.querySelector('#growth-list')?.textContent,focus:document.activeElement?.id,scrollY,body:document.body.innerText.slice(-2000)})`)));
 console.log('GROWTH_REQUESTS',JSON.stringify(t.events.filter(e=>e.method==='Network.requestWillBeSent'&&new URL(e.params.request.url).pathname==='/api/growth-observations').map(e=>({method:e.params.request.method,path:new URL(e.params.request.url).pathname,body:e.params.request.postData}))));
 await t.shot('growth-failure');
}finally{await t.close();}process.exitCode=t.results.some(r=>!r.pass)?1:0;
