import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { isProtectedPath, RETURN_TO_HEADER, SESSION_COOKIE } from "@/lib/auth-routing"

// Next.js 16 mengganti konvensi middleware.ts menjadi proxy.ts dengan ekspor proxy.
//
// Proxy hanya bisa melihat cookie sesi ada atau tidak; keabsahan sesi tetap diputuskan
// PHP lewat requireSession(). Jadi ini pencegat navigasi, bukan lapisan otorisasi.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  // Query ikut dibawa: ?device= dan filter laporan adalah bagian dari halaman yang
  // diminta. Next.js sudah membuang parameter internal _rsc dari nextUrl.
  const returnTo = `${pathname}${search}`

  if (isProtectedPath(pathname) && !request.cookies.has(SESSION_COOKIE)) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", returnTo)
    return NextResponse.redirect(loginUrl)
  }

  // Cookie ada tetapi sesinya bisa saja sudah habis di PHP. requireSession() di layout
  // dan page membaca header ini agar redirect ke login tetap membawa halaman asal.
  // Nilai dari browser selalu ditimpa di sini.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(RETURN_TO_HEADER, returnTo)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  // /api/ sengaja tidak dicegat: rute itu adalah proxy BFF ke backend PHP dan
  // harus meneruskan cookie serta header CSRF apa adanya.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
