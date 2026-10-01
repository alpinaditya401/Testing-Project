import {launch,until} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'provenance');
try {
  await t.viewport(1440,1024); await t.login(); await t.hash('reports','#raw-telemetry');
  await until(()=>t.evaluate('document.querySelector("#raw-telemetry").textContent.includes("Belum ada telemetry")'));
  t.check('Empty diagnostic does not invent sensor readings',true);
  for (const source of ['simulation','device','manual','seed','legacy_unverified']) {
    t.check('Visible source badge '+source,await t.evaluate(`!!document.querySelector('[data-provenance="${source}"]')`));
  }
  t.check('Diagnostic export option exists',await t.evaluate('!!document.querySelector("#export-kind option[value=telemetry]")'));
  await t.intercept('/api/devices/AQS-KOLAM-01/telemetry',200,{telemetry:[{created_at:'2026-09-15T08:00:00Z',source_session:'browser-fixture',provenance:'simulation',simulation:true,temperature:null,temperature_status:'unverified',turbidity_adc:2000,turbidity_mv:1500,turbidity_sensor_mv:2500,turbidity_mapping_percent:50,soil_ph_adc:null,soil_ph_mv:null,calibrated:false}]});
  await t.hash('dashboard','.dashboard-intro'); await t.hash('reports','#raw-telemetry');
  await until(()=>t.evaluate('document.querySelector("#raw-telemetry").textContent.includes("browser-fixture")'));
  t.check('Raw voltage and explicit simulation shown',await t.evaluate('document.querySelector("#raw-telemetry").textContent.includes("2000 / 1500 / 2500")'));
  await t.viewport(320,740);
  t.check('Diagnostic page fits mobile width',await t.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  await t.evaluate('document.querySelector("#raw-telemetry").scrollIntoView({block:"start",behavior:"instant"})');
  await t.shot('diagnostics-mobile');
  t.check('No runtime errors',t.errors.length===0,t.errors);
} catch(error) {t.check('Provenance flow',false,error.stack);} finally {await t.close();}
process.exitCode=t.results.some(r=>!r.pass)?1:0;
