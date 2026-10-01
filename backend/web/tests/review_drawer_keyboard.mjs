import {launch,wait,until} from './review_runtime.mjs';
const t=await launch(process.argv[2]||'drawer-keyboard-regression');
async function openDrawer(){
 await until(()=>t.evaluate('getComputedStyle(document.querySelector("#drawer-overlay")).visibility==="hidden"'),'backdrop exit transition');
 await t.click('#open-sidebar');
 await until(()=>t.evaluate('document.querySelector("#sidebar").classList.contains("open")'),'drawer opens');
 await wait(320);
}
try{
 await t.viewport(390,844);await t.login();
 t.check('Closed drawer is inert',await t.evaluate('document.querySelector("#sidebar").inert'));
 await openDrawer();
 t.check('Open drawer has expanded trigger',await t.evaluate('document.querySelector("#open-sidebar").getAttribute("aria-expanded")==="true"'));
 t.check('Open drawer focuses close',await t.evaluate('document.activeElement.id==="close-sidebar"'));
 let escaped=[];
 for(let i=0;i<20;i++){await t.key('Tab');const inside=await t.evaluate('document.querySelector("#sidebar").contains(document.activeElement)');if(!inside)escaped.push(i);}
 t.check('Forward Tab stays inside drawer',escaped.length===0,escaped);
 escaped=[];
 for(let i=0;i<12;i++){await t.key('Tab',8);if(!await t.evaluate('document.querySelector("#sidebar").contains(document.activeElement)'))escaped.push(i);}
 t.check('Reverse Tab stays inside drawer',escaped.length===0,escaped);
 t.check('Background cannot receive programmatic focus',await t.evaluate('(()=>{document.querySelector("#feed-now").focus();return document.querySelector("#sidebar").contains(document.activeElement);})()'));
 await t.shot('drawer-open');await t.key('Escape');await wait(100);
 t.check('Escape closes drawer and restores trigger',await t.evaluate('!document.querySelector("#sidebar").classList.contains("open")&&document.activeElement.id==="open-sidebar"'));
 t.check('Closed drawer removed from focus order',await t.evaluate('document.querySelector("#sidebar").inert&&document.querySelector("#open-sidebar").getAttribute("aria-expanded")==="false"'));
 t.check('Background interactive after close',await t.evaluate('(()=>{document.querySelector("#feed-now").focus();return document.activeElement.id==="feed-now";})()'));
 await openDrawer();
 await t.click('#sidebar a[href="#/settings"]');
 await until(()=>t.evaluate('location.hash==="#/settings"&&!!document.querySelector("#threshold-form")'),'settings navigation');
 const navigation=await t.evaluate('({hash:location.hash,inert:document.querySelector("#main-content").inert,open:document.querySelector("#sidebar").classList.contains("open"),focus:document.activeElement.id})');
 t.check('Navigation clears drawer and inert background',navigation.hash==='#/settings'&&!navigation.inert&&!navigation.open,navigation);
 await openDrawer();await t.key('Escape');
 t.check('Drawer works after SPA rerender',await t.evaluate('document.activeElement.id==="open-sidebar"&&!document.querySelector("#main-content").inert'));
 await openDrawer();await t.click('#logout-button');
 await until(()=>t.evaluate('!!document.querySelector("#modal-confirm")'),'logout dialog');
 await t.key('Tab');
 t.check('Nested confirmation owns keyboard focus',await t.evaluate('!!document.activeElement.closest("#modal-root [role=dialog]")'));
 await t.key('Escape');
 t.check('Cancel confirmation restores drawer focus',await t.evaluate('!document.querySelector("#modal-confirm")&&document.activeElement.id==="logout-button"&&document.querySelector("#sidebar").classList.contains("open")'));
 await t.key('Escape');
 await openDrawer();
 const backdrop=await t.evaluate('(()=>{const right=document.querySelector("#sidebar").getBoundingClientRect().right;const x=(right+document.documentElement.clientWidth)/2,y=innerHeight/2;return {x,y,hit:document.elementFromPoint(x,y)?.id};})()');
 t.check('Backdrop point avoids native scrollbar',backdrop.hit==='drawer-overlay',backdrop);
 await t.send('Input.dispatchMouseEvent',{type:'mousePressed',x:backdrop.x,y:backdrop.y,button:'left',clickCount:1});
 await t.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:backdrop.x,y:backdrop.y,button:'left',clickCount:1});
 t.check('Backdrop closes drawer and restores focus',await t.evaluate('document.activeElement.id==="open-sidebar"&&!document.querySelector("#main-content").inert'));
 await t.viewport(1440,1024);await openDrawer();
 await t.evaluate('document.querySelector("#logout-button").focus()');await t.key('Tab');
 t.check('Desktop drawer loops forward',await t.evaluate('document.activeElement.matches("#sidebar .brand")'));
 await t.key('Escape');
 t.check('No runtime exceptions',t.errors.length===0,t.errors);
}finally{await t.close();}
if(t.results.some(r=>!r.pass))process.exitCode=1;
