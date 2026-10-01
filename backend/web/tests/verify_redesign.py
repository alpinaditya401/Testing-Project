from pathlib import Path
import sys
from app_sources import app_js_text

ROOT = Path(__file__).resolve().parents[1]
CSS = (ROOT / "assets/css/app.css").read_text(encoding="utf-8")
APP = app_js_text(ROOT / "assets/js")
EXPERIENCE_PATH = ROOT / "assets/js/experience.js"
EXPERIENCE = EXPERIENCE_PATH.read_text(encoding="utf-8") if EXPERIENCE_PATH.exists() else ""
HTML = (ROOT / "index.html").read_text(encoding="utf-8")
MANIFEST = (ROOT / "manifest.webmanifest").read_text(encoding="utf-8")
LOGO = (ROOT / "assets/images/logo.svg").read_text(encoding="utf-8")

errors: list[str] = []

def check(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)

# 1. Exact visual system contract.
tokens = {
    "--ink": "#10262A",
    "--deep-current": "#0E2A30",
    "--clear-water": "#4C9A8E",
    "--sediment": "#B9834F",
    "--alarm-coral": "#D2601F",
    "--foam": "#F1F5F3",
    "--foam-line": "#D8E2DE",
    "--radius-crisp": "4px",
    "--radius-panel": "10px",
    "--radius-media": "20px",
    "--shadow-none": "none",
    "--shadow-elevated": "0 8px 24px -6px rgba(14,42,48,.18)",
}
for name, value in tokens.items():
    check(f"{name}:" in CSS and value in CSS, f"Missing exact token {name}: {value}")
for index, value in enumerate(("4px", "8px", "12px", "16px", "24px", "32px", "48px", "64px", "96px"), 1):
    check(f"--space-{index}: {value}" in CSS, f"Missing spacing token --space-{index}: {value}")
check("Space+Grotesk:wght@500;700" in CSS, "Space Grotesk import/weights are wrong")
check("IBM+Plex+Sans:wght@400;500;600" in CSS, "IBM Plex Sans import/weights are wrong")
check("IBM+Plex+Mono:wght@400;600" in CSS, "IBM Plex Mono import/weights are wrong")
check('--font-data: "IBM Plex Mono"' in CSS, "Sensor data font token is missing")
check(".sensor-value" in CSS and "font-family: var(--font-data)" in CSS, "Sensor values are not bound to the mono data font")
check(".neu-card" in CSS and "box-shadow: none" in CSS, "Cards are not flat instrument panels")

# 2. CDN/runtime and hero sample tube.
for needle in (
    "three@0.160.1/build/three.min.js",
    "gsap@3.12.5/dist/gsap.min.js",
    "gsap@3.12.5/dist/ScrollTrigger.min.js",
    "assets/js/experience.js",
):
    check(needle in HTML, f"Missing required runtime asset: {needle}")
for needle in (
    'id="water-sample-canvas"',
    'id="water-sample-stage"',
    "CylinderGeometry",
    "THREE.Points",
    "turbidityNTU * 6",
    "rotation.y += 0.0015",
    "Math.min(window.devicePixelRatio || 1, 2)",
):
    check(needle in APP + EXPERIENCE, f"Water sample tube contract missing: {needle}")
check("max-width: 479px" in CSS and "water-sample-canvas" in CSS, "<480px static tube fallback is missing")
check("webgl-ready" in CSS and "webgl-ready" in EXPERIENCE, "Static tube fallback is not hidden only after WebGL mounts")

# 3. Exact landing copy and integrated readout/pipeline.
copy = (
    "AKUAKULTUR CERDAS, KEPUTUSAN LEBIH CEPAT",
    "Kualitas air terjaga. Budidaya lebih tenang.",
    "AquaSmart AIoT memantau pH, suhu, dan kekeruhan air secara real-time — serta membantu mengatur aerator dan pemberian pakan dari satu dashboard.",
    "Buka Dashboard",
    "Lihat Demo Sistem",
    "Prototype mode aktif — data simulasi aman untuk demonstrasi",
    "Pembacaan Langsung",
    "PH AIR",
    "SUHU AIR",
    "KEKERUHAN",
    "Dalam batas aman",
    "Stabil",
    "Perlu dipantau",
    "JARINGAN SISTEM",
    "Dari kolam ke keputusan",
    "Perangkat Kolam",
    "ESP32, sensor pH, suhu, dan turbidity",
    "REST API",
    "Telemetri tervalidasi dan tersimpan aman",
    "Dashboard Anda",
    "Monitoring dan kontrol dari perangkat apa pun",
)
for needle in copy:
    check(needle in APP, f"Landing copy missing or paraphrased: {needle}")
for needle in ('class="live-readout-panel"', 'id="system-flow-path"', 'id="system-flow-dot"'):
    check(needle in APP, f"Readout/pipeline markup missing: {needle}")
for needle in ("strokeDashoffset", "getPointAtLength", "duration: 3.5", "repeat: -1"):
    check(needle in EXPERIENCE, f"Data-flow animation contract missing: {needle}")
check("ease: 'none'" in EXPERIENCE or 'ease: "none"' in EXPERIENCE, "Data-flow animation must use linear ease none")

# 4. Demo storyboard: two tabs, 10 distinct frames, exact copy, controls.
monitor_frames = (
    ("Baca Sensor", "Sensor membaca pH, suhu, dan kekeruhan air setiap siklus."),
    ("Validasi Data", "Data divalidasi — nilai di luar rentang wajar ditandai sebagai anomali."),
    ("Cek Ambang Aman", "Sistem membandingkan kekeruhan dengan ambang batas NTU yang ditetapkan admin."),
    ("Status Normal", "Jika dalam batas aman, dashboard diperbarui dengan status Normal."),
    ("Peringatan Terkirim", "Jika kondisi kritis, sistem mengirim notifikasi dan rekomendasi tindakan ke pembudidaya."),
)
feed_frames = (
    ("Cek Jadwal", "Sistem memuat jadwal pakan aktif dan memeriksa apakah waktunya tercapai."),
    # Contract correction: target simulation, not fabricated stock/gram/hardware proof.
    ("Periksa Kesiapan", "Simulasi alur target: periksa jadwal dan durasi. Sensor stok dan porsi gram belum tersedia."),
    ("Kirim Perintah", "Simulasi alur target pengiriman perintah berdurasi ke ESP32; delivery hardware belum diverifikasi."),
    ("Feeder Bekerja", "Simulasi alur target motor feeder selama 8 detik. Porsi gram belum dikalibrasi."),
    ("Tercatat", "Target log eksekusi: contoh tampilan, bukan bukti feeder fisik selesai."),
)
check('120 gram' not in EXPERIENCE and '120g' not in EXPERIENCE, 'Unverified calibrated portion claim in demo')
check('Simulasi alur target SKPL.' in EXPERIENCE, 'Visible simulation disclaimer missing')
for title, caption in monitor_frames + feed_frames:
    check(title in EXPERIENCE and caption in EXPERIENCE, f"Demo frame missing: {title}")
for needle in (
    "Kekeruhan Air",
    "Pakan Otomatis",
    "FRAME",
    "4500",
    "scaleX: 1",
    "ease: 'none'",
    'y: 12',
    "ease: 'power2.out'",
    'id="demo-prev"',
    'id="demo-next"',
    'id="demo-pause"',
    "data-frame-jump",
    "prefers-reduced-motion: reduce",
    "Hjc_IFDs9jk",
    "6g33__73NEc",
):
    check(needle in EXPERIENCE, f"Demo interaction contract missing: {needle}")
for animation_key in (
    "animateSensorRead",
    "animateValidation",
    "animateGauge",
    "animateNormalCard",
    "animateWarning",
    "animateClock",
    "animateChecklist",
    "animatePacket",
    "animateFeeder",
    "animateLog",
):
    check(animation_key in EXPERIENCE, f"Frame-specific animation missing: {animation_key}")

# 5. Registration route and exact form contract.
for needle in (
    "function registerPage",
    "#/register",
    'id="register-form"',
    "Nama Lengkap",
    "Nama sesuai identitas",
    "Email atau No. WhatsApp",
    "email@contoh.com atau 08xxxxxxxxxx",
    "Minimal 8 karakter",
    "Konfirmasi Password",
    "Ulangi password",
    "Serial Number Alat (opsional)",
    "Kosongkan jika belum punya perangkat",
    "Isi kalau kamu sudah punya perangkat AquaSmart terdaftar. Bisa ditambahkan nanti dari Pengaturan.",
    "Isi nama lengkap dulu.",
    "Format email atau nomor WA belum sesuai.",
    "Password minimal 8 karakter.",
    "Password dan konfirmasi belum sama.",
    "Buat Akun",
    "Sudah punya akun?",
    "Masuk di sini",
    "/api/auth/register",
    "device-empty-state",
):
    check(needle in APP, f"Register contract missing: {needle}")

# 6. Dashboard/status semantics/accessibility/reduced motion.
check(".metric-card" in CSS and "border: 1px solid var(--foam-line)" in CSS, "Metric cards do not use hairline instrument borders")
check(".switch input:checked + span" in CSS and "var(--clear-water)" in CSS, "Custom actuator toggle semantic state is missing")
check("getComputedStyle(document.documentElement)" in APP, "History chart does not resolve colors from design tokens")
check("--clear-water" in APP and "--sediment" in APP, "History chart is not mapped to semantic status tokens")
check('ctx.font = \'10px "IBM Plex Mono", monospace\'' in APP and "ctx.font = '10px Inter'" not in APP, "History chart labels do not use the data font")
check("#B9834F" not in LOGO and "#D2601F" not in LOGO, "Logo uses status colors as decoration")
check("focus-visible" in CSS and "2px solid var(--clear-water)" in CSS, "Required focus-visible ring is missing")
check("min-height: 44px" in CSS or "min-width: 44px" in CSS, "44px touch target contract is missing")
check("prefers-reduced-motion: reduce" in CSS and "prefers-reduced-motion: reduce" in EXPERIENCE, "Reduced-motion behavior is incomplete")
check('"theme_color": "#0E2A30"' in MANIFEST, "PWA theme color is not deep-current")

if errors:
    print("REDESIGN VERIFICATION FAILED")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("REDESIGN VERIFICATION PASSED")
