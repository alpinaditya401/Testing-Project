import {launch,until,wait} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'routes-baseline');
const vps=[[320,740],[390,844],[756,1024],[1024,768],[1440,1024],[844,390],[720,512]];
const targetIssues=[];
async function inspect(route){for(const [w,h] of vps){await t.viewport(w,h);await t.evaluate('window.scrollTo(0,0)');const d=await t.evaluate(`(()=>{const visible=e=>!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';return {overflow:document.documentElement.scrollWidth-innerWidth,small:[...document.querySelectorAll('button,a,input:not([type=hidden]),select')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.width<43.9||r.height<43.9)}).map(e=>({tag:e.tagName,id:e.id,label:e.getAttribute('aria-label')||e.textContent.slice(0,65),w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))}})()`);t.check(route+' overflow '+w+'x'+h,d.overflow<=1,d.overflow);if(d.small.length)targetIssues.push({route,w,controls:d.small});if(w===390||w===1440)await t.shot(route+'-'+w);}}
try{
 for(const r of ['home','login','register']){await t.navigate(r);await inspect(r);}
 await t.viewport(756,1024);await t.navigate('home');await t.click('#open-demo');await until(()=>t.evaluate('!!document.querySelector(".demo-dialog")'));
 const modal=await t.evaluate(`(()=>{const r=document.querySelector('.demo-dialog').getBoundingClientRect();return {w:r.width,h:r.height,text:document.querySelector('.demo-dialog').innerText};})()`);
 t.check('Demo gutters at 756',modal.w<=724,modal.w);t.check('Demo simulation disclaimer',/simulasi.*target/i.test(modal.text));await t.shot('demo-756');
 await t.key('Escape');await t.login();
 for(const r of ['dashboard','alerts','reports','settings','profile']){await t.hash(r,({dashboard:'#feed-now',alerts:'#mark-read',reports:'#export-csv',settings:'#threshold-form',profile:'#edit-profile'})[r]);await inspect(r);}
 t.check('No runtime exceptions',t.errors.length===0,t.errors);t.check('All visible standalone controls 44px (inline links listed for review)',targetIssues.length===0,targetIssues);
}catch(e){t.check('Completed route audit',false,e.stack);}finally{await t.close();}process.exitCode=t.results.some(r=>!r.pass)?1:0;
