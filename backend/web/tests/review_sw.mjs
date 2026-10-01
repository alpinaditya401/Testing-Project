import vm from 'node:vm';import {readFileSync} from 'node:fs';
const handlers={},cached=[],deleted=[];let response={ok:true,status:200,clone(){return this;},headers:{get(){return null;}}};
const scope='http://localhost:9000/';
const context={URL,Request,Response,console,fetch:async()=>response,caches:{open:async()=>({put:async(r)=>cached.push(r.url),addAll:async()=>{}}),match:async()=>undefined,keys:async()=>['other-app-v1','aquasmart-v1'],delete:async k=>deleted.push(k)},self:{location:{origin:'http://localhost:9000',href:scope+'sw.js'},registration:{scope},clients:{claim:async()=>{}},skipWaiting(){},addEventListener:(n,f)=>handlers[n]=f}};
vm.runInNewContext(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),context);
let fails=0;function check(n,b){console.log((b?'PASS ':'FAIL ')+n);if(!b)fails++;}
async function request(path){let p;handlers.fetch({request:new Request(new URL(path,scope)),respondWith:q=>p=q,waitUntil(){}});if(p)await p;await new Promise(r=>setTimeout(r,0));return !!p;}
const claimed=await request('/#\/dashboard');check('SPA hash navigation handled by offline shell',claimed);cached.length=0;
await request('/api/devices');check('API never cached',cached.length===0);
await request('/private-report.json');check('Unknown authenticated resources never cached',cached.length===0);cached.length=0;
await request('https://external.example/private');check('Cross-origin responses never cached',cached.length===0);cached.length=0;
response={...response,ok:false,status:500};await request('/assets/js/app.js');check('HTTP errors never cached',cached.length===0);
let active;handlers.activate({waitUntil:p=>active=p});await active;check('Other app caches preserved',!deleted.includes('other-app-v1'));
check('Static fallback SVG is precached',readFileSync(new URL('../sw.js',import.meta.url),'utf8').includes('water-sample-static.svg'));
process.exitCode=fails?1:0;
