import Link from "next/link"
import { redirect } from "next/navigation"
import { LoginForm } from "@/components/auth/login-form"
import { AuthFrame } from "@/components/studio/auth-frame"
import { sentenceLink } from "@/components/ui/styles"
import { getSession } from "@/lib/api/server"
import { safeRedirect } from "@/lib/form"

export const metadata = { title: "Masuk | AquaSmart" }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const redirectTo = safeRedirect((await searchParams).redirect)
  if (await getSession()) redirect(redirectTo)

  return (
    <AuthFrame>
      <span className="eyebrow">Ruang budidaya Anda</span>
      <div>
        <h1 className="auth-title">
          Selamat datang
          <br />
          kembali.
        </h1>
        <p className="mt-2 text-sm text-muted">
          Masuk untuk memantau kualitas air dan perangkat budidaya Anda.
        </p>
        <div className="mt-6">
          <LoginForm redirectTo={redirectTo} />
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-ink">
        Belum punya akun?{" "}
        <Link href="/register" className={sentenceLink}>
          Buat akun di sini
        </Link>
      </p>
    </AuthFrame>
  )
}
