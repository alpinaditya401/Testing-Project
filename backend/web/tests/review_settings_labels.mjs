import {launch} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'settings-labels-regression');
try{
 await t.login();await t.navigate('settings');
 const fields=await t.evaluate('[...document.querySelectorAll("#threshold-form input[readonly]")].map(n=>({value:n.value,id:n.id,labels:[...n.labels].map(l=>l.textContent.trim())}))');
 t.check('Three readonly parameters present',fields.length===3,fields);
 for(const field of fields)t.check(`Visible label associated: ${field.value}`,field.labels.includes('Parameter'),field);
 const ax=await t.send('Accessibility.getFullAXTree');
 const nodes=ax.nodes.filter(n=>!n.ignored&&n.role?.value==='textbox'&&['pH Air','Suhu Air (°C)','Kekeruhan (NTU)'].includes(n.value?.value));
 t.check('Accessibility tree exposes named parameter controls',nodes.length===3&&nodes.every(n=>n.name?.value==='Parameter'),nodes.map(n=>({name:n.name?.value,value:n.value?.value})));
 t.check('No duplicate field IDs',new Set(fields.map(f=>f.id)).size===fields.length&&fields.every(f=>f.id));
 await t.viewport(390,844);await t.shot('settings-labels-mobile');
 t.check('No runtime exceptions',t.errors.length===0,t.errors);
}finally{await t.close();}
if(t.results.some(r=>!r.pass))process.exitCode=1;
