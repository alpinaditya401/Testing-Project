import { AuditLogTable } from "@/components/settings/audit-log-table"
import { ClaimDeviceForm } from "@/components/settings/claim-device-form"
import { DeviceCard } from "@/components/settings/device-card"
import { InviteForm } from "@/components/settings/invite-form"
import { RevokeMemberButton } from "@/components/settings/revoke-member-button"
import { RuleVersionsTable } from "@/components/settings/rule-versions-table"
import { ThresholdsForm } from "@/components/settings/thresholds-form"
import { heading, panel } from "@/components/ui/styles"
import {
  AuditLogsResponse,
  DevicesResponse,
  RuleVersionsResponse,
  ThresholdsResponse,
  Workspace,
} from "@/lib/api/schemas"
import { requireSession, serverRequest } from "@/lib/api/server"
import { formatNumber } from "@/lib/format"

export const metadata = { title: "Pengaturan | AquaSmart" }

const AUDIT_LIMIT = 20

const ROLE_LABEL = { admin: "Admin", viewer: "Viewer, akses baca" } as const

export default async function SettingsPage() {
  const session = await requireSession()
  const isAdmin = session.user.role === "admin"
  const [{ thresholds }, ruleVersions, { devices }, workspace, { audit_logs }] = await Promise.all([
    serverRequest("/api/settings/thresholds", ThresholdsResponse),
    serverRequest("/api/rule-versions", RuleVersionsResponse),
    serverRequest("/api/devices", DevicesResponse),
    serverRequest("/api/workspace", Workspace),
    serverRequest(`/api/audit-logs?limit=${AUDIT_LIMIT}`, AuditLogsResponse),
  ])
  const otherMembers = workspace.members.filter((member) => member.id !== workspace.owner_id)

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className={heading()}>Pengaturan</h1>
        <p className="max-w-prose text-sm text-ink">
          Ambang kualitas air, perangkat, anggota, dan riwayat aktivitas ruang budidaya ini.
          {isAdmin
            ? ""
            : " Akun viewer bisa membaca semuanya; perubahan dilakukan admin ruang budidaya."}
        </p>
      </header>

      <section aria-labelledby="ambang" className="space-y-4">
        <div className="space-y-1">
          <h2 id="ambang" className={heading({ level: "panel", tone: "ink" })}>
            Ambang kualitas air
          </h2>
          <p className="max-w-prose text-sm text-muted">
            Angka ini dipakai untuk menilai setiap pembacaan sebagai aman atau di luar batas.
          </p>
        </div>

        <div className={`${panel()} space-y-4`}>
          {isAdmin ? (
            <ThresholdsForm thresholds={thresholds} />
          ) : (
            <>
              <dl className="grid gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-sm text-muted">pH air</dt>
                  <dd className="font-data text-lg text-ink">
                    {formatNumber(thresholds.ph_min, 1)} sampai {formatNumber(thresholds.ph_max, 1)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">Suhu air (°C)</dt>
                  <dd className="font-data text-lg text-ink">
                    {formatNumber(thresholds.temperature_min, 1)} sampai{" "}
                    {formatNumber(thresholds.temperature_max, 1)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">Kekeruhan maksimum (NTU)</dt>
                  <dd className="font-data text-lg text-ink">
                    {formatNumber(thresholds.turbidity_max, 0)}
                  </dd>
                </div>
              </dl>
              <p className="text-sm text-ink">
                Akun viewer tidak bisa mengubah ambang. Minta admin ruang budidaya kalau angkanya
                perlu disesuaikan dengan kolam Anda.
              </p>
            </>
          )}
        </div>

        <div className="space-y-3">
          <h3 className={heading({ level: "sub", tone: "ink" })}>Versi aturan tercatat</h3>
          <p className="max-w-prose text-sm text-muted">
            Saat perangkat mengirim pembacaan, server mencatat ambang yang dipakai saat itu sebagai
            satu snapshot. Id snapshot adalah hash SHA-256 dari id pemilik ruang budidaya, versi
            aturan, dan angka ambang yang tersimpan saat itu, jadi ia hanya menandai kombinasi
            tersebut. Kolom Pembacaan menghitung berapa pembacaan yang dinilai dengan snapshot itu.
          </p>
          {ruleVersions.versions.length === 0 ? (
            <p className={`${panel()} text-sm text-muted`}>
              Belum ada versi aturan tercatat. Snapshot dibuat saat perangkat mengirim pembacaan
              berikutnya, dan data lama tidak direkonstruksi.
            </p>
          ) : (
            <RuleVersionsTable versions={ruleVersions.versions} />
          )}
          <p className="max-w-prose text-xs text-muted">Catatan server: {ruleVersions.note}</p>
        </div>
      </section>

      <section aria-labelledby="perangkat" className="space-y-4">
        <div className="space-y-1">
          <h2 id="perangkat" className={heading({ level: "panel", tone: "ink" })}>
            Perangkat
          </h2>
          {isAdmin ? (
            <p className="max-w-prose text-sm text-muted">
              Nama dan lokasi dipakai di seluruh dashboard. Kunci perangkat dipakai firmware setiap
              kali mengirim data.
            </p>
          ) : (
            <p className="max-w-prose text-sm text-muted">
              Perangkat dikelola admin ruang budidaya. Akun viewer hanya melihat daftarnya.
            </p>
          )}
        </div>

        {devices.length === 0 ? (
          <p className={`${panel()} text-sm text-ink`}>
            Belum ada perangkat di ruang budidaya ini, jadi belum ada pembacaan yang masuk.{" "}
            {isAdmin
              ? "Hubungkan perangkat pertama lewat formulir di bawah, pakai serial pada label alat."
              : "Minta admin ruang budidaya menghubungkan perangkat."}
          </p>
        ) : (
          <div className="space-y-4">
            {devices.map((device) => (
              <DeviceCard key={device.id} device={device} isAdmin={isAdmin} />
            ))}
          </div>
        )}

        {isAdmin ? (
          <div className={`${panel()} space-y-4`}>
            <h3 className={heading({ level: "sub", tone: "ink" })}>Hubungkan perangkat</h3>
            <ClaimDeviceForm />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="anggota" className="space-y-4">
        <div className="space-y-1">
          <h2 id="anggota" className={heading({ level: "panel", tone: "ink" })}>
            Anggota ruang budidaya
          </h2>
          <p className="max-w-prose text-sm text-muted">
            Anggota dengan peran viewer membaca data kolam yang sama, tanpa bisa mengirim perintah
            atau mengubah pengaturan.
          </p>
        </div>

        <ul className="divide-y divide-foam-line rounded-panel border border-foam-line bg-surface-white">
          {workspace.members.map((member) => (
            <li
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6"
            >
              <div>
                <p className="font-semibold text-ink">{member.name}</p>
                <p className="text-sm text-muted">
                  {ROLE_LABEL[member.role]}
                  {member.id === workspace.owner_id ? ", pemilik ruang budidaya" : ""}
                </p>
              </div>
              {isAdmin && member.id !== workspace.owner_id ? (
                <RevokeMemberButton memberId={member.id} name={member.name} />
              ) : null}
            </li>
          ))}
        </ul>

        {otherMembers.length === 0 ? (
          <p className="max-w-prose text-sm text-muted">
            Belum ada anggota lain di ruang budidaya ini.
            {isAdmin
              ? " Buat undangan di bawah kalau ada orang yang perlu ikut memantau kolam."
              : ""}
          </p>
        ) : null}

        {isAdmin ? (
          <div className={`${panel()} space-y-4`}>
            <div className="space-y-1">
              <h3 className={heading({ level: "sub", tone: "ink" })}>Undang anggota</h3>
              <p className="max-w-prose text-sm text-muted">
                Undangan menghasilkan token yang hanya ditampilkan sekali. Orang yang diundang
                memakainya untuk bergabung dengan akun yang kontaknya sama.
              </p>
            </div>
            <InviteForm />
          </div>
        ) : (
          <p className={`${panel()} text-sm text-ink`}>
            Akun viewer tidak bisa mengundang atau mencabut anggota. Daftar di atas dikelola admin
            ruang budidaya.
          </p>
        )}
      </section>

      <section aria-labelledby="riwayat-aktivitas" className="space-y-4">
        <div className="space-y-1">
          <h2 id="riwayat-aktivitas" className={heading({ level: "panel", tone: "ink" })}>
            Riwayat aktivitas
          </h2>
          <p className="max-w-prose text-sm text-muted">
            Paling banyak {AUDIT_LIMIT} catatan terakhir yang tercatat atas nama pemilik ruang
            budidaya dan perangkatnya. Aktivitas yang dilakukan akun anggota lain dicatat terpisah
            dan tidak masuk daftar ini. Aktivitas yang belum punya terjemahan tampil dengan kode
            aslinya dari server.
          </p>
        </div>
        {audit_logs.length === 0 ? (
          <p className={`${panel()} text-sm text-muted`}>
            Belum ada aktivitas tercatat. Catatan muncul setelah ada yang masuk, mengubah
            pengaturan, atau perangkat mengirim data.
          </p>
        ) : (
          <AuditLogTable logs={audit_logs} />
        )}
      </section>
    </div>
  )
}
