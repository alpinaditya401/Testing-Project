import type { z } from "zod"

// First message per top-level field, for rendering next to the input it belongs to.
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form")
    errors[key] ??= issue.message
  }
  return errors
}

// Origin palsu untuk menormalkan target. Domain .invalid tidak pernah bisa dimiliki
// siapa pun, jadi hasil resolve yang keluar dari origin ini pasti menunjuk host lain.
const SAME_ORIGIN = "http://aquasmart.invalid"

// Parser URL di browser membuang tab, CR dan LF, lalu membaca backslash sebagai
// slash. Karena itu "/\t/evil" atau "/\evil" berubah menjadi "//evil" saat browser
// mengikuti Location atau router.replace. Target yang memuat karakter itu ditolak.
function hasUnsafeCharacter(target: string): boolean {
  for (const char of target) {
    const code = char.charCodeAt(0)
    if (code < 0x20 || code === 0x7f || char === "\\") return true
  }
  return false
}

// Hanya path di situs yang sama yang boleh jadi tujuan sesudah login; selain itu
// halaman login berubah menjadi open redirect. Target di-resolve seperti browser
// melakukannya, lalu yang dikembalikan adalah bentuk ternormalisasinya, bukan string
// mentah dari query.
export function safeRedirect(target: string | undefined, fallback = "/dashboard"): string {
  if (!target?.startsWith("/") || hasUnsafeCharacter(target)) return fallback

  let url: URL
  try {
    url = new URL(target, SAME_ORIGIN)
  } catch {
    return fallback
  }
  // "/..//evil" lolos pemeriksaan awalan, tetapi pathname hasil normalisasinya
  // "//evil" adalah URL protocol-relative.
  if (url.origin !== SAME_ORIGIN || url.pathname.startsWith("//")) return fallback
  return `${url.pathname}${url.search}${url.hash}`
}

// Angka desimal dari input teks. Pengguna Indonesia menulis koma sebagai pemisah
// desimal; input type=number di Chromium membuang koma itu diam-diam ("12,5" jadi
// 125) dan membaca isian yang tidak valid sebagai kosong. Karena itu input angka
// pecahan memakai type=text dan diurai di sini.
//
// Kosong menjadi null. Isian yang bukan angka menjadi NaN supaya skema menolaknya
// dengan pesan, bukan dianggap tidak diisi.
export function parseDecimal(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null
  const normalized = value.trim().replace(",", ".")
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN
}
