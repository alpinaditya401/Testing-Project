import {launch,until,wait} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'workspace-red');
try {
 await t.viewport(1440,1024);await t.login();await t.hash('settings','#threshold-form');
 t.check('Workspace invitation form exists',await t.evaluate('!!document.querySelector("#invite-form")'));
 const invite=await t.api('/api/invitations','POST',{contact:'viewer@example.com'});t.check('Invite API works',invite.status===201);
 await t.api('/api/auth/logout','POST',{});
 const registered=await t.api('/api/auth/register','POST',{name:'Viewer',contact:'viewer@example.com',password:t.password,password_confirmation:t.password});
 await t.navigate('settings');
 t.check('Accept invitation form exists',await t.evaluate('!!document.querySelector("#accept-invite-form")'));
 if(await t.evaluate('!!document.querySelector("#accept-invite-form")')){
 await t.fill('#invite-token',invite.body.invitation.token);await t.click('#accept-invite-form [type=submit]');await until(()=>t.evaluate('document.body.innerText.includes("Viewer — akses baca")'));
 } else await t.api('/api/invitations/accept','POST',{token:invite.body.invitation.token});
 await t.navigate('dashboard');
 t.check('Viewer sees shared sensors',await t.evaluate('!!document.querySelector(".metrics-grid .metric-value")'));
 t.check('Viewer actuator controls disabled',await t.evaluate('document.querySelector("#feed-now").disabled && document.querySelector("[data-control= aerator]").disabled'));
 await t.hash('settings','#threshold-form');t.check('Viewer thresholds read only',await t.evaluate('document.querySelector("#threshold-form input").disabled'));
 await t.shot('viewer-settings');t.check('Zero runtime errors',t.errors.length===0,t.errors);
}catch(e){t.check('Workspace browser flow',false,e.stack);}finally{await t.close();}process.exitCode=t.results.some(r=>!r.pass)?1:0;
