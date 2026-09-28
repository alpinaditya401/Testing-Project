import { ArrowLeft, Waves } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import { Brand } from "./brand"
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main id="konten" className="auth-page">
      <section className="auth-story" aria-label="Tentang AquaSmart">
        <Brand />
        <div className="auth-story-copy">
          <span className="eyebrow">Ruang kendali budidaya Anda</span>
          <h2>
            Air yang terpantau.
            <br />
            <em>Budidaya yang terarah.</em>
          </h2>
          <p>
            Kenali perubahan kecil di kolam Anda, dari pembacaan pertama hingga keputusan
            berikutnya.
          </p>
        </div>
        <div className="auth-art">
          <Image
            src="/pond-studio.png"
            alt="Ilustrasi kawasan kolam budidaya"
            fill
            sizes="(max-width: 700px) 1px, 50vw"
            className="object-contain"
          />
          <span>Ilustrasi konsep budidaya</span>
        </div>
        <div className="auth-story-foot">
          <Waves size={20} aria-hidden="true" />
          <span>pH, suhu, dan kekeruhan dalam satu ruang.</span>
        </div>
      </section>
      <section className="auth-form-side">
        <Link href="/" className="back-link">
          <ArrowLeft size={16} aria-hidden="true" /> Kembali ke beranda
        </Link>
        <div className="auth-form-content">{children}</div>
        <p className="auth-foot">AquaSmart · Pemantauan kualitas air akuakultur</p>
      </section>
    </main>
  )
}
