/**
 * BFF proxy: browser -> Next.js (same-origin) -> backend PHP.
 *
 * Kenapa ada: auth AquaSmart memakai session cookie + header CSRF. Kalau browser
 * memanggil PHP langsung (beda origin), cookie butuh SameSite=None; Secure dan
 * CORS bercredential dengan origin persis — rapuh dan sulit di-debug.
 * Lewat sini browser melihat same-origin, jadi tidak ada CORS sama sekali.
 *
 * Sekaligus memenuhi pola Backend for Frontend di rubrik item (l).
 */

const BACKEND = process.env.AQUASMART_API_URL

if (!BACKEND) {
  throw new Error("AQUASMART_API_URL belum di-set")
}

// Rahasia bersama dengan PHP (env AQUASMART_PROXY_SECRET di kedua sisi). Di belakang
// BFF, REMOTE_ADDR di PHP selalu IP server Next.js, sehingga batas login dan register
// berlaku untuk semua pengguna sekaligus. Bila rahasia ini di-set, BFF mengirim IP
// klien beserta rahasianya, dan PHP memakai IP itu sebagai identitas rate limit hanya
// jika rahasianya cocok. Tanpa rahasia, kedua header tidak dikirim dan PHP kembali
// memakai REMOTE_ADDR.
const PROXY_SECRET = process.env.AQUASMART_PROXY_SECRET

// IP klien seperti yang dicatat proxy di depan Next.js. Header ini hanya layak
// dipercaya bila proxy tersebut menimpanya (misalnya Vercel); tanpa proxy seperti itu
// klien bisa mengisinya sendiri. Lihat README.
function clientAddress(request: Request): string | undefined {
  const realIp = request.headers.get("x-real-ip")?.trim()
  if (realIp) return realIp
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwardedFor || undefined
}

// Header yang diteruskan ke PHP. Daftar tertutup: Host, Origin dan Referer
// sengaja TIDAK diteruskan supaya tidak bentrok dengan pemeriksaan sisi PHP.
// Header x-aquasmart-* dari browser juga tidak pernah lolos; hanya BFF yang
// menuliskannya, di bawah.
const REQUEST_HEADERS = [
  "cookie",
  "content-type",
  "accept",
  "x-csrf-token",
  "x-device-key",
] as const

// Header yang dikembalikan ke browser. Set-Cookie ditangani terpisah karena
// bisa lebih dari satu dan Headers biasa menggabungkannya jadi satu string.
const RESPONSE_HEADERS = [
  "content-type",
  "content-disposition",
  "cache-control",
  "retry-after",
  "x-export-rows",
  "x-provenance-counts",
] as const

async function proxy(request: Request, path: string[]): Promise<Response> {
  const incoming = new URL(request.url)
  const target = `${BACKEND}/api/${path.map(encodeURIComponent).join("/")}${incoming.search}`

  const headers = new Headers()
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  if (PROXY_SECRET) {
    headers.set("X-AquaSmart-Proxy-Secret", PROXY_SECRET)
    const clientIp = clientAddress(request)
    if (clientIp) headers.set("X-AquaSmart-Client-IP", clientIp)
  }

  const method = request.method.toUpperCase()
  const body = method === "GET" || method === "HEAD" ? undefined : await request.text()

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
    })
  } catch {
    // Backend tidak terjangkau. Bentuk error dibuat sama dengan error PHP
    // supaya klien hanya perlu menangani satu bentuk.
    return Response.json(
      { error: { code: "backend_unreachable", message: "Server tidak dapat dihubungi." } },
      { status: 502 },
    )
  }

  const responseHeaders = new Headers()
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) responseHeaders.set(name, value)
  }

  // getSetCookie() mengembalikan tiap Set-Cookie sebagai elemen terpisah.
  // upstream.headers.get("set-cookie") akan menggabungkannya dan merusak cookie.
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append("set-cookie", cookie)
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}

type Context = { params: Promise<{ path: string[] }> }

async function handler(request: Request, context: Context): Promise<Response> {
  const { path } = await context.params
  return proxy(request, path)
}

export const GET = handler
export const POST = handler
export const PATCH = handler
export const PUT = handler
export const DELETE = handler

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
