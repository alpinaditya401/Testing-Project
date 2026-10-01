import {writeFileSync} from 'node:fs';
import {launch} from './review_runtime.mjs';
const t=await launch('app-icon-build');
try {
 await t.navigate('home');
 for(const [name,size] of [['icon-192',192],['icon-512',512],['apple-touch-icon',180]]) {
  const data=await t.evaluate(`(async()=>{const img=new Image();img.src='/assets/images/logo.svg';await img.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=${size};const ctx=canvas.getContext('2d');ctx.fillStyle='#0E2A30';ctx.fillRect(0,0,${size},${size});const inset=${size}*.16;ctx.drawImage(img,inset,inset,${size}*.68,${size}*.68);return canvas.toDataURL('image/png').split(',')[1];})()`);
  writeFileSync(new URL('../assets/images/'+name+'.png',import.meta.url),Buffer.from(data,'base64'));
 }
} finally {await t.close();}
