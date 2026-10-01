(() => {
 'use strict';
 const $=s=>document.querySelector(s);
 let csrf='',generation=0,controller=null;
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function api(path,options={}) {
  const response=await fetch(path,{...options,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,...options.headers}});
  const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Server tidak dapat memproses permintaan.');return data;
 }
 function message(target,error){$(target).textContent=error.message||'Server tidak dapat dihubungi. Periksa internet.';}
 async function loadUnit() {
  const ticket=++generation;controller?.abort();controller=new AbortController();
  const id=$('#unit-select').value;$('#unit-view').textContent=id?'Memuat unit…':'Pilih unit untuk memulai.';
  if(!id)return;
  try {
   const {unit}=await api('/api/units/'+encodeURIComponent(id)+'/dashboard',{signal:controller.signal});
   if(ticket!==generation||id!==$('#unit-select').value)return;
   const status={waiting:'Terdaftar, menunggu koneksi',online:'Online',offline:'Offline'}[unit.connection.state];
   const r=unit.latest_reading;
   const commands=unit.commands.map(c=>`<li>${escape(c.actuator)} · ${escape({pending:'Dikirim',delivered:'Diterima, belum selesai',succeeded:'Selesai (ACK)',failed:'Gagal',timeout:'Timeout'}[c.status]||c.status)} · ${escape(c.provenance)}</li>`).join('');
   $('#unit-view').innerHTML=`<h3>${escape(unit.name)}</h3><p class="badge">${escape(status)}</p>${r?`<p class="reading">${r.temperature===null?'Tidak tersedia':escape(r.temperature)+' °C'}</p><p>${escape(r.freshness.relative)} · ${escape(r.freshness.state)} · ${escape(r.provenance)}</p>`:'<p>Belum ada pembacaan suhu.</p>'}<h3>Langkah pemasangan</h3><ol><li>Nyalakan unit sesuai panduan paket.</li><li>Hubungkan unit ke WiFi melalui mode pengaturan perangkat.</li><li>Kembali ke aplikasi untuk memeriksa heartbeat.</li></ol><p>Pengaturan WiFi dan uji fisik masih menunggu integrasi firmware.</p><button class="btn" disabled>Uji pompa · menunggu device</button> <button class="btn" disabled>Uji feeder · menunggu device</button><h3>Histori perintah</h3>${commands?'<ul>'+commands+'</ul>':'<p>Belum ada perintah.</p>'}`;
  }catch(error){if(ticket!==generation||error.name==='AbortError')return;message('#unit-view',error);}
 }
 async function refreshUnits(selectId) {
  const {units,seller}=await api('/api/units');
  $('#unit-select').innerHTML='<option value="">Pilih unit</option>'+units.map(u=>`<option value="${escape(u.id)}">${escape(u.name)} (${escape(u.id)})</option>`).join('');
  $('#seller-panel').hidden=!seller;
  if(selectId)$('#unit-select').value=selectId;
  if(units.length)await loadUnit();else $('#unit-view').textContent='Belum ada unit produk. Klaim unit menggunakan kode aktivasi.';
  if(seller){const result=await api('/api/seller/units');$('#seller-list').textContent=result.units.length?result.units.map(u=>u.serial+' · '+(u.used_at===null?'Belum diklaim':'Sudah dimiliki client')).join('\n'):'Belum ada unit diterbitkan.';}
 }
 function bind(formId,target,path,onSuccess) {
  $(formId).addEventListener('submit',async event=>{
   event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;$(target).textContent='Memproses…';
   try{const data=await api(path,{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});await onSuccess(data);}
   catch(error){message(target,error);}finally{button.disabled=false;}
  });
 }
 bind('#claim-form','#claim-status','/api/units/claim',async({unit})=>{$('#claim-status').textContent='Klaim berhasil. Terdaftar, menunggu koneksi.';$('#claim-form').reset();await refreshUnits(unit.id);});
 bind('#seller-form','#seller-status','/api/seller/units',async({unit})=>{
  $('#seller-status').textContent='Unit diterbitkan. Cetak kode ini sebelum meninggalkan halaman; kode tidak ditampilkan lagi.';
  $('#activation-label').hidden=false;$('#print-label').hidden=false;
  $('#activation-label').innerHTML=`<h3>AquaSmart · ${escape(unit.serial_number)}</h3><p>Kode aktivasi: <strong>${escape(unit.activation_code)}</strong></p><p>Berlaku sampai ${escape(new Date(unit.expires_at*1000).toISOString())} (UTC)</p><p>Buka Tambah Perangkat dan masukkan serial serta kode. QR belum tersedia.</p>`;
  $('#seller-form').reset();await refreshUnits();
 });
 $('#print-label').addEventListener('click',()=>window.print());$('#unit-select').addEventListener('change',loadUnit);
 api('/api/auth/me').then(async data=>{csrf=data.csrf_token;$('#session-status').textContent='Masuk sebagai '+data.user.name;$('#product-app').hidden=false;await refreshUnits();}).catch(error=>{$('#session-status').innerHTML=escape(error.message)+' <a href="/#/login">Masuk ke akun</a>';});
})();
