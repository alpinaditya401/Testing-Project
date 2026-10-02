import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { z } from "zod"
import { ApiError, apiRequest, authedRequest, fetchSession, sessionKey } from "@/lib/api/client"
import * as S from "@/lib/api/schemas"

// Cached data from a previous account must not leak into the next session. The
// cache is reset rather than cleared: clear() would also drop the mutation that is
// still reporting success to the login form.
function switchAccount(queryClient: QueryClient, session: S.Session | null) {
  queryClient.setQueryData(sessionKey, session)
  return queryClient.resetQueries({ predicate: (query) => query.queryKey[0] !== sessionKey[0] })
}

// data is null when nobody is logged in; that is a state, not an error.
export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: ({ signal }) => fetchSession(signal),
    staleTime: 5 * 60_000,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: z.input<typeof S.LoginInput>) =>
      apiRequest("/api/auth/login", S.Session, { method: "POST", body: S.LoginInput.parse(input) }),
    onSuccess: (session) => switchAccount(queryClient, session),
  })
}

export function useRegister() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: z.input<typeof S.RegisterInput>) =>
      apiRequest("/api/auth/register", S.Session, {
        method: "POST",
        body: S.RegisterInput.parse(input),
      }),
    onSuccess: (session) => switchAccount(queryClient, session),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      try {
        return await authedRequest(queryClient, "/api/auth/logout", S.LoggedOut, "POST", {})
      } catch (error) {
        // Sesi yang sudah habis di server berarti tujuan keluar sudah tercapai. Tanpa
        // ini tombol Keluar hanya menampilkan "Silakan login" dan pengguna tertahan.
        if (error instanceof ApiError && error.status === 401) return { logged_out: true as const }
        throw error
      }
    },
    onSuccess: () => switchAccount(queryClient, null),
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: z.input<typeof S.ProfileInput>) =>
      authedRequest(
        queryClient,
        "/api/profile",
        S.ProfileUpdated,
        "PATCH",
        S.ProfileInput.parse(input),
      ),
    // The response omits contact and workspace_owner_id, so merge rather than replace.
    onSuccess: ({ user }) => {
      queryClient.setQueryData<S.Session | null>(sessionKey, (session) =>
        session ? { ...session, user: { ...session.user, ...user } } : session,
      )
    },
  })
}
