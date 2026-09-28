import Link from "next/link"
import { redirect } from "next/navigation"
import { RegisterForm } from "@/components/auth/register-form"
import { AuthFrame } from "@/components/studio/auth-frame"
import { sentenceLink } from "@/components/ui/styles"
import { getSession } from "@/lib/api/server"

export const metadata = { title: "Daftar Akun | AquaSmart" }

export default async function RegisterPage() {
  if (await getSession()) redirect("/dashboard")

  return (
    <AuthFrame>
      <span className="eyebrow">Mulai dari kolam Anda</span>
      <div>
        <h1 className="auth-title">
          Ruang baru.
          <br />
          Budidaya lebih tertata.
        </h1>
        <p className="mt-2 text-sm text-muted">
          Akun yang dibuat di sini menjadi admin ruang budidayanya sendiri. Anda yang menghubungkan
          perangkat, mengatur ambang batas air, dan mengundang anggota lain sebagai viewer.
        </p>
        <div className="mt-6">
          <RegisterForm />
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-ink">
        Sudah punya akun?{" "}
        <Link href="/login" className={sentenceLink}>
          Masuk di sini
        </Link>
      </p>
    </AuthFrame>
  )
}
