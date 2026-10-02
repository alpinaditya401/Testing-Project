// Dipakai bersama oleh proxy.ts dan lib/api/server.ts. Berkas ini sengaja tanpa
// impor: proxy dibundel terpisah dan tidak boleh ikut menarik modul server.

// Nama cookie ditetapkan Auth::startSession() di server PHP.
export const SESSION_COOKIE = "aquasmart_session"

// proxy.ts menulis path+query halaman yang diminta ke header request ini, supaya
// requireSession() di layout maupun page bisa mengembalikan pengguna ke halaman yang
// sama setelah login. Layout tidak menerima pathname dari Next.js.
export const RETURN_TO_HEADER = "x-aquasmart-return-to"

export function isProtectedPath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/")
}
