// Owned, isolated browser + PHP runtime. Never attaches to the user's browser/DB.
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync,openSync,closeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import net from 'node:net';
export const wait=ms=>new Promise(r=>setTimeout(r,ms));
export async function until(fn,label='condition',timeout=8000){const end=Date.now()+timeout;let last;while(Date.now()<end){try{const v=await fn();if(v)return v;}catch(e){last=e;}await wait(60);}throw Error('Timeout: '+label+(last?' '+last.message:''));}
export async function freePort(){const s=net.createServer();await new Promise((r,j)=>s.once('error',j).listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
export async function launch(label){
 const app=resolve(''), output=resolve('test-output',label);mkdirSync(output,{recursive:true});
 const temp=mkdtempSync(join(tmpdir(),'aquasmart-review-')), port=await freePort(), base=`http://127.0.0.1:${port}`;
 const username='review_'+randomBytes(5).toString('hex'), password=randomBytes(24).toString('hex'), deviceKey=randomBytes(24).toString('hex');
 const log=openSync(join(output,'php.log'),'w');
 const php=spawn('php',['-S',`127.0.0.1:${port}`,'-t','web','server/router.php'],{cwd:app,stdio:['ignore',log,log],env:{...process.env,AQUASMART_APP_ENV:'test',AQUASMART_DB_PATH:join(temp,'test.sqlite'),AQUASMART_SESSION_SECURE:'0',AQUASMART_SEED_USERNAME:username,AQUASMART_SEED_PASSWORD:password,AQUASMART_DEVICE_KEY:deviceKey,AQUASMART_UNCLAIMED_DEVICE_SERIAL:'AQS-REVIEW-NEW'}});
 let edge,ws;const events=[],errors=[],listeners=new Map(), results=[];
 const close=async()=>{if(ws){try{await send('Browser.close');}catch{}ws.close();}if(edge&&edge.exitCode===null)edge.kill();if(php.exitCode===null)php.kill();closeSync(log);await wait(350);try{rmSync(temp,{recursive:true,force:true});}catch{}writeFileSync(join(output,'results.json'),JSON.stringify({label,results,errors},null,2));};
 let send;
 try{
 await until(async()=>{if(php.exitCode!==null)throw Error('PHP exited');return (await fetch(base+'/api/health')).ok;},'PHP health');
 const edgePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);if(!edgePath)throw Error('Edge not found');
 edge=spawn(edgePath,['--headless=new','--remote-debugging-port=0',`--user-data-dir=${join(temp,'browser')}`,'--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore'});
 const cdpPort=await until(()=>{const p=join(temp,'browser','DevToolsActivePort');return existsSync(p)&&Number(readFileSync(p,'utf8').split('\n')[0]);},'Edge endpoint');
 const tabs=await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json();const tab=tabs.find(t=>t.type==='page');
 ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 let id=0;const pending=new Map();send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},12000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
 ws.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);clearTimeout(p.timer);pending.delete(d.id);d.error?p.reject(Error(d.error.message)):p.resolve(d.result);}if(d.method){events.push(d);if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails.exception?.description||d.params.exceptionDetails.text);for(const f of listeners.get(d.method)||[])Promise.resolve(f(d.params)).catch(e=>errors.push(e.message));}});
 listeners.set('Runtime.consoleAPICalled',[params=>{if(params.type==='error')errors.push('console.error: '+params.args.map(arg=>arg.description||arg.value||arg.type).join(' '));}]);
 listeners.set('Log.entryAdded',[params=>{if(params.entry.source==='security'&&params.entry.level==='error')errors.push(params.entry.text);}]);
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Log.enable');
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const on=(m,f)=>{listeners.set(m,[...(listeners.get(m)||[]),f]);};
 const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});const p=join(output,name+'.png');writeFileSync(p,Buffer.from(r.data,'base64'));return p;};
 const check=(name,condition,detail='')=>{results.push({name,pass:!!condition,detail});console.log((condition?'PASS ':'FAIL ')+name+(detail?' '+JSON.stringify(detail):''));return !!condition;};
 const viewport=async(w,h)=>{await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});await wait(90);};
 const navigate=async route=>{const url=base+'/?review='+Date.now()+'/#/'+route;await send('Page.navigate',{url});await until(()=>evaluate(`location.href.startsWith(${JSON.stringify(url.split('#')[0])}) && document.readyState === 'complete' && !!document.querySelector("h1")`),'page '+route);await wait(120);};
 const hash=async(route,selector)=>{await evaluate(`location.hash=${JSON.stringify('#/'+route)}`);await until(()=>evaluate(`!!document.querySelector(${JSON.stringify(selector)})`),route);await wait(90);};
 const fill=async(selector,value)=>evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const click=async selector=>{let previous;const p=await until(async()=>{const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing target');e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);const stable=previous&&Math.abs(previous.x-point.x)<0.25&&Math.abs(previous.y-point.y)<0.25;previous=point;return stable?point:false;},'stable click target '+selector);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});};
 const key=async(key,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,modifiers});};
 const api=async(path,method='GET',body)=>evaluate(`(async()=>{const me=await fetch('/api/auth/me').then(r=>r.json());const r=await fetch(${JSON.stringify(path)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json','X-CSRF-Token':me.csrf_token||''},${body===undefined?'':`body:JSON.stringify(${JSON.stringify(body)}),`}});return {status:r.status,body:await r.json()};})()`);
 const login=async()=>{await navigate('login');await fill('#username',username);await fill('#password',password);await click('#login-form [type=submit]');await until(()=>evaluate('!!document.querySelector("#feed-now")'),'seed account dashboard');};
 const intercept=async(path,status,body)=>{await send('Network.setBypassServiceWorker',{bypass:true});const handler=async p=>{if(new URL(p.request.url).pathname===path)await send('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});else await send('Fetch.continueRequest',{requestId:p.requestId});};listeners.set('Fetch.requestPaused',[handler]);await send('Fetch.enable',{patterns:[{urlPattern:base+path+'*'}]});};
 return {base,temp,output,username,password,deviceKey,send,evaluate,on,events,errors,results,shot,check,viewport,navigate,hash,fill,click,key,api,login,intercept,close};
 }catch(e){await close();throw e;}
}
