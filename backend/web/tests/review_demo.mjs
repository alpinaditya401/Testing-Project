import {launch,until,wait} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'demo-red');
try{
 await t.viewport(756,1024);await t.navigate('home');await t.click('#open-demo');await until(()=>t.evaluate('!!document.querySelector(".demo-dialog")'));await t.click('#demo-pause');await wait(600);
 const d=await t.evaluate(`(()=>{const main=document.querySelector('.demo-main').getBoundingClientRect(),title=document.querySelector('#demo-frame-title').getBoundingClientRect();const sensors=[...document.querySelectorAll('.sensor-node')].map(e=>e.getBoundingClientRect());return {titleTop:title.top,mainTop:main.top,overlap:sensors.some((a,i)=>sensors.slice(i+1).some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)),text:document.querySelector('.demo-dialog').innerText};})()`);
 t.check('Demo title visible at start of scroll region',d.titleTop>=d.mainTop,d);t.check('Sensor diagrams do not overlap',!d.overlap);
 await t.evaluate('document.querySelector("#demo-tab-monitoring").focus()');await t.key('ArrowRight');
 t.check('Tab ArrowRight selects feeding, not frame navigation',await t.evaluate('document.querySelector("#demo-tab-feeding").getAttribute("aria-selected")==="true"'));
 await t.click('#demo-tab-feeding');await t.click('[data-frame-jump="3"]');
 t.check('Exact feeder caption retained',await t.evaluate('document.querySelector("#demo-frame-title").textContent==="Feeder Bekerja"'));
 t.check('No calibrated gram claim',!await t.evaluate('/120g|120 gram/.test(document.querySelector(".demo-dialog").textContent)'));
 await t.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait(400);
 const motion=await t.evaluate(`({smil:[...document.querySelectorAll('#demo-visual svg')].every(s=>!s.querySelector('animate,animateTransform')||s.animationsPaused()),label:document.querySelector('#demo-pause').getAttribute('aria-label')})`);
 t.check('Live reduced-motion stops SMIL',motion.smil,motion);
 // Modal keyboard loop under actual browser key delivery.
 await t.evaluate('document.querySelector("#demo-close").focus()');await t.key('Tab',8);
 t.check('Shift-Tab stays in dialog',await t.evaluate('!!document.activeElement.closest(".demo-dialog")'));
 for(const width of [320,390,756,1280]) {
  await t.viewport(width,700);
  const positions=()=>t.evaluate('["demo-prev","demo-next"].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y}})');
  const before=await positions();
  const scrolled=await t.evaluate('(()=>{const p=document.querySelector("#demo-panel");p.scrollTop=p.scrollHeight;return p.scrollTop})()');
  const afterScroll=await positions();
  await t.click('#demo-next');await wait(500);
  const afterFrame=await positions();
  t.check(`Navigation stays fixed on scroll and frame change at ${width}px`,[afterScroll,afterFrame].every(points=>points.every((p,i)=>Math.abs(p.x-before[i].x)<1&&Math.abs(p.y-before[i].y)<1)),{before,afterScroll,afterFrame,scrolled});
  t.check(`New frame starts at top at ${width}px`,await t.evaluate('document.querySelector("#demo-panel").scrollTop===0'));
 }
 await t.key('Escape');t.check('Escape restores trigger focus',await t.evaluate('document.activeElement.id==="open-demo"&&!document.querySelector("#app").inert'));
 await t.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await t.click('#open-demo');await t.shot('demo-756');
 t.check('No uncaught exceptions',t.errors.length===0,t.errors);
}catch(e){t.check('Demo test completed',false,e.stack);}finally{await t.close();}process.exitCode=t.results.some(r=>!r.pass)?1:0;
