import {launch} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'http-error-boundary-regression');
let fixture;
try{
 await t.send('Network.setBypassServiceWorker',{bypass:true});
 t.on('Fetch.requestPaused',async p=>{
  if(fixture.network)await t.send('Fetch.failRequest',{requestId:p.requestId,errorReason:'ConnectionRefused'});
  else await t.send('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:fixture.status,responseHeaders:[{name:'Content-Type',value:fixture.type}],body:Buffer.from(fixture.body).toString('base64')});
 });
 await t.send('Fetch.enable',{patterns:[{urlPattern:t.base+'/api/auth/me*'}]});
 const cases=[
  {name:'Malformed JSON HTTP500',status:500,type:'application/json',body:'{bad',demo:false,message:'HTTP 500'},
  {name:'HTML HTTP503',status:503,type:'text/html',body:'<h1>Unavailable</h1>',demo:false,message:'HTTP 503'},
  {name:'Malformed JSON HTTP422',status:422,type:'application/json',body:'{bad',demo:false,message:'HTTP 422'},
  {name:'Malformed JSON HTTP200',status:200,type:'application/json',body:'{bad',demo:false,message:'HTTP 200'},
  {name:'Valid API error preserved',status:500,type:'application/json',body:JSON.stringify({error:{code:'test_fault',message:'Layanan sedang gagal — uji terkontrol'}}),demo:false,message:'Layanan sedang gagal — uji terkontrol'},
  {name:'Unauthorized stays in API login',status:401,type:'application/json',body:JSON.stringify({error:{code:'unauthorized',message:'Login required'}}),demo:false},
  {name:'Static HTML host offers consent',status:200,type:'text/html',body:'<!DOCTYPE html><h1>Static host</h1>',demo:true},
  {name:'Disconnected API offers consent',network:true,demo:true}
 ];
 for(const item of cases){fixture=item;await t.navigate('login');
  const view=await t.evaluate('({demo:!!document.querySelector("#demo-mode-button"),text:document.querySelector("#toast-region").textContent,hash:location.hash})');
  t.check(item.name+': correct demo boundary',view.demo===item.demo,view);
  t.check(item.name+': never auto-authenticate',view.hash==='#/login');
  if(item.message)t.check(item.name+': visible error',view.text.includes(item.message),view.text);
 }
 t.check('No runtime exceptions',t.errors.length===0,t.errors);
}finally{await t.close();}
if(t.results.some(r=>!r.pass))process.exitCode=1;
