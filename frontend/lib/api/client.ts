import type { QueryClient } from "@tanstack/react-query"
import type { z } from "zod"
import { ApiErrorBody, Session } from "./schemas"

type Method = "GET" | "POST" | "PATCH" | "DELETE"

// Paths are the backend paths from API.md. The browser only ever talks to the
// same-origin BFF at app/api/[...path]/route.ts, never to the PHP host.
type ApiPath = `/api/${string}`

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
}

// The request succeeded but the body is not what the contract promises. Kept apart
// from ApiError so a drifting backend is never mistaken for a user or network error.
export class ContractError extends Error {
  readonly path: string
  readonly validation: z.ZodError

  constructor(path: string, validation: z.ZodError) {
    super(`Respons server untuk ${path} tidak sesuai kontrak API.`)
    this.name = "ContractError"
    this.path = path
    this.validation = validation
  }
}

type RequestOptions = {
  method?: Method
  body?: unknown
  csrfToken?: string
  signal?: AbortSignal
}

export async function apiRequest<S extends z.ZodType>(
  path: ApiPath,
  schema: S,
  { method = "GET", body, csrfToken, signal }: RequestOptions = {},
): Promise<z.output<S>> {
  const headers = new Headers({ Accept: "application/json" })
  if (body !== undefined) headers.set("Content-Type", "application/json")
  if (csrfToken) headers.set("X-CSRF-Token", csrfToken)

  // A failed fetch throws the browser's own TypeError, whose message is English and
  // means nothing to the farmer; every caller renders error.message straight into
  // the UI, so the translation belongs here rather than in each form.
  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    throw new ApiError(0, "network_error", "Koneksi ke server terputus. Coba lagi.")
  }

  const isJson = response.headers.get("content-type")?.includes("application/json") ?? false
  const payload: unknown = isJson ? await response.json() : null

  if (!response.ok) {
    const error = ApiErrorBody.safeParse(payload)
    if (error.success) {
      throw new ApiError(response.status, error.data.error.code, error.data.error.message)
    }
    throw new ApiError(
      response.status,
      "unexpected_response",
      `Server membalas HTTP ${response.status} tanpa pesan error.`,
    )
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) throw new ContractError(path, parsed.error)
  return parsed.data
}

/* Session and CSRF */

// The CSRF token belongs to the PHP session, so it lives in the session query
// (server state), never in the Zustand UI store.
export const sessionKey = ["session"] as const

export async function fetchSession(signal?: AbortSignal) {
  try {
    return await apiRequest("/api/auth/me", Session, { signal })
  } catch (error) {
    // Not being logged in is a normal state for this query, not a failure.
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

async function csrfToken(queryClient: QueryClient, fresh = false): Promise<string> {
  // null di cache hanya berarti "terakhir kali dicek, belum login". Sesudah satu 401,
  // pengguna bisa saja login lagi di tab lain dengan cookie yang sama. Kalau null
  // dipercaya begitu saja (seperti ensureQueryData), tab ini menolak setiap mutasi
  // tanpa pernah bertanya ke server sampai halaman dimuat ulang.
  const cached = queryClient.getQueryData<Session | null>(sessionKey)
  const session =
    fresh || !cached
      ? await queryClient.fetchQuery({
          queryKey: sessionKey,
          queryFn: ({ signal }) => fetchSession(signal),
          staleTime: 0,
        })
      : cached
  if (!session) throw new ApiError(401, "unauthenticated", "Silakan login terlebih dahulu.")
  return session.csrf_token
}

// API.md: every mutation from a logged-in session must carry X-CSRF-Token.
export async function authedRequest<S extends z.ZodType>(
  queryClient: QueryClient,
  path: ApiPath,
  schema: S,
  method: Exclude<Method, "GET">,
  body?: unknown,
): Promise<z.output<S>> {
  try {
    return await apiRequest(path, schema, { method, body, csrfToken: await csrfToken(queryClient) })
  } catch (error) {
    // PHP rotates the token on login and register, so a login in another tab
    // leaves this tab's cached token stale. Auth.php rejects the request before
    // the handler runs, which makes one retry with a fresh token safe.
    if (!(error instanceof ApiError && error.code === "csrf_mismatch")) throw error
    const token = await csrfToken(queryClient, true)
    return apiRequest(path, schema, { method, body, csrfToken: token })
  }
}

export function devicePath(deviceId: string, suffix = ""): ApiPath {
  return `/api/devices/${encodeURIComponent(deviceId)}${suffix}`
}
