(() => {
  'use strict';

  const FRAME_DURATION_MS = 4500;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let cleanupTasks = [];
  let tubeRuntime = null;
  let demoRuntime = null;
  const libraries = new Map();
  function loadLibrary(name) {
    if (!libraries.has(name)) libraries.set(name, new Promise(resolve => {
      const script = document.createElement('script');
      script.src = `assets/vendor/${name}.min.js`;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.append(script);
    }));
    return libraries.get(name);
  }

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const monitoringFrames = [
    {
      title: 'Baca Sensor',
      caption: 'Sensor membaca pH, suhu, dan kekeruhan air setiap siklus.',
      visual: () => `
        <svg viewBox="0 0 640 420" role="img" aria-label="Tiga sensor IoT membaca parameter air">
          <rect class="foam-fill" x="25" y="80" width="590" height="320" rx="8"/><rect class="line" x="25" y="80" width="590" height="320" rx="8"/>
          <!-- Device container -->
          <rect class="ink-fill" x="40" y="100" width="160" height="120" rx="4"/><text x="120" y="130" text-anchor="middle" font-size="16" fill="#F1F5F3">ESP32</text>
          <!-- Connection lines -->
          <path class="line" d="M200 160 L280 160 L280 200" stroke-dasharray="6 4"/>
          <path class="line" d="M200 160 L360 160 L360 200" stroke-dasharray="6 4"/>
          <path class="line" d="M200 160 L440 160 L440 200" stroke-dasharray="6 4"/>
          <!-- Three sensors with particles -->
          <g class="sensor-node" transform="translate(280,200)">
            <circle class="foam-fill" cx="0" cy="0" r="34"/><circle class="line" cx="0" cy="0" r="34"/>
            <text x="0" y="-15" text-anchor="middle" font-weight="bold">PH</text>
            <text x="0" y="30" text-anchor="middle" font-size="18" fill="#10262A">7.1</text>
            <!-- Reading particles -->
            <circle class="sensor-particle" cx="0" cy="-45" r="3" fill="#4C9A8E" opacity=".6"><animate attributeName="opacity" values="0;0.6;0" dur="1.5s" repeatCount="indefinite"/></circle>
          </g>
          <g class="sensor-node" transform="translate(360,200)">
            <circle class="foam-fill" cx="0" cy="0" r="34"/><circle class="line" cx="0" cy="0" r="34"/>
            <text x="0" y="-15" text-anchor="middle" font-weight="bold">TEMP</text>
            <text x="0" y="30" text-anchor="middle" font-size="18" fill="#10262A">28.4°C</text>
            <circle class="sensor-particle" cx="0" cy="-45" r="3" fill="#4C9A8E" opacity=".6"><animate attributeName="opacity" values="0;0.6;0" dur="1.5s" begin="0.5s" repeatCount="indefinite"/></circle>
          </g>
          <g class="sensor-node" transform="translate(440,200)">
            <circle class="foam-fill" cx="0" cy="0" r="34"/><circle class="line" cx="0" cy="0" r="34"/>
            <text x="0" y="-15" text-anchor="middle" font-weight="bold">NTU</text>
            <text x="0" y="30" text-anchor="middle" font-size="18" fill="#10262A">42</text>
            <circle class="sensor-particle" cx="0" cy="-45" r="3" fill="#4C9A8E" opacity=".6"><animate attributeName="opacity" values="0;0.6;0" dur="1.5s" begin="1.0s" repeatCount="indefinite"/></circle>
          </g>
          <!-- Cloud sync -->
          <path class="line" d="M280 320 H360" stroke-dasharray="8 4"/>
          <rect class="cloud-bg" x="330" y="330" width="100" height="60" rx="8"/>
          <text x="380" y="365" text-anchor="middle" font-size="14" fill="#10262A">SYNC</text>
        </svg>`,
      animate: 'animateSensorRead'
    },
    {
      title: 'Validasi Data',
      caption: 'Validasi tipe angka dan rentang sensor dilakukan sebelum membandingkan threshold. Kekeruhan tinggi belum tentu payload invalid.',
      visual: () => `
        <svg viewBox="0 0 560 350" role="img" aria-label="Data melewati garis validasi dan anomali ditandai">
          <rect class="foam-fill" x="56" y="76" width="448" height="198" rx="4"/><rect class="line" x="56" y="76" width="448" height="198" rx="4"/>
          <path class="muted-line" d="M280 76v198" stroke-dasharray="8 8"/><text x="280" y="54" text-anchor="middle">GARIS VALIDASI</text>
          <g class="validation-point validation-pass"><circle class="safe-fill" cx="122" cy="138" r="13"/><text x="122" y="180" text-anchor="middle">7.1 pH</text></g>
          <g class="validation-point validation-fail"><circle class="watch-fill" cx="122" cy="228" r="13"/><text x="122" y="258" text-anchor="middle">98 NTU</text></g>
          <path class="line" d="M88 138H470M88 228H470" stroke-opacity=".16"/>
          <g class="validation-ok"><path class="line" d="m402 126 10 10 22-25"/><text x="418" y="170" text-anchor="middle">VALID</text></g>
        </svg>`,
      animate: 'animateValidation'
    },
    {
      title: 'Cek Ambang Aman',
      caption: 'Sistem membandingkan kekeruhan dengan ambang batas NTU yang ditetapkan admin.',
      visual: () => `
        <svg viewBox="0 0 560 350" role="img" aria-label="Gauge kekeruhan dengan zona aman, pantau, dan bahaya">
          <path d="M105 255A175 175 0 0 1 280 80" fill="none" stroke="#4C9A8E" stroke-width="24"/>
          <path d="M280 80A175 175 0 0 1 421 151" fill="none" stroke="#B9834F" stroke-width="24"/>
          <path d="M421 151A175 175 0 0 1 455 255" fill="none" stroke="#D2601F" stroke-width="24"/>
          <path class="gauge-needle line" d="M280 255v-122" stroke-width="5"/><circle class="ink-fill" cx="280" cy="255" r="15"/>
          <text class="demo-gauge-value" x="280" y="305" text-anchor="middle">42 NTU</text>
          <text x="105" y="286">0</text><text x="435" y="286">100</text>
        </svg>`,
      animate: 'animateGauge'
    },
    {
      title: 'Status Normal',
      caption: 'Jika dalam batas aman, dashboard diperbarui dengan status Normal.',
      visual: () => `
        <div class="demo-normal-card">
          <span class="readout-gauge-label">KEKERUHAN AIR</span>
          <strong>18 NTU</strong>
          <span class="gauge-status">Normal</span>
          <div class="progress-track"><div class="safe-fill normal-mini-bar"></div></div>
        </div>`,
      animate: 'animateNormalCard'
    },
    {
      title: 'Peringatan Terkirim',
      caption: 'Jika kondisi kritis, sistem mengirim notifikasi dan rekomendasi tindakan ke pembudidaya.',
      visual: () => `
        <div class="demo-notification">
          <svg class="demo-bell" viewBox="0 0 100 100" aria-hidden="true"><path d="M73 42c0-14-9-25-23-25S27 28 27 42c0 27-12 27-12 35h70c0-8-12-8-12-35M42 86h16" fill="none" stroke="currentColor" stroke-width="6"/></svg>
          <div class="demo-toast-card"><strong>Kekeruhan kritis</strong><p>Periksa sirkulasi dan kurangi pakan berikutnya.</p></div>
        </div>`,
      animate: 'animateWarning'
    }
  ];

  const feedingFrames = [
    {
      title: 'Cek Jadwal',
      caption: 'Sistem memuat jadwal pakan aktif dan memeriksa apakah waktunya tercapai.',
      visual: () => `
        <svg viewBox="0 0 560 350" role="img" aria-label="Jam bergerak menuju jadwal pakan">
          <circle class="foam-fill" cx="280" cy="175" r="125"/><circle class="line" cx="280" cy="175" r="125" stroke-width="4"/>
          <path class="line" d="M280 61v18M280 271v18M166 175h18M376 175h18"/>
          <path class="clock-hour line" d="M280 175v-72" stroke-width="6"/><path class="clock-minute line" d="M280 175h84" stroke-width="4"/>
          <circle class="ink-fill" cx="280" cy="175" r="10"/><text class="sensor-value" x="280" y="330" text-anchor="middle">07:00</text>
        </svg>`,
      animate: 'animateClock'
    },
    {
      title: 'Periksa Kesiapan',
      caption: 'Simulasi alur target: periksa jadwal dan durasi. Sensor stok dan porsi gram belum tersedia.',
      visual: () => `
        <div class="demo-checklist">
          ${['Jadwal diperiksa', 'Durasi contoh 8 detik', 'ACK hardware belum tersedia'].map((label) => `<div class="demo-check-row check-item"><svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="none" stroke="#D8E2DE" stroke-width="2"/><path class="check-path" d="m8 14 4 4 8-9" fill="none" stroke="#4C9A8E" stroke-width="3"/></svg><span>${label}</span></div>`).join('')}
        </div>`,
      animate: 'animateChecklist'
    },
    {
      title: 'Kirim Perintah',
      caption: 'Simulasi alur target pengiriman perintah berdurasi ke ESP32; delivery hardware belum diverifikasi.',
      visual: () => `
        <svg viewBox="0 0 560 350" role="img" aria-label="Paket data bergerak dari dashboard ke ESP32">
          <rect class="foam-fill" x="45" y="118" width="145" height="112" rx="4"/><rect class="line" x="45" y="118" width="145" height="112" rx="4"/><text x="117" y="180" text-anchor="middle">DASHBOARD</text>
          <path class="muted-line packet-track" d="M190 174H370" stroke-dasharray="8 8"/>
          <g class="packet"><rect class="ink-fill" x="205" y="151" width="56" height="46" rx="4"/><text x="233" y="180" text-anchor="middle" fill="#F1F5F3">8s</text></g>
          <rect class="foam-fill" x="370" y="118" width="145" height="112" rx="4"/><rect class="line" x="370" y="118" width="145" height="112" rx="4"/><text x="442" y="180" text-anchor="middle">ESP32</text>
        </svg>`,
      animate: 'animatePacket'
    },
    {
      title: 'Feeder Bekerja',
      caption: 'Simulasi alur target motor feeder selama 8 detik. Porsi gram belum dikalibrasi.',
      visual: () => `
        <svg viewBox="0 0 640 480" role="img" aria-label="Motor feeder otomatis bekerja">
          <rect class="foam-fill" x="30" y="50" width="580" height="380" rx="8"/><rect class="line" x="30" y="50" width="580" height="380" rx="8"/>
          <!-- Feeder container -->
          <g transform="translate(150,150)">
            <rect class="ink-fill" x="0" y="0" width="180" height="140" rx="6"/><text x="90" y="40" text-anchor="middle" font-weight="bold" fill="#F1F5F3">FEEDER</text>
            <!-- Motor with rotation indicator -->
            <circle class="feeder-motor" cx="90" cy="70" r="35" stroke="#4C9A8E" stroke-width="3"><animate attributeName="rotation" from="0" to="360" dur="0.7s" repeatCount="indefinite"/></circle>
            <line x1="90" y1="40" x2="90" y2="100" stroke="#F1F5F3" stroke-width="5"/>
            <line x1="60" y1="70" x2="120" y2="70" stroke="#F1F5F3" stroke-width="5"/>
            <!-- Hopper -->
            <path class="hopper-path" d="M40 0L140 0 L110 70 H80 Z" fill="none" stroke="#4C9A8E" stroke-width="3"/>
            <!-- Pellets falling -->
            <g class="pellets">
              <circle class="pellet watch-fill" cx="90" cy="100" r="5"><animate attributeName="cy" from="100" to="180" dur="0.7s" begin="0s" repeatCount="indefinite"/><animate attributeName="opacity" from="0" to="1" dur="0.1s"/></circle>
              <circle class="pellet watch-fill" cx="90" cy="100" r="5"><animate attributeName="cy" from="100" to="180" dur="0.7s" begin="0.2s" repeatCount="indefinite"/><animate attributeName="opacity" from="0" to="1" dur="0.1s"/></circle>
              <circle class="pellet watch-fill" cx="90" cy="100" r="5"><animate attributeName="cy" from="100" to="180" dur="0.7s" begin="0.4s" repeatCount="indefinite"/><animate attributeName="opacity" from="0" to="1" dur="0.1s"/></circle>
              <circle class="pellet watch-fill" cx="82" cy="180" r="4"><animate attributeName="cy" from="100" to="180" dur="0.7s" begin="0.1s" repeatCount="indefinite"/></circle>
              <circle class="pellet watch-fill" cx="98" cy="180" r="4"><animate attributeName="cy" from="100" to="180" dur="0.7s" begin="0.3s" repeatCount="indefinite"/></circle>
            </g>
            <!-- Tank/basin receiving pellets -->
            <ellipse class="tank-bg" cx="90" cy="220" rx="70" ry="30" fill="rgba(76,154,142,.15)"/>
            <text x="90" y="245" text-anchor="middle" font-size="12" fill="#10262A">KOLAM</text>
          </g>
          <!-- Status badge -->
          <rect class="success-badge" x="420" y="200" width="150" height="80" rx="6"/>
          <text x="495" y="230" text-anchor="middle" font-weight="bold" fill="#4C9A8E">SIMULASI</text>
          <text x="495" y="260" text-anchor="middle" font-size="14" fill="#10262A">Simulasi · 8s</text>
        </svg>`,
      animate: 'animateFeeder'
    },
    {
      title: 'Tercatat',
      caption: 'Target log eksekusi: contoh tampilan, bukan bukti feeder fisik selesai.',
      visual: () => `
        <div class="demo-log-list" aria-label="Daftar feed log">
          <div class="demo-log-row"><span>06:30</span><span>Jadwal pagi</span><strong>Selesai</strong></div>
          <div class="demo-log-row"><span>12:00</span><span>Pakan manual</span><strong>Selesai</strong></div>
          <div class="demo-log-row demo-log-new"><span>16:30</span><span>Jadwal sore · 8 detik</span><strong>Baru</strong></div>
        </div>`,
      animate: 'animateLog'
    }
  ];

  function updateTubeLabels(values = {}) {
    const stage = $('#water-sample-stage');
    if (!stage) return;
    const ph = Number(values.ph ?? stage.dataset.ph ?? 7.1);
    const temperature = Number(values.temperature ?? values.temp ?? stage.dataset.temperature ?? 28.4);
    const turbidity = Number(values.turbidity ?? stage.dataset.turbidity ?? 42);
    stage.dataset.ph = String(ph);
    stage.dataset.temperature = String(temperature);
    stage.dataset.turbidity = String(turbidity);
    const phNode = $('[data-tube-value="ph"]', stage);
    const tempNode = $('[data-tube-value="temperature"]', stage);
    const ntuNode = $('[data-tube-value="turbidity"]', stage);
    if (phNode) phNode.textContent = `pH ${ph.toFixed(1)}`;
    if (tempNode) tempNode.textContent = `${temperature.toFixed(1)}°C`;
    if (ntuNode) ntuNode.textContent = `${Math.round(turbidity)} NTU`;
    const phLabel = $('.tube-label-ph', stage);
    const tempLabel = $('.tube-label-temp', stage);
    const ntuLabel = $('.tube-label-ntu', stage);
    if (phLabel) phLabel.style.top = `${clamp(43 - (ph - 6) * 4, 29, 43)}%`;
    if (tempLabel) tempLabel.style.top = `${clamp(59 - (temperature - 24) * 1.8, 44, 59)}%`;
    if (ntuLabel) ntuLabel.style.top = `${clamp(76 - turbidity * .18, 61, 75)}%`;
  }

  function initWaterSample() {
    const stage = $('#water-sample-stage');
    const canvas = $('#water-sample-canvas');
    if (!stage || !canvas || window.innerWidth < 760 || !window.THREE || reducedMotion.matches) {
      updateTubeLabels();
      return;
    }

    const THREE = window.THREE;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch (_) {
      canvas.hidden = true;
      stage.classList.remove('webgl-ready');
      updateTubeLabels();
      return;
    }
    canvas.hidden = false;
    stage.classList.add('webgl-ready');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
    camera.position.set(4.4, 3.2, 8.4);
    camera.lookAt(0, .15, 0);
    const group = new THREE.Group();
    group.rotation.x = -.06;
    scene.add(group);

    const tubeGeometry = new THREE.CylinderGeometry(1.42, 1.42, 5.8, 64, 1, true);
    const tubeMaterial = new THREE.MeshStandardMaterial({ color: 0x4c9a8e, transparent: true, opacity: .22, roughness: .86, metalness: .03, side: THREE.DoubleSide, depthWrite: false });
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    group.add(tube);

    const waterGeometry = new THREE.CylinderGeometry(1.25, 1.25, 4.55, 48, 1, false);
    const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x4c9a8e, transparent: true, opacity: .38, roughness: .9, metalness: 0, depthWrite: false });
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.position.y = -.55;
    group.add(water);

    const ringMaterial = new THREE.MeshStandardMaterial({ color: 0xd8e2de, roughness: .72, metalness: .05 });
    const topRing = new THREE.Mesh(new THREE.TorusGeometry(1.43, .035, 10, 64), ringMaterial);
    topRing.rotation.x = Math.PI / 2;
    topRing.position.y = 2.9;
    group.add(topRing);
    const bottomRing = topRing.clone();
    bottomRing.position.y = -2.9;
    group.add(bottomRing);

    const turbidityNTU = Number(stage.dataset.turbidity || 42);
    const particleCount = clamp(turbidityNTU * 6, 40, 500);
    const positions = new Float32Array(particleCount * 3);
    let seed = 1977;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let index = 0; index < particleCount; index += 1) {
      const radius = Math.sqrt(random()) * 1.12;
      const angle = random() * Math.PI * 2;
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = -2.62 + random() * 4.18;
      positions[index * 3 + 2] = Math.sin(angle) * radius;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({ color: 0xb9834f, size: clamp(.028 + turbidityNTU / 1500, .035, .085), transparent: true, opacity: .82, sizeAttenuation: true, depthWrite: false });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    group.add(particles);

    scene.add(new THREE.AmbientLight(0xf1f5f3, .34));
    const keyLight = new THREE.DirectionalLight(0xfff1d8, 2.15);
    keyLight.position.set(4.5, 7, 6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x4c9a8e, 2.8);
    rimLight.position.set(-4, 2, -5);
    scene.add(rimLight);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x0e2a30, 0);

    let raf = 0;
    let inViewport = true;
    let parallaxX = 0;
    let parallaxY = 0;
    const resize = () => {
      if (window.innerWidth < 760 && tubeRuntime) { tubeRuntime.destroy(); return; }
      const rect = stage.getBoundingClientRect();
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
      camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
    };
    const mousemove = (event) => {
      if (reducedMotion.matches) return;
      const rect = stage.getBoundingClientRect();
      parallaxX = clamp(((event.clientX - rect.left) / rect.width - .5) * 16, -8, 8);
      parallaxY = clamp(((event.clientY - rect.top) / rect.height - .5) * 16, -8, 8);
    };
    const mouseleave = () => { parallaxX = 0; parallaxY = 0; };
    stage.addEventListener('mousemove', mousemove, { passive: true });
    stage.addEventListener('mouseleave', mouseleave);
    window.addEventListener('resize', resize);
    resize();

    const animate = () => {
      if (document.hidden || !inViewport || reducedMotion.matches) { raf = 0; return; }
      if (!reducedMotion.matches) group.rotation.y += 0.0015;
      canvas.style.transform = reducedMotion.matches ? 'none' : `translate3d(${parallaxX}px, ${parallaxY}px, 0)`;
      particles.rotation.y += reducedMotion.matches ? 0 : .0007;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();
    const visibility = () => {
      if (document.hidden || !inViewport) { cancelAnimationFrame(raf); raf = 0; }
      else if (!raf && !reducedMotion.matches) animate();
    };
    const motionChanged = () => {
      if (reducedMotion.matches) tubeRuntime?.destroy();
    };
    document.addEventListener('visibilitychange', visibility);
    const observer = new IntersectionObserver(entries => {
      inViewport = entries[0].isIntersecting;
      visibility();
    });
    observer.observe(stage);
    reducedMotion.addEventListener('change', motionChanged);
    updateTubeLabels();

    tubeRuntime = {
      update(values) {
        updateTubeLabels(values);
      },
      destroy() {
        cancelAnimationFrame(raf);
        stage.classList.remove('webgl-ready');
        canvas.hidden = true;
        stage.removeEventListener('mousemove', mousemove);
        stage.removeEventListener('mouseleave', mouseleave);
        window.removeEventListener('resize', resize);
        document.removeEventListener('visibilitychange', visibility);
        observer.disconnect();
        reducedMotion.removeEventListener('change', motionChanged);
        [tubeGeometry, waterGeometry, topRing.geometry, bottomRing.geometry, particleGeometry].forEach((geometry) => geometry.dispose());
        [tubeMaterial, waterMaterial, ringMaterial, particleMaterial].forEach((material) => material.dispose());
        renderer.dispose();
        tubeRuntime = null;
      }
    };
  }

  function demoVisual(frame) {
    return frame.visual();
  }

  function renderDemoShell(root) {
    root.innerHTML = `
      <div class="modal-backdrop demo-backdrop" role="presentation" data-demo-backdrop>
        <section class="demo-dialog" role="dialog" aria-modal="true" aria-labelledby="demo-title" aria-describedby="demo-description">
          <header class="demo-header">
            <div class="demo-heading"><h2 id="demo-title">Lihat Demo Sistem</h2><strong>SIMULASI</strong><p id="demo-description">Simulasi alur target SKPL. Bukan bukti sensor, stok pakan, atau ACK hardware.</p></div>
            <button class="btn icon-btn demo-close" id="demo-close" type="button" aria-label="Tutup demo">×</button>
            <div class="demo-tabs" role="tablist" aria-label="Pilih alur demo">
              <button class="demo-tab" id="demo-tab-monitoring" type="button" role="tab" aria-controls="demo-panel" tabindex="0" aria-selected="true" data-demo-tab="monitoring">Kekeruhan Air</button>
              <button class="demo-tab" id="demo-tab-feeding" type="button" role="tab" aria-controls="demo-panel" tabindex="-1" aria-selected="false" data-demo-tab="feeding">Pakan Otomatis</button>
            </div>
          </header>
          <div class="demo-main">
            <article class="demo-frame" id="demo-panel" role="tabpanel" aria-labelledby="demo-tab-monitoring" aria-live="polite">
              <div class="demo-copy">
                <div class="frame-instrument">
                  <span class="frame-counter" id="frame-counter">FRAME 1 / 5</span>
                  <div class="frame-jumps" aria-label="Lompat ke frame">
                    ${[1,2,3,4,5].map((number) => `<button class="frame-jump ${number === 1 ? 'active' : ''}" type="button" data-frame-jump="${number - 1}" aria-label="Ke frame ${number}">${number}</button>`).join('')}
                  </div>
                  <button class="demo-pause" id="demo-pause" type="button" aria-label="Jeda demo">Ⅱ</button>
                </div>
                <div class="progress-track" aria-hidden="true"><div class="progress-bar" id="demo-progress"></div></div>
                <div id="demo-text"><h3 id="demo-frame-title"></h3><p class="demo-caption" id="demo-frame-caption"></p></div>
                <div id="demo-water-input"><label for="demo-ntu">Kekeruhan simulasi (0–150 NTU)</label><input class="form-control" id="demo-ntu" type="range" min="0" max="150" value="42"><output id="demo-ntu-value" for="demo-ntu">42 NTU</output></div>
                <div id="demo-feed-input" hidden><label for="demo-outcome">Respons simulator</label><select class="form-control" id="demo-outcome"><option value="succeeded">Sukses</option><option value="failed">Gagal</option><option value="timeout">Timeout tanpa ACK</option></select></div>
                <p id="demo-result" role="status"></p>
                <button class="btn btn-sm" id="demo-restart" type="button">Ulangi dari awal</button>
              </div>
              <div class="demo-visual" id="demo-visual"></div>
            </article>
            <nav class="demo-navigation" aria-label="Navigasi frame demo">
              <button class="demo-arrow" id="demo-prev" type="button" aria-label="Frame sebelumnya">‹</button>
              <button class="demo-arrow" id="demo-next" type="button" aria-label="Frame berikutnya">›</button>
            </nav>
          </div>
          <footer class="demo-videos">
            <div class="demo-videos-copy"><strong>Referensi video alur</strong><span>Referensi, bukan verifikasi hardware proyek ini.</span></div>
            <a class="video-proof" href="https://youtu.be/Hjc_IFDs9jk" target="_blank" rel="noopener noreferrer"><span><strong>Demo Kekeruhan Air</strong><span>Buka di YouTube ↗</span></span></a>
            <a class="video-proof" href="https://youtu.be/6g33__73NEc" target="_blank" rel="noopener noreferrer"><span><strong>Demo Pakan Otomatis</strong><span>Buka di YouTube ↗</span></span></a>
          </footer>
        </section>
      </div>`;
  }

  function animateSensorRead(root, gsap) {
    return gsap.fromTo($$('.sensor-node', root), { scale: .72, autoAlpha: .32 }, { scale: 1, autoAlpha: 1, duration: .42, stagger: .15, ease: 'power2.out' });
  }

  function animateValidation(root, gsap) {
    const timeline = gsap.timeline({ defaults: { duration: .65, ease: 'power2.out' } });
    timeline.to($('.validation-pass', root), { x: 270 }).to($('.validation-fail', root), { x: 145 }, '<.1').to($('.validation-fail', root), { x: 82, fill: '#B9834F', duration: .32, ease: 'power2.out' });
    return timeline;
  }

  function animateGauge(root, gsap) {
    return gsap.fromTo($('.gauge-needle', root), { rotation: -90, transformOrigin: '50% 100%' }, { rotation: 38, transformOrigin: '50% 100%', duration: 1.1, ease: 'power2.out' });
  }

  function animateNormalCard(root, gsap) {
    return gsap.fromTo($('.demo-normal-card', root), { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .48, ease: 'power2.out' });
  }

  function animateWarning(root, gsap) {
    const timeline = gsap.timeline();
    timeline.fromTo($('.demo-bell', root), { scale: .85 }, { scale: 1.08, duration: .28, repeat: 3, yoyo: true, ease: 'power2.out' })
      .fromTo($('.demo-toast-card', root), { x: 90, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: .42, ease: 'power2.out' }, .18);
    return timeline;
  }

  function animateClock(root, gsap) {
    const timeline = gsap.timeline({ defaults: { ease: 'power2.out' } });
    timeline.fromTo($('.clock-hour', root), { rotation: -110, transformOrigin: '50% 100%' }, { rotation: 0, duration: .85, transformOrigin: '50% 100%' })
      .fromTo($('.clock-minute', root), { rotation: -250, transformOrigin: '0% 50%' }, { rotation: 0, duration: 1.1, transformOrigin: '0% 50%' }, 0);
    return timeline;
  }

  function animateChecklist(root, gsap) {
    $$('.check-path', root).forEach((path) => {
      const length = path.getTotalLength();
      path.style.strokeDasharray = String(length);
      path.style.strokeDashoffset = String(length);
    });
    const timeline = gsap.timeline();
    timeline.fromTo($$('.check-item', root), { x: -14, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: .32, stagger: .15, ease: 'power2.out' })
      .to($$('.check-path', root), { strokeDashoffset: 0, duration: .28, stagger: .15, ease: 'power2.out' }, .1);
    return timeline;
  }

  function animatePacket(root, gsap) {
    return gsap.fromTo($('.packet', root), { x: 0 }, { x: 165, duration: 1.25, repeat: 1, ease: 'power2.inOut' });
  }

  function animateFeeder(root, gsap) {
    const timeline = gsap.timeline();
    timeline.to($('.feeder-motor', root), { rotation: 360, transformOrigin: '50% 50%', duration: .7, repeat: -1, ease: 'none' }, 0)
      .fromTo($$('.pellet', root), { y: -8, autoAlpha: .35 }, { y: 70, autoAlpha: 1, duration: .7, stagger: .09, repeat: 2, ease: 'power1.in' }, 0);
    return timeline;
  }

  function animateLog(root, gsap) {
    return gsap.fromTo($('.demo-log-new', root), { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .48, ease: 'power2.out' });
  }

  const frameAnimations = {
    animateSensorRead,
    animateValidation,
    animateGauge,
    animateNormalCard,
    animateWarning,
    animateClock,
    animateChecklist,
    animatePacket,
    animateFeeder,
    animateLog
  };

  function openDemo(trigger) {
    if (!reducedMotion.matches) loadLibrary('gsap');
    const root = $('#modal-root');
    if (!root) return;
    if (demoRuntime) demoRuntime.close();
    renderDemoShell(root);
    document.body.classList.add('demo-open');
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.setAttribute('aria-hidden', 'true');
      appEl.setAttribute('inert', '');
    }

    let activeTab = 'monitoring';
    let activeFrame = 0;
    let paused = reducedMotion.matches;
    let progressTween = null;
    let frameTween = null;
    let timer = null;
    const dialog = $('.demo-dialog', root);
    const closeButton = $('#demo-close', root);

    function frames() {
      return activeTab === 'monitoring' ? monitoringFrames : feedingFrames;
    }

    function stopProgress() {
      progressTween?.kill?.();
      progressTween = null;
      if (timer) window.clearTimeout(timer);
      timer = null;
      const progress = $('#demo-progress', root);
      if (progress) progress.style.transform = 'scaleX(0)';
    }

    function startProgress() {
      stopProgress();
      if (paused || reducedMotion.matches || document.hidden) return;
      const progress = $('#demo-progress', root);
      if (window.gsap && progress) {
        window.gsap.set(progress, { scaleX: 0, transformOrigin: 'left center' });
        progressTween = window.gsap.to(progress, { scaleX: 1, duration: 4.5, ease: 'none', onComplete: () => changeFrame(activeFrame + 1) });
      } else {
        timer = window.setTimeout(() => changeFrame(activeFrame + 1), FRAME_DURATION_MS);
      }
    }

    function animateFrame(frame) {
      frameTween?.kill?.();
      frameTween = null;
      if (!window.gsap || reducedMotion.matches || paused) return;
      const text = $('#demo-text', root);
      window.gsap.fromTo(text, { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .4, ease: 'power2.out' });
      const animation = activeTab === 'monitoring' && activeFrame >= 3 ? animateNormalCard : frameAnimations[frame.animate];
      if (animation) frameTween = animation($('#demo-visual', root), window.gsap);
    }

    function renderFrame() {
      const frame = frames()[activeFrame];
      $('#frame-counter', root).textContent = `FRAME ${activeFrame + 1} / 5`;
      $('#demo-frame-title', root).textContent = frame.title;
      $('#demo-frame-caption', root).textContent = frame.caption;
      $('#demo-visual', root).innerHTML = demoVisual(frame);
      const ntu = Number($('#demo-ntu', root).value);
      const outcome = $('#demo-outcome', root).value;
      $('#demo-water-input', root).hidden = activeTab !== 'monitoring';
      $('#demo-feed-input', root).hidden = activeTab !== 'feeding';
      $('#demo-ntu-value', root).textContent = `${ntu} NTU`;
      const breach = ntu > 50;
      $('#demo-result', root).textContent = activeTab === 'monitoring'
        ? `${ntu} NTU · data valid · ambang 50 NTU · ${breach ? 'Breach: periksa filter dan sisa pakan.' : 'Normal: tidak ada alert kekeruhan.'}`
        : `SIMULASI · ${activeFrame < 2 ? 'Memeriksa jadwal aktif' : activeFrame === 2 ? 'Command pending' : activeFrame === 3 ? 'Command delivered' : 'Log eksekusi: ' + outcome}`;
      if (activeTab === 'monitoring') {
        const sensorValue = $('.sensor-node:last-of-type text:last-of-type', root);
        if (sensorValue) sensorValue.textContent = String(ntu);
        const validationValue = $('.validation-fail text', root);
        if (validationValue) validationValue.textContent = `${ntu} NTU valid`;
        const gauge = $('.demo-gauge-value', root);
        if (gauge) gauge.textContent = `${ntu} NTU`;
        if (activeFrame >= 3) {
          $('#demo-frame-title', root).textContent = breach ? 'Peringatan Kekeruhan' : 'Status Normal';
          $('#demo-frame-caption', root).textContent = breach ? 'Kekeruhan melampaui 50 NTU. Periksa filter dan sisa pakan.' : 'Kekeruhan dalam ambang. Dashboard normal tanpa alert kekeruhan.';
          $('#demo-visual', root).innerHTML = `<div class="demo-normal-card"><span>Kekeruhan simulasi</span><strong>${ntu} NTU</strong><span>${breach ? 'Di luar ambang' : 'Normal'}</span></div>`;
        }
      } else if (activeFrame === 4) {
        $('#demo-visual', root).innerHTML = `<div class="demo-log-list"><div class="demo-log-row demo-log-new"><span>SIMULASI</span><span>Feeder · 8 detik</span><strong>${outcome}</strong></div></div>`;
      }
      if (reducedMotion.matches || paused) {
        const svg = $('svg', root);
        if (svg && typeof svg.pauseAnimations === 'function') {
          svg.pauseAnimations();
        }
        $$('animate, animateTransform', root).forEach(smil => smil.remove());
      }
      $$('.frame-jump', root).forEach((button, index) => {
        button.classList.toggle('active', index === activeFrame);
        button.setAttribute('aria-current', index === activeFrame ? 'step' : 'false');
      });
      animateFrame(frame);
      startProgress();
      $('#demo-panel', root).scrollTop = 0;
    }

    function changeFrame(index) {
      activeFrame = (index + frames().length) % frames().length;
      renderFrame();
    }

    function switchTab(tab) {
      if (!['monitoring', 'feeding'].includes(tab)) return;
      activeTab = tab;
      activeFrame = 0;
      $$('[data-demo-tab]', root).forEach((button) => {
        button.setAttribute('aria-selected', String(button.dataset.demoTab === tab));
        button.tabIndex = button.dataset.demoTab === tab ? 0 : -1;
      });
      $('#demo-panel', root).setAttribute('aria-labelledby', `demo-tab-${tab}`);
      renderFrame();
    }

    function togglePause() {
      paused = !paused;
      const button = $('#demo-pause', root);
      button.textContent = paused ? '▶' : 'Ⅱ';
      button.setAttribute('aria-label', paused ? 'Putar demo' : 'Jeda demo');
      $$('svg', root).forEach(svg => { if (paused) svg.pauseAnimations?.(); else if (!reducedMotion.matches) svg.unpauseAnimations?.(); });
      if (paused) {
        frameTween?.pause?.();
        progressTween?.pause?.();
        if (timer) window.clearTimeout(timer);
      } else if (progressTween && !reducedMotion.matches) {
        frameTween?.resume?.();
        progressTween.resume();
      } else {
        startProgress();
      }
    }

    function close() {
      stopProgress();
      frameTween?.kill?.();
      root.innerHTML = '';
      document.body.classList.remove('demo-open');
      const appEl = document.getElementById('app');
      if (appEl) {
        appEl.removeAttribute('aria-hidden');
        appEl.removeAttribute('inert');
      }
      document.removeEventListener('keydown', onKeydown);
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener('change', onMotionChange);
      trigger?.focus?.();
      demoRuntime = null;
    }

    function onKeydown(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.target.matches('[data-demo-tab]') && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
        event.preventDefault();
        const tab = event.key === 'Home' ? 'monitoring' : event.key === 'End' ? 'feeding' : activeTab === 'monitoring' ? 'feeding' : 'monitoring';
        switchTab(tab); $(`#demo-tab-${tab}`, root).focus(); return;
      }
      if (!event.target.matches('input,select')) {
        if (event.key === 'ArrowLeft') { event.preventDefault(); changeFrame(activeFrame - 1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); changeFrame(activeFrame + 1); }
      }
      if (event.key === 'Tab') {
        const focusable = $$('button, a[href], input, select', dialog).filter((node) => !node.disabled && node.getClientRects().length);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }

    closeButton.addEventListener('click', close);
    $('[data-demo-backdrop]', root).addEventListener('click', (event) => { if (event.target.matches('[data-demo-backdrop]')) close(); });
    $('#demo-prev', root).addEventListener('click', () => changeFrame(activeFrame - 1));
    $('#demo-next', root).addEventListener('click', () => changeFrame(activeFrame + 1));
    $('#demo-pause', root).addEventListener('click', togglePause);
    $('#demo-restart', root).addEventListener('click', () => changeFrame(0));
    $('#demo-ntu', root).addEventListener('input', renderFrame);
    $('#demo-outcome', root).addEventListener('change', renderFrame);
    $$('[data-demo-tab]', root).forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.demoTab)));
    $$('[data-frame-jump]', root).forEach((button) => button.addEventListener('click', () => changeFrame(Number(button.dataset.frameJump))));
    document.addEventListener('keydown', onKeydown);
    function onVisibility() {
      if (document.hidden) {
        paused = true;
        stopProgress();
        frameTween?.kill?.();
        renderFrame();
        $('#demo-pause', root).textContent = '▶';
        $('#demo-pause', root).setAttribute('aria-label', 'Putar demo');
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    function onMotionChange() {
      if (reducedMotion.matches) { paused = true; stopProgress(); frameTween?.kill?.(); renderFrame(); }
      $('#demo-pause', root).textContent = paused ? '▶' : 'Ⅱ';
      $('#demo-pause', root).setAttribute('aria-label', paused ? 'Putar demo' : 'Jeda demo');
    }
    reducedMotion.addEventListener('change', onMotionChange);
    demoRuntime = { close };
    renderFrame();
    onMotionChange();
    closeButton.focus();
  }

  function initLanding() {
    teardownLanding();
    initWaterSample();
    const stage = $('#water-sample-stage');
    if (stage && window.innerWidth >= 760 && !reducedMotion.matches) {
      loadLibrary('three').then(loaded => {
        if (loaded && stage.isConnected && !tubeRuntime) initWaterSample();
      });
    }
    const demoSelectors = ['#open-demo', '#open-demo-footer', '#open-demo-features'];
    demoSelectors.forEach((selector) => {
      const button = $(selector);
      if (!button) return;
      const handler = () => openDemo(button);
      button.addEventListener('click', handler);
      cleanupTasks.push(() => button.removeEventListener('click', handler));
    });
  }

  function teardownLanding() {
    cleanupTasks.forEach((cleanup) => cleanup());
    cleanupTasks = [];
    tubeRuntime?.destroy?.();
    demoRuntime?.close?.();
  }

  window.AquaSmartExperience = {
    initLanding,
    teardown: teardownLanding,
    openDemo,
    updateWaterSample(values) {
      if (tubeRuntime) tubeRuntime.update(values);
      else updateTubeLabels(values);
    }
  };
})();
