"use client"

import { usePathname } from "next/navigation"
import { isActive, LINKS } from "./nav-links"

// The dashboard layout does not re-render on navigation, so the trail reads the path here.
export function CurrentPage() {
  const pathname = usePathname()
  const link = LINKS.find(({ href }) => isActive(href, pathname))
  if (!link) return null
  return (
    <>
      <span aria-hidden="true">/</span>
      {link.label}
    </>
  )
}
