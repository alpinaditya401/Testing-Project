import {launch,until} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'local-tls-browser');
const origin=process.argv[3]||'https://192.168.0.103:8443';
try {
  await t.send('Page.navigate',{url:origin+'/#/home'});
  await until(()=>t.evaluate('!!document.querySelector("main")'),'HTTPS app loaded');
  t.check('Browser trusts HTTPS LAN without ignore-certificate flags',await t.evaluate(`location.origin===${JSON.stringify(origin)} && isSecureContext && !document.querySelector('#main-frame-error')`));
  await t.evaluate('navigator.serviceWorker.ready');
  const result=await t.send('Page.getInstallabilityErrors');
  t.check('PWA installability on trusted LAN HTTPS',result.installabilityErrors.length===0,result.installabilityErrors);
  t.check('Manifest and service worker scope',await t.evaluate('navigator.serviceWorker.controller!==null && !!document.querySelector("link[rel=manifest]")'));
  await t.viewport(390,844); await t.shot('https-lan-mobile-viewport');
  t.check('No runtime errors',t.errors.length===0,t.errors);
} catch(error) {t.check('HTTPS browser verification',false,error.stack);} finally {await t.close();}
process.exitCode=t.results.some(r=>!r.pass)?1:0;
