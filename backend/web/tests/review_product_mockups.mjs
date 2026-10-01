import {readFileSync} from 'node:fs';
import {launch} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'product-mockups');
try {
 const css=readFileSync('mockups/mockups.css','utf8').replace(/@import[^;]+;/,'');
 const tokens=readFileSync('web/assets/css/app.css','utf8');
 for(const page of ['provisioning','claim','onboarding','dashboard','push']) {
  const html=readFileSync(`mockups/${page}.html`,'utf8').replace('<link rel="stylesheet" href="mockups.css">',`<style>${tokens}\n${css}</style>`);
  await t.send('Page.setDocumentContent',{frameId:(await t.send('Page.getFrameTree')).frameTree.frame.id,html});
  for(const [w,h] of [[320,740],[390,844],[820,1180],[1280,800]]) {
   await t.viewport(w,h);
   const result=await t.evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth,states:[...document.querySelectorAll('[data-state]')].map(e=>e.dataset.state),buttons:[...document.querySelectorAll('button')].every(e=>e.disabled&&e.getBoundingClientRect().height>=44)})`);
   t.check(`${page} ${w}px state coverage and layout`,!result.overflow&&result.buttons&&['empty','loading','success','error','pending'].every(s=>result.states.includes(s)),result);
   if(w===390||w===1280)await t.shot(`${page}-${w}`);
  }
 }
 t.check('No script exceptions',t.errors.length===0,t.errors);
}finally{await t.close();}
process.exitCode=t.results.some(r=>!r.pass)?1:0;
