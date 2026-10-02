"use client"

import Link from "next/link"
import { type ErrorBoundaryProps, ErrorState } from "@/components/error-state"
import { inlineLink } from "@/components/ui/styles"

// Menangkap error dari halaman publik dan dari app/dashboard/layout.tsx, yang tidak
// terjangkau app/dashboard/error.tsx. Tanpa berkas ini, backend yang mati menampilkan
// halaman bawaan Next.js berbahasa Inggris.
export default function RootError({ error, retry }: ErrorBoundaryProps) {
  return (
    <main
      id="konten"
      className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-4 py-10"
    >
      <ErrorState error={error} retry={retry} title="Halaman belum bisa ditampilkan" />
      <Link href="/" className={inlineLink}>
        Kembali ke beranda
      </Link>
    </main>
  )
}
