import Link from "next/link"
import { redirect } from "next/navigation"
import { RegisterForm } from "@/components/auth/register-form"
import { brandLink, heading, panel, sentenceLink } from "@/components/ui/styles"
import { getOptionalSession } from "@/lib/api/server"

export const metadata = { title: "Daftar Akun | AquaSmart" }

export default async function RegisterPage() {
  if (await getOptionalSession()) redirect("/dashboard")

  return (
    <main
      id="konten"
      className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10"
    >
      <Link href="/" className={brandLink}>
        AquaSmart
      </Link>
      <div className={`${panel()} mt-6`}>
        <h1 className={heading({ level: "section" })}>Buat akun AquaSmart</h1>
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
    </main>
  )
}
