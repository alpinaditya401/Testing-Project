"use client"

import {
  Bell,
  CalendarClock,
  Compass,
  FileBarChart,
  Gauge,
  Settings,
  SlidersHorizontal,
  UserRound,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

// Order follows the contract weight of each feature; Jelajah 3D, the only link out of the
// dashboard, sits beside the readings because it shows the hardware behind them.
// Icons name what each route holds, not a uniform library look.
export const LINKS = [
  { href: "/dashboard", label: "Kualitas Air", icon: Gauge },
  { href: "/jelajah", label: "Jelajah 3D", icon: Compass },
  { href: "/dashboard/control", label: "Kontrol Aktuator", icon: SlidersHorizontal },
  { href: "/dashboard/schedule", label: "Jadwal Pakan", icon: CalendarClock },
  { href: "/dashboard/alerts", label: "Peringatan", icon: Bell },
  { href: "/dashboard/reports", label: "Laporan", icon: FileBarChart },
  { href: "/dashboard/settings", label: "Pengaturan", icon: Settings },
  { href: "/dashboard/profile", label: "Profil", icon: UserRound },
] as const

// /dashboard is a prefix of every other route, so it only matches exactly.
export function isActive(href: string, pathname: string) {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href)
}

export function NavLinks({
  unacknowledged,
  onNavigate,
}: {
  unacknowledged: number
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  return (
    <ul className="space-y-1">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href, pathname)
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-crisp px-3 text-sm font-medium",
                active ? "bg-deep-current text-foam" : "text-ink hover:bg-bg-deep",
              )}
            >
              <Icon aria-hidden="true" className="size-5 shrink-0" />
              <span className="flex-1">{label}</span>
              {href === "/dashboard/alerts" && unacknowledged > 0 ? (
                <span
                  className={cn(
                    "rounded-crisp px-2 py-0.5 font-data text-xs",
                    active ? "bg-foam text-ink" : "bg-alarm-coral-text text-white",
                  )}
                >
                  {unacknowledged}
                  <span className="sr-only"> peringatan belum ditangani</span>
                </span>
              ) : null}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
