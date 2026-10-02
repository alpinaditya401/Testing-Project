import {launch} from './review_runtime.mjs';
// Thresholds must come from the server after an in-page login, not from the
// defaults loaded before it; otherwise "Simpan Threshold" writes the defaults back.
const t=await launch(process.argv[2]||'threshold-login-red');
try{
 await t.viewport(1440,1024);await t.navigate('login');
 const custom={ph_min:7.2,ph_max:7.4,temperature_min:26,temperature_max:29,turbidity_max:40};
 const seeded=await t.evaluate(`(async()=>{const login=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:${JSON.stringify(t.username)},password:${JSON.stringify(t.password)}})}).then(r=>r.json());
  const saved=await fetch('/api/settings/thresholds',{method:'PATCH',headers:{'Content-Type':'application/json','X-CSRF-Token':login.csrf_token},body:JSON.stringify(${JSON.stringify(custom)})});
  const out=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':login.csrf_token},body:'{}'});
  return {saved:saved.status,logout:out.status};})()`);
 t.check('Custom thresholds stored before the UI login',seeded.saved===200&&seeded.logout===200,seeded);
 await t.login();await t.hash('settings','#threshold-form');
 const form=await t.evaluate(`['ph-min','ph-max','temp-min','temp-max','turbidity-max'].map(id=>Number(document.getElementById(id).value))`);
 t.check('Settings form shows server thresholds after in-page login',JSON.stringify(form)===JSON.stringify([7.2,7.4,26,29,40]),form);
 t.check('No uncaught exceptions',t.errors.length===0,t.errors);
 await t.shot('threshold-after-login');
}catch(e){t.check('Threshold login flow',false,e.stack);}finally{await t.close();}process.exitCode=t.results.some(r=>!r.pass)?1:0;
