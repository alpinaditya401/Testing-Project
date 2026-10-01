import {launch,until} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'demo-devices');
try {
 await t.navigate('home');await t.click('#open-demo');await until(()=>t.evaluate('!!document.querySelector(".demo-dialog")'));
 await t.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 for(const [w,h] of [[320,568],[360,640],[390,844],[412,915],[568,320],[844,390],[768,1024],[1024,768],[820,1180],[1180,820],[540,720]]) {
  await t.viewport(w,h);
  for(const tab of ['monitoring','feeding']) {
   await t.click(`#demo-tab-${tab}`);
   for(let frame=0;frame<5;frame++) {
    await t.evaluate(`document.querySelector('[data-frame-jump="${frame}"]').click()`);
    const result=await t.evaluate(`(()=>{const p=document.querySelector('#demo-panel'),n=document.querySelector('.demo-navigation');const before=n.getBoundingClientRect();p.scrollTop=p.scrollHeight;const after=n.getBoundingClientRect(),r=p.getBoundingClientRect();return {stable:Math.abs(before.y-after.y)<1,visible:after.bottom<=innerHeight+1&&after.top>=0,space:r.height>=100,overflow:p.scrollWidth<=p.clientWidth+1,targets:[...n.querySelectorAll('button')].every(b=>{const x=b.getBoundingClientRect();return x.width>=44&&x.height>=44}),height:r.height};})()`);
    t.check(`${w}x${h} ${tab} frame ${frame+1}`,result.stable&&result.visible&&result.space&&result.overflow&&result.targets,result);
   }
  }
  await t.evaluate('document.querySelector("#demo-panel").scrollTop=0');
  await t.shot(`demo-${w}x${h}`);
 }
 t.check('No browser errors',t.errors.length===0,t.errors);
}catch(e){t.check('Device layout review completed',false,e.stack);}finally{await t.close();}
process.exitCode=t.results.some(r=>!r.pass)?1:0;
