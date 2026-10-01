import {launch,wait} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'skip-link-regression');
async function checkSkip(route){
  const before=await t.evaluate('location.hash');
  await t.evaluate('document.querySelector(".skip-link").focus()');
  await t.key('Enter');await wait(180);
  const result=await t.evaluate('({hash:location.hash,focus:document.activeElement?.id})');
  t.check(`${route}: skip preserves route`,result.hash===before,result);
  t.check(`${route}: skip focuses main content`,result.focus==='main-content',result);
}
try{
  for(const route of ['home','login','register']){await t.navigate(route);await checkSkip(route);}
  await t.login();await checkSkip('dashboard');
  for(const route of ['alerts','reports','settings','profile']){await t.navigate(route);await checkSkip(route);}
  t.check('No runtime exceptions',t.errors.length===0,t.errors);
}finally{await t.close();}
if(t.results.some(r=>!r.pass))process.exitCode=1;
