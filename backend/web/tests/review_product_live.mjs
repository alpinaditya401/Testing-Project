import {launch,until,wait} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'product-live');
try {
 await t.login();
 await t.send('Page.navigate',{url:t.base+'/units.html'});
 await until(()=>t.evaluate('!document.querySelector("#product-app").hidden'));
 t.check('Empty product list is honest',await t.evaluate('document.querySelector("#unit-view").textContent.includes("Belum ada unit")'));
 t.check('Owner cannot see seller controls',await t.evaluate('document.querySelector("#seller-panel").hidden'));
 await t.fill('#claim-form [name=serial_number]','NOT-EXIST');await t.fill('#claim-form [name=activation_code]','ABCD-ABCD-ABCD-ABCD');await t.click('#claim-form button');
 await until(()=>t.evaluate('document.querySelector("#claim-status").textContent.includes("Serial tidak ditemukan")'));
 t.check('Specific claim error from real API',true);
 await t.send('Page.addScriptToEvaluateOnNewDocument',{source:`{
 const realFetch=window.fetch.bind(window);window.pendingProduct=[];
 const unit=id=>({id,name:'Kolam '+id,connection:{state:'waiting'},latest_reading:null,commands:[]});
 window.fetch=(url,options)=>{
  if(url==='/api/units')return Promise.resolve(new Response(JSON.stringify({units:[unit('A'),unit('B')],seller:false}),{status:200}));
  if(url==='/api/units/A/dashboard')return new Promise(resolve=>window.pendingProduct.push(resolve));
  if(url==='/api/units/B/dashboard')return Promise.resolve(new Response(JSON.stringify({unit:unit('B')}),{status:200}));
  return realFetch(url,options);
 };
}`});
 await t.send('Page.navigate',{url:t.base+'/units.html'});await until(()=>t.evaluate('document.querySelector("#unit-select").options.length===3'));
 for(const status of [200,403]) {
  await t.fill('#unit-select','A');await until(()=>t.evaluate('window.pendingProduct.length>0'));
  await t.fill('#unit-select','B');await until(()=>t.evaluate('document.querySelector("#unit-view").textContent.includes("Kolam B")'));
  await t.evaluate(`window.pendingProduct.shift()(new Response(JSON.stringify(${JSON.stringify(status===200?{unit:{id:'A',name:'Kolam A',connection:{state:'offline'},commands:[]}}:{error:{message:'STALE A ERROR'}})}),{status:${status}}))`);await wait(100);
  t.check('Late unit A '+status+' cannot replace B',await t.evaluate('document.querySelector("#unit-view").textContent.includes("Kolam B")&&!document.querySelector("#unit-view").textContent.includes("STALE A ERROR")'));
 }
 for(const width of [320,390,820,1280]){await t.viewport(width,850);t.check('No overflow '+width,await t.evaluate('document.documentElement.scrollWidth<=innerWidth'));}
 await t.viewport(390,844);await t.shot('product-mobile');
 t.check('No script errors',t.errors.length===0,t.errors);
}catch(e){t.check('Product UI completed',false,e.stack);}finally{await t.close();}
process.exitCode=t.results.some(r=>!r.pass)?1:0;
