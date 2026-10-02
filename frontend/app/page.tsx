import { Bell, CalendarClock, FileBarChart, Gauge } from "lucide-react"
import Link from "next/link"
import { button, heading, inlineLink, panel } from "@/components/ui/styles"
import { getOptionalSession } from "@/lib/api/server"

// The public page a farmer or a reviewer lands on. It explains what the system
// records and, just as plainly, what is still simulated: the honesty section is
// part of the product, not a disclaimer bolted to the bottom.
const PARAMETERS = [
  {
    label: "pH air",
    body: "Keasaman air menentukan kenyamanan ikan dan kerja bakteri pengurai. Perubahan mendadak lebih berbahaya daripada angka yang stabil di tepi batas.",
  },
  {
    label: "Suhu air",
    body: "Suhu mengatur nafsu makan dan kelarutan oksigen. Pembacaan tercatat berkala sehingga pola hariannya terlihat.",
  },
  {
    label: "Kekeruhan",
    body: "Kekeruhan naik saat sisa pakan dan kotoran menumpuk. Angkanya dipakai untuk memutuskan penggantian air atau penyedotan dasar kolam.",
  },
]

const FEATURES = [
  {
    icon: Gauge,
    title: "Pembacaan tercatat",
    body: "pH, suhu, dan kekeruhan disimpan lengkap dengan waktu dan label sumber datanya.",
  },
  {
    icon: Bell,
    title: "Peringatan berbasis ambang",
    body: "Ambang aman diatur per ruang budidaya. Peringatan muncul saat pembacaan keluar dari batas itu.",
  },
  {
    icon: CalendarClock,
    title: "Jadwal pakan",
    body: "Jadwal pemberian pakan tersimpan per perangkat, lengkap dengan hari dan durasinya.",
  },
  {
    icon: FileBarChart,
    title: "Laporan dan ekspor",
    body: "Rekap harian, mingguan, atau bulanan, dan unduhan CSV atau JSON untuk diolah sendiri.",
  },
]

export default async function Home() {
  const session = await getOptionalSession()

  return (
    <div className="min-h-screen">
      <a href="#konten" className="skip-link">
        Lewati ke konten
      </a>

      <header className="border-b border-foam-line bg-surface-white">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <span className={heading({ level: "sub" })}>AquaSmart AIoT</span>
          <nav aria-label="Masuk akun" className="flex flex-wrap items-center gap-2">
            {session ? (
              <Link href="/dashboard" className={button()}>
                Buka dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className={button({ tone: "secondary" })}>
                  Masuk
                </Link>
                <Link href="/register" className={button()}>
                  Daftar akun
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main id="konten" tabIndex={-1} className="mx-auto max-w-content px-4 py-10 sm:px-6 sm:py-14">
        <section className="max-w-2xl">
          <h1 className={heading()}>Pantau kualitas air kolam dari satu halaman</h1>
          <p className="mt-4 text-lg text-ink">
            AquaSmart mencatat pH, suhu, dan kekeruhan air budidaya, menyimpan riwayatnya, dan
            memberi peringatan saat pembacaan keluar dari batas yang Anda tetapkan.
          </p>
          <p className="mt-3 text-sm text-muted">
            Dibuat untuk dijalankan di komputer pembudidaya sendiri, tanpa langganan pihak ketiga.
          </p>
          {session ? null : (
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/register" className={button()}>
                Buat akun
              </Link>
              <Link href="/login" className={button({ tone: "secondary" })}>
                Sudah punya akun
              </Link>
            </div>
          )}
        </section>

        <section aria-labelledby="parameter" className="mt-14">
          <h2 id="parameter" className={heading({ level: "section" })}>
            Tiga parameter yang dicatat
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {PARAMETERS.map((parameter) => (
              <article key={parameter.label} className={panel()}>
                <h3 className={heading({ level: "sub", tone: "ink" })}>{parameter.label}</h3>
                <p className="mt-2 text-sm text-ink">{parameter.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="fitur" className="mt-14">
          <h2 id="fitur" className={heading({ level: "section" })}>
            Yang bisa dikerjakan di dashboard
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className={`${panel()} flex gap-4`}>
                <Icon aria-hidden="true" className="size-6 shrink-0 text-clear-water-text" />
                <div>
                  <h3 className={heading({ level: "sub", tone: "ink" })}>{title}</h3>
                  <p className="mt-1 text-sm text-ink">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="status" className={panel({ tone: "notice", className: "mt-14" })}>
          <h2 id="status" className={heading({ level: "section", tone: "warning" })}>
            Status pengembangan
          </h2>
          <p className="mt-3 max-w-prose text-ink">
            Bagian ini ditulis apa adanya supaya tidak ada yang salah paham soal kemampuan sistem
            saat ini.
          </p>
          <ul className="mt-4 space-y-3 text-sm text-ink">
            <li>
              <span className="font-semibold">Kontrol aktuator berstatus SIMULASI.</span> Perintah
              aerator dan feeder dicatat server dan dijawab simulator. Tidak ada relay atau motor
              yang digerakkan dari halaman ini.
            </li>
            <li>
              <span className="font-semibold">Pembacaan sensor belum terkalibrasi.</span> Label
              DEVICE pada data berarti pengirimnya mengaku perangkat, bukan bukti kalibrasi. Data
              contoh diberi label SEED.
            </li>
            <li>
              <span className="font-semibold">Firmware ESP32 belum diuji di perangkat fisik.</span>{" "}
              Jalur perintah perangkat diuji memakai fixture HTTP, bukan alat sungguhan.
            </li>
          </ul>
        </section>
      </main>

      <footer className="border-t border-foam-line bg-surface-white">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-6">
          <p>AquaSmart AIoT. Pemantauan kualitas air akuakultur.</p>
          <Link href="/login" className={inlineLink}>
            Masuk ke dashboard
          </Link>
        </div>
      </footer>
    </div>
  )
}
