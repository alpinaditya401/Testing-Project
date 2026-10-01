import {launch} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'pwa-installability');
try {
  await t.navigate('home');
  await t.evaluate('navigator.serviceWorker.ready');
  const result=await t.send('Page.getInstallabilityErrors');
  t.check('Chromium PWA installability',result.installabilityErrors.length===0,result.installabilityErrors);
  t.check('Manifest is served successfully',(await fetch(t.base+'/manifest.webmanifest')).status===200);
  const icons=await t.evaluate(`(async()=>{const m=await (await fetch('manifest.webmanifest')).json();const results=[];for(const icon of m.icons.filter(i=>i.type==='image/png')){const img=new Image();img.src=icon.src;await img.decode();results.push({declared:icon.sizes,actual:img.naturalWidth+'x'+img.naturalHeight,cached:!!await caches.match(new URL(icon.src,location.href).href)});}const apple=new Image();apple.src=document.querySelector('link[rel="apple-touch-icon"]').href;await apple.decode();return {results,apple:apple.naturalWidth+'x'+apple.naturalHeight,id:m.id,scope:m.scope};})()`);
  t.check('PNG install icons decode at declared sizes and are cached',icons.results.length===2&&icons.results.every(i=>i.actual===i.declared&&i.cached),icons);
  t.check('Apple Home Screen icon decodes at 180px',icons.apple==='180x180',icons.apple);
  t.check('PWA identity and scope are explicit',icons.id==='./'&&icons.scope==='./');
  t.check('No uncaught exceptions',t.errors.length===0,t.errors);
} catch(error) {t.check('PWA verification completed',false,error.message);}
finally {await t.close();}
process.exitCode=t.results.some(row=>!row.pass)?1:0;
