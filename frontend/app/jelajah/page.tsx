import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Brand } from "@/components/studio/brand"
import { Walkthrough } from "@/components/walkthrough/walkthrough"
import "./walkthrough.css"
export const metadata = {
  title: "Jelajah 3D | AquaSmart",
  description:
    "Jelajahi model Blender AquaSmart: aquaponik lele dan selada, rangkaian, serta casing.",
}
export default function ExplorePage() {
  return (
    <div className="explore-page">
      <a className="skip-link" href="#konten">
        Lewati ke konten
      </a>
      <header className="explore-nav">
        <Brand />
        <Link href="/dashboard">
          <ArrowLeft size={16} aria-hidden="true" />
          Ke dashboard
        </Link>
      </header>
      <main id="konten" tabIndex={-1} className="explore-main">
        <div className="explore-heading">
          <div>
            <span className="eyebrow">Dari Blender ke ruang jelajah</span>
            <h1>
              Lihat lebih dekat.
              <br />
              <em>Pahami setiap bagian.</em>
            </h1>
          </div>
          <p>
            Berjalan di sekitar model aquaponik Anda. Kenali rangkaian, casing, dan hubungan
            antarbagian dari sudut yang Anda pilih.
          </p>
        </div>
        <Walkthrough />
      </main>
      <footer className="explore-footer">
        Model lele & selada dari berkas Blender proyek AquaSmart, 23 September 2026.
      </footer>
    </div>
  )
}
