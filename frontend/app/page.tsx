import {
  Bell,
  CalendarClock,
  ChartNoAxesCombined,
  Droplets,
  Thermometer,
  Waves,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { Brand } from "@/components/studio/brand"
import { WaterChart } from "@/components/studio/water-chart"
import { getSession } from "@/lib/api/server"

// Every number on this page is an illustration and says so on screen; real readings
// only exist behind login. The status section states what is still simulated.
const PREVIEW_METRICS = [
  { label: "pH air", value: "7,2", unit: "pH", icon: Droplets, note: "Keasaman air" },
  { label: "Suhu air", value: "28,4", unit: "°C", icon: Thermometer, note: "Temperatur kolam" },
  { label: "Kekeruhan", value: "12", unit: "NTU", icon: Waves, note: "Kejernihan air" },
]

const PREVIEW_PH = [7, 7.1, 7.05, 7.3, 7.2, 7.15, 7.25, 7.1, 7.15, 7.2, 7.18, 7.2]

// Capabilities, not steps: they are listed without numbers because nothing forces an order.
const CAPABILITIES = [
  {
    icon: Bell,
    title: "Tangkap perubahan lebih awal",
    body: "Peringatan membantu Anda menemukan pembacaan di luar ambang yang dikonfigurasi.",
  },
  {
    icon: CalendarClock,
    title: "Susun jadwal pakan",
    body: "Atur hari dan durasi pemberian pakan per perangkat. Kontrol aktuator masih berupa simulasi.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Baca kembali perjalanan kolam",
    body: "Lihat riwayat dan unduh laporan CSV atau JSON untuk analisis Anda sendiri.",
  },
]

export default async function Home() {
  const session = await getSession()
  return (
    <div className="studio-home">
      <a href="#konten" className="skip-link">
        Lewati ke konten
      </a>
      <header className="landing-nav">
        <Brand />
        <nav aria-label="Navigasi beranda">
          <a href="#pemantauan">Pemantauan</a>
          <Link href="/jelajah">Jelajah 3D</Link>
          <Link href={session ? "/dashboard" : "/login"} className="studio-button">
            {session ? "Buka dashboard" : "Masuk dashboard"}
          </Link>
        </nav>
      </header>
      <main id="konten" tabIndex={-1}>
        <section className="landing-hero">
          <div className="hero-copy">
            <span className="eyebrow">Pemantauan air untuk budidaya</span>
            <h1>
              Kenali airnya.
              <br />
              <em>
                Rawat kehidupan
                <br />
                di dalamnya.
              </em>
            </h1>
            <p>
              pH, suhu, dan kekeruhan. Semua pembacaan kolam Anda, tersusun menjadi informasi yang
              bisa ditindaklanjuti.
            </p>
            <div className="hero-actions">
              <Link href={session ? "/dashboard" : "/register"} className="studio-button">
                {session ? "Lihat kolam saya" : "Buat ruang budidaya"}
              </Link>
              <Link href="/jelajah" className="text-action">
                Jelajah model 3D
              </Link>
            </div>
            <div className="hero-note">
              <Waves size={18} aria-hidden="true" />
              <span>Dirancang untuk pembudidaya. Bisa dijalankan secara lokal.</span>
            </div>
          </div>
          <div className="hero-scene">
            <div className="scene-label">
              <span>Ekosistem yang terhubung</span>
              <span>01 / AquaSmart</span>
            </div>
            <div className="farm-art">
              <Image
                src="/pond-studio.png"
                alt="Ilustrasi konsep kolam budidaya"
                fill
                sizes="(max-width: 700px) 100vw, 600px"
                className="object-cover"
              />
            </div>
            <div className="scene-reading">
              <div>
                <strong>Kolam contoh</strong>
                <small>Ilustrasi data, bukan sensor langsung</small>
              </div>
              <div className="scene-value">
                7,2 <span>pH</span>
              </div>
            </div>
            <span className="art-caption">Ilustrasi konsep · bukan foto fasilitas nyata</span>
          </div>
        </section>
        <section id="pemantauan" className="monitor-section">
          <div className="section-intro">
            <div>
              <span className="eyebrow">Dari angka menjadi pemahaman</span>
              <h2>
                Satu pandangan.
                <br />
                Lebih paham kondisi kolam.
              </h2>
            </div>
            <p>
              Periksa pembacaan, telusuri perubahan, dan temukan parameter yang perlu diperhatikan.
            </p>
          </div>
          <div className="preview-board">
            <div className="preview-header">
              <div>
                <span className="eyebrow">Contoh tampilan</span>
                <h3>Ringkasan kualitas air</h3>
              </div>
              <span className="demo-label">Data ilustrasi</span>
            </div>
            <div className="preview-metrics">
              {PREVIEW_METRICS.map(({ label, value, unit, icon: Icon, note }) => (
                <div key={label}>
                  <div className="metric-label">
                    <Icon size={19} aria-hidden="true" />
                    {label}
                  </div>
                  <p>
                    {value}
                    <span>{unit}</span>
                  </p>
                  <small>{note}</small>
                </div>
              ))}
            </div>
            <div className="preview-chart">
              <div>
                <strong>Perubahan pH</strong>
                <span>Urutan pembacaan contoh</span>
              </div>
              <WaterChart values={PREVIEW_PH} label="Grafik ilustrasi pH" />
            </div>
          </div>
        </section>
        <section className="workflow-section">
          <div className="workflow-heading">
            <span className="eyebrow">Rutinitas yang lebih tertata</span>
            <h2>
              Dari kolam,
              <br />
              ke keputusan.
            </h2>
            <p>Catat perubahan hari ini. Siapkan langkah berikutnya dengan riwayat yang jelas.</p>
          </div>
          <div className="workflow-list">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <article key={title}>
                <Icon size={22} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="development-note">
          <span className="eyebrow">Status pengembangan</span>
          <h2>Terbuka tentang apa yang sudah berjalan.</h2>
          <p>
            Pemantauan dan pencatatan tersedia. Kontrol aerator dan feeder masih{" "}
            <strong>SIMULASI</strong>: firmware ESP32 belum diuji di perangkat fisik, jadi
            aktuasinya belum terverifikasi. Sensor belum terkalibrasi, dan data contoh selalu diberi
            penanda.
          </p>
          <Link href={session ? "/dashboard" : "/login"} className="text-action">
            Masuk ke ruang budidaya
          </Link>
        </section>
      </main>
      <footer className="landing-footer">
        <Brand />
        <span>Pemantauan kualitas air akuakultur.</span>
      </footer>
    </div>
  )
}
