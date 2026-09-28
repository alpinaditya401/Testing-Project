import Image from "next/image"
import Link from "next/link"
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link className="studio-brand" href={href}>
      <Image src="/logo.svg" alt="" width={36} height={36} />
      <span>
        AquaSmart<span className="brand-dot">.</span>
      </span>
    </Link>
  )
}
