"use client"

import { type ErrorBoundaryProps, ErrorState } from "@/components/error-state"
import "./globals.css"

// Pengganti root layout bila root layout sendiri gagal. Berkas ini merender dokumennya
// sendiri, jadi html, body, gaya global, dan judul harus ditulis di sini.
export default function GlobalError({ error, retry }: ErrorBoundaryProps) {
  return (
    <html lang="id">
      <body className="font-body bg-foam text-ink antialiased">
        <title>Gangguan | AquaSmart</title>
        <main
          id="konten"
          className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10"
        >
          <ErrorState error={error} retry={retry} title="AquaSmart belum bisa ditampilkan" />
        </main>
      </body>
    </html>
  )
}
