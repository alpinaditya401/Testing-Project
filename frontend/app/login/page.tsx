import Link from "next/link"
import { redirect } from "next/navigation"
import { LoginForm } from "@/components/auth/login-form"
import { brandLink, heading, panel, sentenceLink } from "@/components/ui/styles"
import { getOptionalSession } from "@/lib/api/server"
import { safeRedirect } from "@/lib/form"

export const metadata = { title: "Masuk | AquaSmart" }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const redirectTo = safeRedirect((await searchParams).redirect)
  if (await getOptionalSession()) redirect(redirectTo)

  return (
    <main
      id="konten"
      className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10"
    >
      <Link href="/" className={brandLink}>
        AquaSmart
      </Link>
      <div className={`${panel()} mt-6`}>
        <h1 className={heading({ level: "section" })}>Selamat datang kembali</h1>
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
    </main>
  )
}
