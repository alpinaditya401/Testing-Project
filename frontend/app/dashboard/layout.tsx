import Link from "next/link"
import { LogoutButton } from "@/components/app-shell/logout-button"
import { MobileMenu } from "@/components/app-shell/mobile-menu"
import { NavLinks } from "@/components/app-shell/nav-links"
import { SessionSeed } from "@/components/app-shell/session-seed"
import { brandLink } from "@/components/ui/styles"
import { AlertsResponse } from "@/lib/api/schemas"
import { requireSession, serverRequest } from "@/lib/api/server"

const ROLE_LABEL = { admin: "Admin", viewer: "Viewer, akses baca" } as const

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()
  // limit=1 is enough: the count of unhandled alerts comes back regardless.
  const { unacknowledged_count } = await serverRequest("/api/alerts?limit=1", AlertsResponse)

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <a href="#konten" className="skip-link">
        Lewati ke konten
      </a>
      <SessionSeed session={session} />

      <header className="relative flex items-center justify-between gap-3 border-b border-foam-line bg-surface-white px-4 py-3 lg:hidden">
        <Link href="/dashboard" className={brandLink}>
          AquaSmart
        </Link>
        <MobileMenu unacknowledged={unacknowledged_count} />
      </header>

      <aside className="hidden border-r border-foam-line bg-surface-white lg:flex lg:flex-col">
        <div className="border-b border-foam-line p-5">
          <Link href="/dashboard" className={brandLink}>
            AquaSmart
          </Link>
          <p className="mt-1 text-xs text-muted">Pemantauan kualitas air</p>
        </div>
        <nav aria-label="Navigasi utama" className="flex-1 p-3">
          <NavLinks unacknowledged={unacknowledged_count} />
        </nav>
        <div className="space-y-3 border-t border-foam-line p-4">
          <div>
            <p className="text-sm font-semibold text-ink">{session.user.name}</p>
            <p className="text-xs text-muted">{ROLE_LABEL[session.user.role]}</p>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <main id="konten" tabIndex={-1} className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-content">{children}</div>
      </main>
    </div>
  )
}
