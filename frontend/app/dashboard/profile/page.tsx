import { LogoutButton } from "@/components/app-shell/logout-button"
import { JoinWorkspaceForm } from "@/components/profile/join-workspace-form"
import { ProfileForm } from "@/components/profile/profile-form"
import { heading, panel } from "@/components/ui/styles"
import { DevicesResponse, type User, Workspace } from "@/lib/api/schemas"
import { requireSession, serverRequest } from "@/lib/api/server"

export const metadata = { title: "Profil Akun | AquaSmart" }

const ROLE_LABEL = {
  admin: "Admin ruang budidaya",
  viewer: "Viewer, akses baca",
} as const

const ROLE_SCOPE = {
  admin:
    "Peran admin bisa menghubungkan perangkat, mengirim perintah kontrol, mengubah jadwal " +
    "pakan, dan mengubah ambang batas kualitas air.",
  viewer:
    "Peran viewer hanya bisa membaca data ruang budidaya ini. Kontrol, jadwal, dan pengaturan " +
    "hanya bisa diubah admin ruang tersebut. Profil sendiri tetap bisa diubah dari halaman ini.",
} as const

// WorkspaceRepository::accept refuses an invitation under these conditions, so the
// form is only offered when it can still succeed. The order here is the order the
// reasons are worth telling a user, not the server's order of checks.
function joinBlocker(user: User, deviceCount: number, otherMembers: number): string | null {
  if (user.workspace_owner_id !== null) {
    return (
      "Akun ini sudah bergabung ke sebuah ruang budidaya, jadi undangan baru tidak bisa " +
      "diterima. " +
      "Admin ruang tersebut yang bisa mengeluarkan akun ini, dan setelah dikeluarkan akun " +
      "kembali menjadi admin ruangnya sendiri."
    )
  }
  if (deviceCount > 0) {
    return (
      `Akun ini sudah punya ${deviceCount} perangkat terdaftar. Server hanya menerima undangan ` +
      "untuk akun yang belum punya perangkat, jadi akun ini tetap menjadi admin ruang " +
      "budidayanya sendiri."
    )
  }
  if (otherMembers > 0) {
    return (
      `Ruang budidaya ini masih punya ${otherMembers} anggota lain. Selama masih ada anggota, ` +
      "server menolak permintaan bergabung karena anggota itu akan kehilangan aksesnya."
    )
  }
  if (user.contact === null) {
    return (
      "Akun ini belum punya kontak yang tercatat, padahal undangan dicocokkan dengan kontak " +
      "akun. Kontak tidak bisa diubah dari halaman ini, jadi undangan akan ditolak server."
    )
  }
  return null
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <dt className="text-sm text-muted">{label}</dt>
      {/* Username and contact are one unbroken token (an email or a phone number),
          which only break-all wraps inside the panel on a narrow screen. */}
      <dd className="mt-0.5 break-all text-ink">{value}</dd>
    </div>
  )
}

// /api/auth/me carries the account itself; devices and workspace membership are what
// decide whether this account can still join another workspace, and they name the
// workspace it already belongs to.
export default async function ProfilePage() {
  const { user } = await requireSession()
  const [{ devices }, workspace] = await Promise.all([
    serverRequest("/api/devices", DevicesResponse),
    serverRequest("/api/workspace", Workspace),
  ])

  const owner = workspace.members.find((member) => member.id === user.workspace_owner_id)
  const otherMembers = workspace.members.filter((member) => member.id !== user.id).length
  const blocker = joinBlocker(user, devices.length, otherMembers)

  const workspaceStatus =
    user.workspace_owner_id === null
      ? devices.length === 0
        ? "Ruang budidaya sendiri, belum ada perangkat terdaftar"
        : `Ruang budidaya sendiri, ${devices.length} perangkat terdaftar`
      : owner
        ? `Bergabung ke ruang budidaya milik ${owner.name}`
        : "Bergabung ke ruang budidaya milik akun lain"

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm text-muted">Profil akun</p>
        <h1 className={heading()}>{user.name}</h1>
        <p className="max-w-prose text-sm text-ink">
          Masuk sebagai {user.username}. Nama dan nomor telepon bisa diubah di halaman ini.
        </p>
      </header>

      <section aria-labelledby="ringkasan-akun" className={`${panel()} space-y-4`}>
        <h2 id="ringkasan-akun" className={heading({ level: "panel", tone: "ink" })}>
          Ringkasan akun
        </h2>
        <dl className="divide-y divide-foam-line">
          <Row label="Nama lengkap" value={user.name} />
          <Row label="Username" value={user.username} />
          <Row label="Kontak (email atau nomor WA)" value={user.contact ?? "belum diisi"} />
          <Row label="Nomor telepon" value={user.phone || "belum diisi"} />
          <Row label="Peran" value={ROLE_LABEL[user.role]} />
          <Row label="Ruang budidaya" value={workspaceStatus} />
        </dl>
        <p className="max-w-prose text-sm text-muted">{ROLE_SCOPE[user.role]}</p>
      </section>

      <section aria-labelledby="ubah-profil" className={`${panel()} space-y-4`}>
        <div className="space-y-1">
          <h2 id="ubah-profil" className={heading({ level: "panel", tone: "ink" })}>
            Ubah nama dan nomor telepon
          </h2>
          <p className="max-w-prose text-sm text-muted">
            Endpoint profil hanya menerima nama dan nomor telepon. Username adalah identitas untuk
            masuk, dan pada akun yang dibuat lewat formulir daftar nilainya sama dengan kontak yang
            diketik saat mendaftar, jadi keduanya tidak bisa diubah dari sini.
          </p>
        </div>
        <ProfileForm name={user.name} phone={user.phone} />
      </section>

      <section aria-labelledby="gabung-ruang" className={`${panel()} space-y-4`}>
        <div className="space-y-2">
          <h2 id="gabung-ruang" className={heading({ level: "panel", tone: "ink" })}>
            Gabung ke ruang budidaya
          </h2>
          <p className="max-w-prose text-sm text-ink">
            Token undangan dibuat admin ruang budidaya dan dikirim lewat jalur pribadi, misalnya
            pesan WhatsApp. Token berlaku 24 jam sejak dibuat dan hanya bisa dipakai satu kali.
          </p>
          <p className="max-w-prose text-sm text-ink">
            Setelah bergabung, peran akun ini berubah menjadi viewer dengan akses baca: data ruang
            itu bisa dilihat, tetapi kontrol aktuator, jadwal pakan, dan pengaturan hanya bisa
            diubah admin ruang tersebut.
          </p>
        </div>
        {blocker ? (
          <p className="max-w-prose text-sm text-muted">{blocker}</p>
        ) : (
          <>
            <p className="max-w-prose break-all text-sm text-muted">
              Server hanya menerima undangan yang dialamatkan ke kontak akun ini, yaitu{" "}
              {user.contact}.
            </p>
            <JoinWorkspaceForm />
          </>
        )}
      </section>

      <section aria-labelledby="keluar-akun" className={`${panel()} space-y-3`}>
        <h2 id="keluar-akun" className={heading({ level: "panel", tone: "ink" })}>
          Keluar akun
        </h2>
        <p className="max-w-prose text-sm text-ink">
          Keluar mengakhiri sesi PHP di server, lalu halaman kembali ke layar masuk. Data akun tidak
          dihapus.
        </p>
        <LogoutButton />
      </section>
    </div>
  )
}
