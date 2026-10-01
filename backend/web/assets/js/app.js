import { icon } from './icons.js';
import { app, escapeHtml, modalRoot, navigate, qs, qsa, route } from './dom.js';
import { average, clamp, formatTime, initials, random, sensorNumber } from './format.js';
import { showModal, toast } from './ui-overlay.js';
import { APP_KEY, apiMode, applyServerUser, authenticated, connectionLabel, csrfToken, currentDevice, loadState, SESSION_KEY, setApiMode, setAuthenticated, setCsrfToken, setState, state, saveState, isAuthed } from './state-store.js';
import { mapServerAlert, mapServerAuditLog, mapServerDevice, mapServerReading } from './server-mappers.js';

import { landingPage, loginPage, registerPage } from './views-public.js';
import { dataModeCopy, diagnosticPanel, provenanceBadge, rowSource, sourceCountsView, sourceNames } from './provenance.js';
import { dashboardPage, deviceEmptyState, qualityIssues, qualityRecommendations, qualitySummary, readingStatus } from './views-dashboard.js';
import { appShell, pageMeta } from './shell-nav.js';
import { ApiError, ApiUnavailableError, apiRequest } from './api-client.js';
import { alertsPage, calendarResults, profilePage, reportsPage, settingsPage } from './views-routes.js';
import { loadDiagnostics, restoreSession, syncApiData, syncCurrentDeviceData, useDemoMode } from './session.js';
(() => {
  'use strict';




  let simulationTimer = null;
  let resizeHandler = null;
  let commonCleanup = null;

  function bindOperationsPanels() {
    if(apiMode!=='api'||!currentDevice())return;
    const deviceId=currentDevice().id;
    const list=qs('#growth-list'),commands=qs('#command-list');
    apiRequest('/api/growth-observations').then(result=>{
      if(!list?.isConnected)return;
      const rows=result.observations.filter(row=>row.device_id===deviceId);
      list.innerHTML=rows.length?`<table><thead><tr><th>Tanggal</th><th>Gram</th><th>cm</th><th>Catatan</th><th>Aksi</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${escapeHtml(row.observed_at)}</td><td>${row.weight_g??'—'}</td><td>${row.length_cm??'—'}</td><td>${provenanceBadge(row.provenance)} ${escapeHtml(row.notes)}</td><td>${state.user.accessRole==='admin'?`<button class="btn btn-sm" data-delete-growth="${row.id}">Hapus</button>`:'Akses baca'}</td></tr>`).join('')}</tbody></table>`:'Belum ada observasi.';
      qsa('[data-delete-growth]',list).forEach(button=>button.addEventListener('click',()=>showModal({title:'Hapus observasi?',body:'Catatan ini akan dihapus dan tindakan tercatat di audit.',onConfirm:async()=>{await apiRequest(`/api/growth-observations/${button.dataset.deleteGrowth}`,{method:'DELETE'});render();}})));
    }).catch(error=>{if(list?.isConnected)list.textContent=error.message;});
    const refreshCommands = () => apiRequest(`/api/devices/${encodeURIComponent(deviceId)}/commands`).then(result=>{
      if(!commands?.isConnected)return;
      commands.innerHTML=result.commands.length?`<table><thead><tr><th>Waktu</th><th>Aktuator</th><th>Durasi</th><th>Status</th><th>Sumber</th></tr></thead><tbody>${result.commands.map(row=>`<tr><td>${formatTime(row.created_at*1000)}</td><td>${escapeHtml(row.actuator)}</td><td>${row.duration} detik</td><td>${escapeHtml(row.status)}</td><td>${provenanceBadge(row.provenance)}</td></tr>`).join('')}</tbody></table>`:'Belum ada perintah.';
    }).catch(error=>{if(commands?.isConnected)commands.textContent=error.message;});
    refreshCommands();
    simulationTimer = setInterval(refreshCommands, 5000);
    qs('#growth-form')?.addEventListener('submit',async event=>{
      event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;
      try{await apiRequest('/api/growth-observations',{method:'POST',body:{device_id:deviceId,observed_at:qs('#growth-date').value,weight_g:qs('#growth-weight').value?Number(qs('#growth-weight').value):null,length_cm:qs('#growth-length').value?Number(qs('#growth-length').value):null,notes:qs('#growth-notes').value.trim()}});render();toast('Observasi tersimpan.');}
      catch(error){toast(error.message,'warning');}finally{button.disabled=false;}
    });
  }

  function applyReadOnlyAccess() {
    if (apiMode === 'api' && state.user.accessRole === 'viewer') {
      qsa('[data-control], #feed-now, #schedule-form input, #schedule-form select, #schedule-form button, [data-delete-schedule], #threshold-form input, #threshold-form button, #mark-read').forEach(node=>node.disabled=true);
    }
  }

  function bindWorkspace() {
    if (apiMode !== 'api') return;
    qs('#invite-form')?.addEventListener('submit', async event=>{
      event.preventDefault(); const button=event.currentTarget.querySelector('button');button.disabled=true;
      try { const result=await apiRequest('/api/invitations',{method:'POST',body:{contact:qs('#invite-contact').value.trim()}});qs('#invite-output').textContent=`Kode: ${result.invitation.token}. Bagikan hanya kepada kontak yang diundang. Kedaluwarsa: ${formatTime(result.invitation.expires_at)}.`; }
      catch(error){toast(error.message,'warning');} finally {button.disabled=false;}
    });
    qs('#accept-invite-form')?.addEventListener('submit',async event=>{
      event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;
      try { const result=await apiRequest('/api/invitations/accept',{method:'POST',body:{token:qs('#invite-token').value.trim()}});applyServerUser(result.user);await syncApiData();render(); }
      catch(error){toast(error.message,'warning');} finally{button.disabled=false;}
    });
    const container=qs('#workspace-members');
    apiRequest('/api/workspace').then(result=>{
      if(!container?.isConnected)return;
      container.innerHTML=`<h3>Anggota ruang</h3>${result.members.map(member=>`<p>${escapeHtml(member.name)} — ${escapeHtml(member.role)} ${state.user.accessRole==='admin' && member.id!==state.user.id ? `<button class="btn btn-sm" data-revoke-member="${member.id}">Cabut akses</button>`:''}</p>`).join('')}`;
      qsa('[data-revoke-member]',container).forEach(button=>button.addEventListener('click',()=>showModal({title:'Cabut akses viewer?',body:'Anggota tidak lagi dapat membaca data ruang ini.',onConfirm:async()=>{await apiRequest(`/api/workspace/members/${button.dataset.revokeMember}`,{method:'DELETE'});render();}})));
    }).catch(error=>{if(container?.isConnected)container.textContent=error.message;});
  }

  function render() {
    clearRuntime();
    const current = route();
    const protectedRoutes = ['dashboard', 'alerts', 'reports', 'settings', 'profile'];
    if (protectedRoutes.includes(current) && !isAuthed()) { navigate('login'); return; }
    if ((current === 'login' || current === 'register') && isAuthed()) { navigate('dashboard'); return; }

    if (current === 'home') app.innerHTML = landingPage();
    else if (current === 'login') app.innerHTML = loginPage();
    else if (current === 'register') app.innerHTML = registerPage();
    else if (current === 'dashboard') app.innerHTML = dashboardPage();
    else if (current === 'alerts') app.innerHTML = alertsPage();
    else if (current === 'reports') app.innerHTML = reportsPage();
    else if (current === 'settings') app.innerHTML = settingsPage();
    else if (current === 'profile') app.innerHTML = profilePage();
    else { navigate('home'); return; }

    document.title = current === 'home' ? 'AquaSmart AIoT' : `${pageMeta[current]?.[0] || 'AquaSmart'} — AquaSmart`;
    bindCommon();
    if (current === 'home') window.AquaSmartExperience?.initLanding?.();
    if (current === 'login') bindLogin();
    if (current === 'register') bindRegister();
    if (current === 'dashboard') bindDashboard();
    if (current === 'alerts') bindAlerts();
    if (current === 'reports') { bindReports(); bindOperationsPanels(); }
    if (current === 'settings') bindSettings();
    if (current === 'profile') bindProfile();
    if (current === 'settings') bindWorkspace();
    applyReadOnlyAccess();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function clearRuntime() {
    commonCleanup?.();
    commonCleanup = null;
    window.AquaSmartExperience?.teardown?.();
    if (simulationTimer) clearInterval(simulationTimer);
    simulationTimer = null;
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
    modalRoot.innerHTML = '';
    app.removeAttribute('aria-hidden');
    app.removeAttribute('inert');
  }

  function bindCommon() {
    const sidebarEl = qs('#sidebar');
    const overlay = qs('#drawer-overlay');
    const trigger = qs('#open-sidebar');
    const events = new AbortController();
    const background = [qs('.app-topbar'), qs('#main-content'), qs('.skip-link')].filter(Boolean);
    let previousInert = [];
    if (sidebarEl) {
      sidebarEl.inert = true;
      sidebarEl.setAttribute('aria-hidden', 'true');
      sidebarEl.setAttribute('role', 'dialog');
      sidebarEl.setAttribute('aria-modal', 'true');
    }
    trigger?.setAttribute('aria-controls', 'sidebar');
    trigger?.setAttribute('aria-expanded', 'false');
    const open = () => {
      if (!sidebarEl || sidebarEl.classList.contains('open')) return;
      previousInert = background.map(node => node.inert);
      sidebarEl.inert = false;
      sidebarEl.removeAttribute('aria-hidden');
      sidebarEl.classList.add('open');
      overlay?.classList.add('open');
      trigger?.setAttribute('aria-expanded', 'true');
      qs('#close-sidebar')?.focus({ preventScroll: true });
      background.forEach(node => { node.inert = true; });
    };
    const close = (restoreFocus = true) => {
      if (!sidebarEl?.classList.contains('open')) return;
      background.forEach((node, index) => { node.inert = previousInert[index]; });
      sidebarEl.classList.remove('open');
      overlay?.classList.remove('open');
      trigger?.setAttribute('aria-expanded', 'false');
      if (restoreFocus) trigger?.focus({ preventScroll: true });
      sidebarEl.inert = true;
      sidebarEl.setAttribute('aria-hidden', 'true');
    };
    trigger?.addEventListener('click', open);
    qs('#close-sidebar')?.addEventListener('click', () => close());
    overlay?.addEventListener('click', () => close());
    qsa('a[href^="#/"]', sidebarEl || app).forEach(link => link.addEventListener('click', () => close()));
    document.addEventListener('keydown', event => {
      if (!sidebarEl?.classList.contains('open') || modalRoot.childElementCount) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      const controls = qsa('a[href], button:not([disabled]), [tabindex="0"]', sidebarEl)
        .filter(node => node.getClientRects().length && !node.closest('[inert]'));
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) return;
      const outside = !sidebarEl.contains(document.activeElement);
      if (outside || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }, { signal: events.signal });
    commonCleanup = () => { close(false); events.abort(); };
    qsa('[data-scroll]').forEach(link => link.addEventListener('click', event => {
      event.preventDefault();
      qs(`#${link.dataset.scroll}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    }));
    qs('#logout-button')?.addEventListener('click', () => showModal({
      title: 'Keluar dari dashboard?',
      body: apiMode === 'api' ? 'Sesi server di perangkat ini akan diakhiri.' : 'Sesi demo di browser ini akan diakhiri.',
      confirmText: 'Ya, keluar',
      danger: true,
      onConfirm: async () => {
        try {
          if (apiMode === 'api') await apiRequest('/api/auth/logout', { method: 'POST', body: {} });
          setAuthenticated(false);
          setCsrfToken('');
          sessionStorage.removeItem(SESSION_KEY);
          toast('Anda berhasil keluar.', 'success');
          navigate('home');
        } catch (error) {
          toast(error.message || 'Logout gagal. Coba lagi.', 'warning');
        }
      }
    }));
  }

  function bindLogin() {
    const form = qs('#login-form');
    const password = qs('#password');
    qs('#toggle-password')?.addEventListener('click', event => {
      password.type = password.type === 'password' ? 'text' : 'password';
      event.currentTarget.setAttribute('aria-label', password.type === 'password' ? 'Tampilkan password' : 'Sembunyikan password');
    });
    qs('#demo-mode-button')?.addEventListener('click', () => {
      setAuthenticated(true);
      sessionStorage.setItem(SESSION_KEY, 'true');
      toast('Mode demo browser diaktifkan.', 'warning');
      navigate('dashboard');
    });
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(form);
      const submit = form.querySelector('[type="submit"]');
      const username = data.get('username')?.trim() || '';
      const passwordValue = data.get('password') || '';
      const errorNode = qs('#login-error');
      errorNode.classList.remove('show');

      if (apiMode !== 'api') {
        errorNode.textContent = 'Backend tidak tersedia. Gunakan tombol Mode Demo di bawah formulir.';
        errorNode.classList.add('show');
        qs('#demo-mode-button')?.focus();
        return;
      }

      submit.disabled = true;
      try {
        const payload = await apiRequest('/api/auth/login', {
          method: 'POST',
          body: { username, password: passwordValue }
        });
        setAuthenticated(true);
        setCsrfToken(payload.csrf_token || '');
        applyServerUser(payload.user);
        sessionStorage.setItem(SESSION_KEY, 'true');
        await syncApiData();
        toast('Login berhasil melalui API lokal.', 'success');
        navigate('dashboard');
      } catch (error) {
        if (error instanceof ApiUnavailableError) {
          useDemoMode();
          toast('API terputus. Pilih Mode Demo bila ingin melanjutkan tanpa server.', 'warning');
          render();
          return;
        }
        errorNode.textContent = error.message || 'Login gagal. Coba lagi.';
        errorNode.classList.add('show');
        password.focus();
      } finally {
        submit.disabled = false;
      }
    });
  }

  function bindRegister() {
    const form = qs('#register-form');
    if (!form) return;

    qsa('[data-toggle-password]', form).forEach(button => button.addEventListener('click', () => {
      const input = qs(`#${button.dataset.togglePassword}`, form);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      button.setAttribute('aria-label', input.type === 'password' ? 'Tampilkan password' : 'Sembunyikan password');
    }));

    const fields = {
      name: qs('#register-name', form),
      contact: qs('#register-contact', form),
      password: qs('#register-password', form),
      confirmation: qs('#register-password-confirmation', form),
      serial: qs('#register-serial', form)
    };
    const errors = {
      name: qs('#register-name-error', form),
      contact: qs('#register-contact-error', form),
      password: qs('#register-password-error', form),
      confirmation: qs('#register-confirmation-error', form)
    };
    const setInvalid = (key, invalid) => {
      fields[key].setAttribute('aria-invalid', String(invalid));
      errors[key].classList.toggle('show', invalid);
      return invalid;
    };
    const validContact = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      || /^08\d{8,13}$/.test(value.replace(/[\s-]/g, ''));
    const validate = () => {
      const nameInvalid = setInvalid('name', !fields.name.value.trim() || [...fields.name.value].length > 100);
      const contactInvalid = setInvalid('contact', !validContact(fields.contact.value.trim()));
      const passwordInvalid = setInvalid('password', fields.password.value.length < 8 || new TextEncoder().encode(fields.password.value).length > 1024);
      const confirmationInvalid = setInvalid('confirmation', fields.confirmation.value !== fields.password.value);
      return !(nameInvalid || contactInvalid || passwordInvalid || confirmationInvalid);
    };

    ['name', 'contact', 'password', 'confirmation'].forEach(key => fields[key].addEventListener('blur', validate));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const globalError = qs('#register-error', form);
      globalError.classList.remove('show');
      if (!validate()) {
        form.querySelector('[aria-invalid="true"]')?.focus();
        return;
      }
      if (apiMode !== 'api') {
        globalError.textContent = 'Backend tidak tersedia. Jalankan server lokal untuk membuat akun.';
        globalError.classList.add('show');
        return;
      }

      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const payload = await apiRequest('/api/auth/register', {
          method: 'POST',
          body: {
            name: fields.name.value.trim(),
            contact: fields.contact.value.trim(),
            password: fields.password.value,
            password_confirmation: fields.confirmation.value,
            serial_number: fields.serial.value.trim()
          }
        });
        setAuthenticated(true);
        setCsrfToken(payload.csrf_token || '');
        applyServerUser(payload.user);
        sessionStorage.setItem(SESSION_KEY, 'true');
        await syncApiData();
        toast('Akun berhasil dibuat.', 'success');
        navigate('dashboard');
      } catch (error) {
        globalError.textContent = error.message || 'Akun belum dapat dibuat. Periksa data lalu coba lagi.';
        globalError.classList.add('show');
        if (error instanceof ApiUnavailableError) setApiMode('demo');
      } finally {
        submit.disabled = false;
      }
    });
  }

  function bindDashboard() {
    if (!currentDevice()) return;
    
    // Bind demo button on dashboard
    const demoBtn = qs('.demo-dashboard-btn');
    if (demoBtn) {
      demoBtn.addEventListener('click', () => window.AquaSmartExperience?.openDemo(demoBtn));
    }
    
    qsa('[data-device]').forEach(button => button.addEventListener('click', async () => {
      state.activeDevice = Number(button.dataset.device);
      saveState();
      if (apiMode === 'api') {
        try {
          await syncCurrentDeviceData();
        } catch (error) {
          toast(error.message || 'Data perangkat gagal dimuat.', 'warning');
        }
      }
      render();
    }));
    qsa('[data-control]').forEach(input => input.addEventListener('change', async () => {
      const device = currentDevice();
      const actuator = input.dataset.control;
      const nextValue = input.checked;
      const previousValue = device[actuator];
      input.disabled = true;
      try {
        if (apiMode === 'api') {
          const payload = await apiRequest(`/api/devices/${encodeURIComponent(device.id)}/control`, {
            method: 'POST',
            body: { actuator, value: nextValue }
          });
          const index = state.devices.findIndex(item => item.id === payload.device.id);
          if (index >= 0) state.devices[index] = mapServerDevice(payload.device);
        } else {
          device[actuator] = nextValue;
        }
        saveState();
        const status = qs(`#${actuator}-status`);
        if (status) status.textContent = `${apiMode==='api'?'Permintaan':'Status'}: ${nextValue ? 'Aktif' : 'Nonaktif'}`;
        toast(apiMode==='api' ? 'Permintaan tersimpan; status eksekusi simulator ada di Laporan.' : `${actuator === 'aerator' ? 'Aerator' : 'Mode otomatis'} ${nextValue ? 'diaktifkan' : 'dinonaktifkan'}.`, 'success');
      } catch (error) {
        input.checked = previousValue;
        toast(error.message || 'Kontrol perangkat gagal.', 'warning');
      } finally {
        input.disabled = false;
      }
    }));
    qs('#feed-now')?.addEventListener('click', () => showModal({ title: 'Jalankan feeder?', body: `Antrekan simulasi feeder ${escapeHtml(currentDevice().name)} berdurasi 8 detik. Perintah bukan bukti eksekusi hardware.`, confirmText: 'Beri pakan', onConfirm: runFeeder }));
    qs('#schedule-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const time = qs('#schedule-time').value;
      const duration = Math.min(30, Math.max(1, Number(qs('#schedule-duration').value)));
      const days = qs('#schedule-days').value;
      const submit = event.currentTarget.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        if (apiMode === 'api') {
          const payload = await apiRequest(`/api/devices/${encodeURIComponent(currentDevice().id)}/schedules`, {
            method: 'POST',
            body: { time, duration, days }
          });
          state.schedules.push(payload.schedule);
        } else {
          state.schedules.push({ id: Date.now(), time, duration, days, active: true });
        }
        saveState();
        toast('Jadwal pakan berhasil ditambahkan.', 'success');
        render();
      } catch (error) {
        toast(error.message || 'Jadwal gagal ditambahkan.', 'warning');
        submit.disabled = false;
      }
    });
    qsa('[data-delete-schedule]').forEach(button => button.addEventListener('click', () => showModal({
      title: 'Hapus jadwal?',
      body: 'Jadwal pakan ini akan dihapus dari prototype.',
      confirmText: 'Hapus',
      danger: true,
      onConfirm: async () => {
        const scheduleId = Number(button.dataset.deleteSchedule);
        try {
          if (apiMode === 'api') await apiRequest(`/api/schedules/${scheduleId}`, { method: 'DELETE', body: {} });
          state.schedules = state.schedules.filter(s => s.id !== scheduleId);
          saveState();
          toast('Jadwal berhasil dihapus.', 'success');
          render();
        } catch (error) {
          toast(error.message || 'Jadwal gagal dihapus.', 'warning');
        }
      }
    })));
    drawChart();
    resizeHandler = () => drawChart();
    window.addEventListener('resize', resizeHandler);
    simulationTimer = apiMode === 'api'
      ? setInterval(refreshDashboardData, 15000)
      : setInterval(simulateReading, 5000);
  }

  async function runFeeder() {
    const device = currentDevice();
    const status = qs('#feeder-status');
    try {
      if (apiMode === 'api') {
        const payload = await apiRequest(`/api/devices/${encodeURIComponent(device.id)}/control`, {
          method: 'POST',
          body: { actuator: 'feeder', value: true, duration: 8, request_id: crypto.randomUUID() }
        });
        const index = state.devices.findIndex(item => item.id === payload.device.id);
        if (index >= 0) state.devices[index] = mapServerDevice(payload.device);
        if (status) status.textContent = 'Menunggu simulator';
        toast('Perintah diantrekan. Periksa hasil simulator di Laporan; belum ada bukti hardware.');
        return;
      } else {
        device.feeder = true;
      }
      saveState();
      if (status) status.textContent = 'Aktif';
      toast('Feeder aktif selama 8 detik.', 'success');

      setTimeout(async () => {
        try {
          if (apiMode === 'api' && authenticated) {
            const payload = await apiRequest(`/api/devices/${encodeURIComponent(device.id)}/control`, {
              method: 'POST',
              body: { actuator: 'feeder', value: false }
            });
            const index = state.devices.findIndex(item => item.id === payload.device.id);
            if (index >= 0) state.devices[index] = mapServerDevice(payload.device);
          } else {
            device.feeder = false;
          }
          saveState();
          if (qs('#feeder-status')) qs('#feeder-status').textContent = 'Siap';
        } catch (_) {
          toast('Feeder perlu dimatikan manual karena sinkronisasi gagal.', 'warning');
        }
      }, 8000);
    } catch (error) {
      toast(error.message || 'Feeder gagal dijalankan.', 'warning');
    }
  }

  async function refreshDashboardData() {
    if (route() !== 'dashboard' || apiMode !== 'api' || !authenticated) return;
    try {
      await syncApiData();
      if (route() !== 'dashboard') return;
      updateLiveReadout();
      drawChart();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAuthenticated(false);
        sessionStorage.removeItem(SESSION_KEY);
        navigate('login');
        return;
      }
      toast('Sinkronisasi data tertunda.', 'warning');
    }
  }

  function updateLiveReadout() {
    const d = currentDevice();
    if (!d) { render(); return; }
    for (const [kind, value, decimals, unit] of [['ph', d.ph, 1, 'pH'], ['temp', d.temp, 1, '°C'], ['turbidity', d.turbidity, 0, 'NTU']]) {
      const node = qs(`[data-live-value="${kind}"]`);
      if (!node) continue;
      node.innerHTML = `${sensorNumber(value, decimals)}<small>${unit}</small>`;
      const status = node.closest('.metric-card').querySelector('.metric-status');
      const [label, cls] = readingStatus(kind, value);
      status.textContent = label; status.className = `metric-status ${cls}`;
    }
    if (qs('#quality-summary')) qs('#quality-summary').innerHTML = qualitySummary(d);
    if (qs('#quality-recommendations')) qs('#quality-recommendations').innerHTML = qualityRecommendations(d);
    if (qs('#last-updated')) qs('#last-updated').textContent = d.lastSeen ? formatTime(d.lastSeen) : 'belum tersedia';
    if (qs('#data-source-copy')) qs('#data-source-copy').textContent = dataModeCopy();
    const deviceStatus = qs('.metric-device .metric-status');
    if (deviceStatus) {
      deviceStatus.textContent = d.online ? 'Online' : 'Offline';
      deviceStatus.className = 'metric-status ' + (d.online ? 'text-success' : 'text-danger');
      qs('.metric-value-device').textContent = d.online ? 'Terhubung' : 'Terputus';
    }
    updateAlertCount();
  }

  function updateAlertCount() {
    const link = qs('.sidebar-nav a[href="#/alerts"]');
    if (!link) return;
    let badge = qs('.nav-count', link);
    const unread = state.alerts.filter(alert=>!alert.read).length;
    if (!badge && unread) {
      badge = document.createElement('span'); badge.className = 'nav-count'; link.append(badge);
    }
    if (badge) { badge.textContent = String(unread); badge.hidden = unread === 0; }
  }

  function simulateReading() {
    if (route() !== 'dashboard') return;
    const d = currentDevice();
    d.ph = clamp(d.ph + random(-.04, .04), 6.4, 8.7);
    d.temp = clamp(d.temp + random(-.15, .15), 24.5, 31);
    d.turbidity = clamp(d.turbidity + random(-1.8, 1.8), 24, 58);
    const reading = { time: new Date().toISOString(), ph: +d.ph.toFixed(2), temp: +d.temp.toFixed(1), turbidity: Math.round(d.turbidity) };
    state.readings.push(reading); if (state.readings.length > 36) state.readings.shift(); saveState();
    d.lastSeen = reading.time;
    updateLiveReadout();
    drawChart();
  }


  function drawChart() {
    const canvas = qs('#history-chart'); if (!canvas) return;
    const rect = canvas.getBoundingClientRect(); if (rect.width < 10) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(rect.width * dpr); canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    const width = rect.width; const height = rect.height; const pad = { l: 34, r: 17, t: 18, b: 28 };
    const cw = width - pad.l - pad.r; const ch = height - pad.t - pad.b;
    ctx.clearRect(0, 0, width, height);
    const designTokens = getComputedStyle(document.documentElement);
    const clearWater = designTokens.getPropertyValue('--clear-water').trim() || '#4C9A8E';
    const sediment = designTokens.getPropertyValue('--sediment').trim() || '#B9834F';
    const ink = designTokens.getPropertyValue('--ink').trim() || '#10262A';
    const foamLine = designTokens.getPropertyValue('--foam-line').trim() || '#D8E2DE';
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillStyle = ink;
    ctx.strokeStyle = foamLine;
    ctx.globalAlpha = .72;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const y = pad.t + ch * i / 4; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(width - pad.r, y); ctx.stroke(); ctx.fillText(String(100 - i * 25), 4, y + 3); }
    ctx.globalAlpha = 1;
    const rows = state.readings.slice(-18);
    if (rows.length < 2) return;
    const datasets = [
      { key: 'ph', color: clearWater, dash: [], normalize: v => (v - 6) / 3 },
      { key: 'temp', color: clearWater, dash: [5, 4], normalize: v => (v - 22) / 12 },
      { key: 'turbidity', color: sediment, dash: [], normalize: v => v / 100 }
    ];
    datasets.forEach(set => {
      ctx.beginPath(); ctx.lineWidth = 2.4; ctx.strokeStyle = set.color; ctx.setLineDash(set.dash); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      rows.forEach((row, i) => { const x = pad.l + i * cw / (rows.length - 1); const y = pad.t + ch - clamp(set.normalize(Number(row[set.key])), 0, 1) * ch; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.fillStyle = ink; const ticks = [0, Math.floor((rows.length - 1) / 2), rows.length - 1]; ticks.forEach(i => { const x = pad.l + i * cw / (rows.length - 1); const label = new Date(rows[i].time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); ctx.fillText(label, x - 14, height - 7); });
  }

  function bindAlerts() {
    if (apiMode === 'api') {
      const list = qs('.alert-list');
      list.insertAdjacentHTML('beforebegin', '<p id="alert-sync-status" class="col-12" role="status"></p>');
      const refresh = async () => {
        try {
          const payload = await apiRequest('/api/alerts?limit=50');
          if (route() !== 'alerts' || !list.isConnected) return;
          state.alerts = payload.alerts.map(mapServerAlert);
          updateAlertCount();
          const markup = new DOMParser().parseFromString(alertsPage(), 'text/html');
          list.innerHTML = markup.querySelector('.alert-list').innerHTML || '<p>Belum ada peringatan.</p>';
          qs('#alert-sync-status').textContent = '';
        } catch (error) {
          if (route() === 'alerts' && qs('#alert-sync-status')) qs('#alert-sync-status').textContent = 'Pembaruan tertunda. Data yang tampil adalah hasil sinkronisasi terakhir.';
        }
      };
      refresh();
      simulationTimer = setInterval(refresh, 15000);
    }
    qs('#mark-read')?.addEventListener('click', async event => {
      const unread = state.alerts.filter(alert => !alert.read);
      if (!unread.length) {
        toast('Semua peringatan sudah dibaca.');
        return;
      }
      const button = event.currentTarget;
      button.disabled = true;
      try {
        if (apiMode === 'api') {
          await Promise.all(unread.map(alert => apiRequest(`/api/alerts/${alert.id}/acknowledge`, {
            method: 'PATCH',
            body: {}
          })));
        }
        state.alerts.forEach(alert => { alert.read = true; });
        saveState();
        toast('Semua peringatan ditandai dibaca.', 'success');
        render();
      } catch (error) {
        button.disabled = false;
        toast(error.message || 'Peringatan gagal diperbarui.', 'warning');
      }
    });
  }

  function bindReports() {
    loadDiagnostics();
    qs('#filtered-export-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget, output = qs('#filtered-export-status');
      const query = new URLSearchParams(new FormData(form));
      const controls = [...form.elements], focused = document.activeElement;
      controls.forEach(control => { control.disabled = true; });
      output.textContent = 'Menyiapkan berkas ekspor…';
      output.setAttribute('aria-busy','true');
      try {
        const response = await fetch('/api/export?' + query, { credentials:'same-origin', cache:'no-store', signal:AbortSignal.timeout(20000) });
        if (!response.ok) {
          const detail = await response.json().catch(() => null);
          throw new Error(detail?.error?.message || 'Server tidak dapat menyiapkan ekspor.');
        }
        const blob = await response.blob();
        if (!form.isConnected) return;
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url;
        link.download = `aquasmart-${query.get('device_id')}-${query.get('kind')}-${query.get('period')}-${query.get('date')}.${query.get('format')}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        output.textContent = response.headers.get('X-Export-Rows') === '0'
          ? 'Periode kosong. Berkas berisi struktur kolom atau metadata tanpa data buatan.'
          : 'Berkas siap; unduhan telah dimulai. Semua waktu menggunakan UTC.';
      } catch (error) {
        if (form.isConnected) output.textContent = 'Ekspor gagal: ' + error.message + ' Silakan coba lagi.';
      } finally {
        controls.forEach(control => { control.disabled = false; });
        output.setAttribute('aria-busy','false');
        if (form.isConnected && document.activeElement === document.body) focused?.focus();
      }
    });
    qs('#calendar-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const results = qs('#calendar-results');
      const query = new URLSearchParams({ device_id: qs('#calendar-device').value, date: qs('#calendar-date').value, period: qs('#calendar-period').value });
      const controls = [...form.elements];
      const focused = document.activeElement;
      controls.forEach(control => { control.disabled = true; });
      results.setAttribute('aria-busy', 'true');
      results.textContent = 'Memuat laporan kalender UTC…';
      try {
        const report = await apiRequest('/api/reports?' + query);
        if (form.isConnected) results.innerHTML = calendarResults(report);
      } catch (error) {
        if (form.isConnected) results.textContent = 'Laporan gagal dimuat: ' + error.message + ' Silakan coba lagi.';
      } finally {
        controls.forEach(control => { control.disabled = false; });
        results.setAttribute('aria-busy', 'false');
        if (form.isConnected && (document.activeElement === document.body || document.activeElement === focused)) focused?.focus();
      }
    });
    qs('#calendar-form')?.addEventListener('input', () => {
      qs('#calendar-results').textContent = 'Filter berubah. Tampilkan laporan untuk periode yang dipilih.';
    });
    qs('#export-csv')?.addEventListener('click', exportCsv);
    qs('#report-limit')?.addEventListener('change', event => { state.reportLimit = Number(event.target.value); render(); });
    qs('#report-device')?.addEventListener('change', async event => {
      const select = event.target;
      const previous = state.activeDevice;
      select.disabled = true;
      try {
        state.activeDevice = Number(select.value);
        if (apiMode === 'api') await syncCurrentDeviceData();
        saveState(); render();
      } catch (error) {
        state.activeDevice = previous; select.value = String(previous);
        toast(error.message || 'Data perangkat gagal dimuat.', 'warning');
      } finally { select.disabled = false; }
    });
  }
  function exportCsv() {
    const device = currentDevice();
    if (!device) { toast('Hubungkan perangkat sebelum mengekspor data.', 'warning'); return; }
    const header = 'waktu,device_id,ph,suhu_c,kekeruhan_ntu,simulation,provenance,source_simulation,source_device,source_manual,source_seed,source_legacy_unverified\n';
    const body = state.readings.map(r => [r.time, device.id, r.ph, r.temp, r.turbidity, r.simulation || apiMode !== 'api',rowSource(r),...Object.keys(sourceNames).map(source=>state.readings.filter(row=>rowSource(row)===source).length)].join(',')).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `aquasmart-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(url); toast('Laporan CSV berhasil dibuat.', 'success');
  }

  function bindSettings() {
    bindDeviceManagement();
    qs('#threshold-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const values = { phMin: Number(qs('#ph-min').value), phMax: Number(qs('#ph-max').value), tempMin: Number(qs('#temp-min').value), tempMax: Number(qs('#temp-max').value), turbidityMax: Number(qs('#turbidity-max').value) };
      if (values.phMin >= values.phMax || values.tempMin >= values.tempMax) { toast('Nilai minimum harus lebih kecil dari maksimum.', 'warning'); return; }
      const submit = event.currentTarget.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        if (apiMode === 'api') {
          await apiRequest('/api/settings/thresholds', { method: 'PATCH', body: { ph_min: values.phMin, ph_max: values.phMax, temperature_min: values.tempMin, temperature_max: values.tempMax, turbidity_max: values.turbidityMax } });
        }
        state.thresholds = values; saveState(); toast('Threshold berhasil disimpan.', 'success'); render();
      } catch (error) {
        toast(error.message || 'Threshold gagal disimpan. Coba lagi.', 'warning');
      } finally {
        submit.disabled = false;
      }
    });
  }

  function bindDeviceManagement() {
    if (apiMode !== 'api') return;
    const container = qs('#threshold-form')?.closest('.content-grid');
    if (!container) return;
    if (state.user.accessRole !== 'admin') {
      container.insertAdjacentHTML('beforeend', '<section class="settings-card neu-card col-12"><h2>Kelola Perangkat</h2><p>Viewer memiliki akses baca. Hubungi admin untuk klaim perangkat, perubahan identitas, atau penggantian key.</p></section>');
      return;
    }
    const device = currentDevice();
    container.insertAdjacentHTML('beforeend', `<section class="settings-card neu-card col-12"><h2>Kelola Perangkat</h2>
      <form id="claim-device-form" class="settings-form"><label for="claim-serial">Serial perangkat tersedia</label><input class="form-control" id="claim-serial" maxlength="128" pattern="[A-Za-z0-9_-]+" required autocomplete="off"><button class="btn" type="submit">Klaim Perangkat</button></form>
      ${device ? `<form id="edit-device-form" class="settings-form"><label for="edit-device-id">Perangkat yang diubah</label><select class="form-control" id="edit-device-id">${state.devices.map(d=>`<option value="${escapeHtml(d.id)}" ${d.id===device.id?'selected':''}>${escapeHtml(d.name)}</option>`).join('')}</select><label for="device-name">Nama perangkat</label><input class="form-control" id="device-name" value="${escapeHtml(device.name)}" required maxlength="100"><label for="device-location">Lokasi</label><input class="form-control" id="device-location" value="${escapeHtml(device.location)}" required maxlength="150"><button class="btn" type="submit">Simpan Perangkat</button></form><p>Penggantian key langsung membatalkan key lama. Salin key baru ke simulator/perangkat; key tidak disimpan di browser dan hanya ditampilkan pada hasil ini.</p><button class="btn" id="rotate-device-key" type="button">Ganti Key Perangkat Terpilih</button><output id="device-key-output" class="form-help" aria-live="polite"></output>` : '<p>Belum ada perangkat. Klaim serial yang disediakan admin instalasi.</p>'}
      <p id="device-management-status" role="status"></p></section>`);
    const status = qs('#device-management-status');
    qs('#claim-device-form').addEventListener('submit', async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button');
      button.disabled = true; status.textContent = 'Mengklaim perangkat…';
      try {
        await apiRequest('/api/devices', {method:'POST',body:{serial_number:qs('#claim-serial').value.trim()}});
        await syncApiData(); render(); toast('Perangkat berhasil diklaim.', 'success');
      } catch (error) { status.textContent = error.message || 'Klaim gagal. Coba lagi.'; }
      finally { button.disabled = false; }
    });
    qs('#edit-device-id')?.addEventListener('change', event => {
      const selected = state.devices.find(d=>d.id===event.target.value);
      qs('#device-name').value = selected.name; qs('#device-location').value = selected.location;
      qs('#device-key-output').textContent = ''; status.textContent = '';
    });
    qs('#edit-device-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button');
      button.disabled = true; status.textContent = 'Menyimpan identitas perangkat…';
      try {
        await apiRequest('/api/devices/' + encodeURIComponent(qs('#edit-device-id').value), {method:'PATCH',body:{name:qs('#device-name').value.trim(),location:qs('#device-location').value.trim()}});
        await syncApiData(); render(); toast('Identitas perangkat disimpan.', 'success');
      } catch (error) { status.textContent = error.message || 'Perubahan gagal. Coba lagi.'; }
      finally { button.disabled = false; }
    });
    qs('#rotate-device-key')?.addEventListener('click', async event => {
      const button = event.currentTarget; button.disabled = true;
      const id = qs('#edit-device-id').value;
      qs('#device-key-output').textContent = ''; status.textContent = 'Mengganti key…';
      try {
        const result = await apiRequest('/api/devices/' + encodeURIComponent(id) + '/key', {method:'POST',body:{}});
        qs('#device-key-output').textContent = `${id}: ${result.device_key}`;
        status.textContent = result.notice;
      } catch (error) { status.textContent = error.message || 'Penggantian key gagal.'; }
      finally { button.disabled = false; }
    });
  }

  function bindProfile() {
    qs('#edit-profile')?.addEventListener('click', () => {
      const trigger = document.activeElement;
      app.setAttribute('aria-hidden', 'true');
      app.setAttribute('inert', '');
      modalRoot.innerHTML = `
        <div class="modal-backdrop" data-close-modal>
          <section class="modal-card neu-card" role="dialog" aria-modal="true" aria-labelledby="edit-title" data-modal-card>
            <h2 id="edit-title">Edit Profil</h2>
            <form class="settings-form profile-form" id="profile-form">
              <div><label for="edit-name">Nama lengkap</label><input class="form-control" id="edit-name" value="${escapeHtml(state.user.name)}" required></div>
              <div><label for="edit-phone">Nomor telepon</label><input class="form-control" id="edit-phone" value="${escapeHtml(state.user.phone)}" required></div>
              <div class="modal-actions">
                <button class="btn btn-sm" type="button" id="cancel-profile" data-close-modal>Batal</button>
                <button class="btn btn-primary btn-sm" type="submit">Simpan Perubahan</button>
              </div>
            </form>
          </section>
        </div>`;
      const dialog = modalRoot.querySelector('[data-modal-card]');
      const submitBtn = modalRoot.querySelector('[type="submit"]');
      const cancelBtn = modalRoot.querySelector('#cancel-profile');
      const editName = modalRoot.querySelector('#edit-name');

      function closeProfileModal() {
        modalRoot.removeEventListener('keydown', onProfileKeydown);
        modalRoot.innerHTML = '';
        app.removeAttribute('aria-hidden');
        app.removeAttribute('inert');
        trigger?.focus?.();
      }

      function onProfileKeydown(event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeProfileModal();
          return;
        }
        if (event.key === 'Tab') {
          const focusables = qsa('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', dialog);
          if (!focusables.length) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }

      modalRoot.addEventListener('keydown', onProfileKeydown);
      editName?.focus();

      cancelBtn.addEventListener('click', closeProfileModal);
      qsa('[data-close-modal]', modalRoot).forEach(el => el.addEventListener('click', event => {
        if (event.target.closest('[data-modal-card]') && !event.target.matches('[data-close-modal]')) return;
        closeProfileModal();
      }));

      qs('#profile-form').addEventListener('submit', async event => {
        event.preventDefault();
        submitBtn.disabled = true;
        try {
          const name = qs('#edit-name').value.trim();
          const phone = qs('#edit-phone').value.trim();
          if (apiMode === 'api') await apiRequest('/api/profile', { method: 'PATCH', body: { name, phone } });
          state.user.name = name; state.user.phone = phone; saveState(); closeProfileModal(); toast('Profil berhasil diperbarui.', 'success'); render();
        } catch (_) {
          toast('Gagal memperbarui profil.', 'warning');
        } finally {
          submitBtn.disabled = false;
        }
      });
    });
  }

  document.querySelector('.skip-link')?.addEventListener('click', event => {
    const main = document.getElementById('main-content');
    if (!main) return;
    event.preventDefault(); // This anchor targets content, not a new SPA route.
    main.setAttribute('tabindex', '-1');
    main.focus({ preventScroll: true });
    main.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  window.addEventListener('hashchange', render);
  window.addEventListener('DOMContentLoaded', async () => {
    await restoreSession();
    if (apiMode === 'api' && authenticated) {
      try {
        await syncApiData();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setAuthenticated(false);
          setCsrfToken('');
          sessionStorage.removeItem(SESSION_KEY);
        } else {
          toast('Sebagian data belum dapat disinkronkan.', 'warning');
        }
      }
    }
    render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
})();
