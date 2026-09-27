import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

const protectedRoutes = ["/dashboard", "/settings", "/profile"]

// Nama cookie ditetapkan Auth::startSession() di server PHP. Middleware hanya
// bisa melihat cookie itu ada atau tidak; keabsahan sesi tetap diputuskan PHP.
// Jadi ini pencegat navigasi, bukan lapisan otorisasi.
const SESSION_COOKIE = "aquasmart_session"

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (protectedRoutes.some((route) => pathname.startsWith(route))) {
    if (!request.cookies.has(SESSION_COOKIE)) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("redirect", pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  // /api/ sengaja tidak dicegat: rute itu adalah proxy BFF ke backend PHP dan
  // harus meneruskan cookie serta header CSRF apa adanya.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
