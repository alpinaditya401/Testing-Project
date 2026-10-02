"use client"

import { useEffect } from "react"
import { button, heading } from "@/components/ui/styles"

// Props yang diberikan Next.js 16 ke error.tsx dan global-error.tsx.
export type ErrorBoundaryProps = {
  error: Error & { digest?: string }
  retry: () => void
}

// error.message tidak ditampilkan. Di produksi, Next.js menyamarkan pesan dari Server
// Component (yang muncul hanya "Minified React error #441"), dan saat backend mati
// pesannya "fetch failed" berbahasa Inggris. Pengguna mendapat kalimat tetap dalam
// bahasa Indonesia, sedangkan digest dipakai untuk mencocokkan log server.
//
// retry(), bukan reset(): reset() hanya membersihkan state boundary dan merender ulang
// payload RSC yang sama, sehingga error dari server langsung muncul lagi. retry()
// mengambil ulang data dari server sebelum merender.
export function ErrorState({
  error,
  retry,
  title = "Data belum bisa dimuat",
}: ErrorBoundaryProps & { title?: string }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div role="alert" className="rounded-panel border border-alarm-coral-text bg-surface-white p-6">
      <h1 className={heading({ level: "panel", tone: "danger" })}>{title}</h1>
      <p className="mt-2 text-sm text-ink">
        Server AquaSmart belum bisa dihubungi atau sedang mengalami gangguan. Periksa koneksi ke
        server, lalu coba lagi.
      </p>
      {error.digest ? (
        <p className="mt-1 text-sm text-muted">
          Kalau masalah berlanjut, sampaikan kode referensi{" "}
          <span className="font-data text-ink">{error.digest}</span> kepada pengelola server.
        </p>
      ) : null}
      <button type="button" className={button({ className: "mt-4" })} onClick={() => retry()}>
        Coba lagi
      </button>
    </div>
  )
}
