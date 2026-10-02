"use client"

import { type QueryClient, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { sessionKey } from "@/lib/api/client"
import type { Session } from "@/lib/api/schemas"

// Sesi di cache diganti bila kosong, null (tercatat logout sesudah 401), atau milik
// token/akun lain. Server baru saja membaca sesi ini dari PHP, jadi ia yang terbaru.
function seed(queryClient: QueryClient, session: Session) {
  const cached = queryClient.getQueryData<Session | null>(sessionKey)
  if (!cached || cached.csrf_token !== session.csrf_token || cached.user.id !== session.user.id) {
    queryClient.setQueryData(sessionKey, session)
  }
}

// The layout already fetched the session on the server. Seeding the query cache
// with it gives client mutations their CSRF token without a second /api/auth/me.
// Like HydrationBoundary, the first write happens during render, so the token is in
// place before any child can fire a mutation; no component observes this query, so
// no mounted observer is updated in the middle of a render.
//
// Layout dashboard tidak di-mount ulang saat navigasi di sisi klien, tetapi
// router.refresh() dan AutoRefresh merendernya lagi dengan sesi terbaru dari server.
// Effect menangkap perubahan itu, misalnya setelah login ulang di tab lain.
export function SessionSeed({ session }: { session: Session }) {
  const queryClient = useQueryClient()
  useState(() => seed(queryClient, session))
  useEffect(() => seed(queryClient, session), [queryClient, session])
  return null
}
