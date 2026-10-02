import Link from "next/link"
import { AlertList } from "@/components/alerts/alert-list"
import { parseAlertStatus, StatusFilter } from "@/components/alerts/status-filter"
import { AutoRefresh } from "@/components/auto-refresh"
import { heading, inlineLink, panel } from "@/components/ui/styles"
import { AlertsResponse, DevicesResponse } from "@/lib/api/schemas"
import { requireSession, serverRequest } from "@/lib/api/server"

export const metadata = { title: "Peringatan | AquaSmart" }

// One constant for the window size, so the request and the sentences that describe it
// cannot drift apart. unacknowledged_count covers every alert, not just this window.
const ALERT_LIMIT = 50

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const session = await requireSession()
  const isAdmin = session.user.role === "admin"
  const [{ alerts, unacknowledged_count }, { devices }] = await Promise.all([
    serverRequest(`/api/alerts?limit=${ALERT_LIMIT}`, AlertsResponse),
    serverRequest("/api/devices", DevicesResponse),
  ])

  const status = parseAlertStatus((await searchParams).status)
  const pending = alerts.filter((alert) => !alert.acknowledged)
  const visible = status === "belum" ? pending : alerts
  const olderPending = unacknowledged_count - pending.length
  const deviceNames = new Map<string, string>(devices.map((device) => [device.id, device.name]))

  return (
    <div className="space-y-8">
      <AutoRefresh seconds={30} />

      <header className="space-y-3">
        <h1 className={heading()}>Peringatan</h1>
        <p className="text-sm text-ink">
          Peringatan ruang budidaya, terbaru di atas. Halaman memuat sampai {ALERT_LIMIT} peringatan
          terakhir dan diperbarui otomatis setiap 30 detik.
        </p>
      </header>

      <section aria-labelledby="ringkasan" className={panel()}>
        <h2 id="ringkasan" className="sr-only">
          Ringkasan peringatan
        </h2>
        {unacknowledged_count > 0 ? (
          <>
            <p className="font-semibold text-alarm-coral-text">
              {unacknowledged_count} peringatan belum ditangani.
            </p>
            {olderPending > 0 ? (
              <p className="mt-2 text-sm text-ink">
                {olderPending} di antaranya lebih lama dari {ALERT_LIMIT} peringatan terakhir, jadi
                tidak ikut ditampilkan di daftar ini.
              </p>
            ) : null}
          </>
        ) : alerts.length === 0 ? (
          <>
            <p className="font-semibold text-ink">Belum ada peringatan yang tercatat.</p>
            <p className="mt-2 text-sm text-ink">
              Tidak ada yang menunggu tindakan Anda di halaman ini.
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold text-clear-water-text">
              Tidak ada peringatan yang menunggu ditangani.
            </p>
            <p className="mt-2 text-sm text-ink">
              Semua peringatan yang tercatat sudah ditandai sebagai ditangani.
            </p>
          </>
        )}
      </section>

      {isAdmin ? null : (
        <p className={`${panel()} text-sm text-ink`}>
          Akun viewer hanya bisa membaca peringatan. Penandaan sudah ditangani hanya bisa dilakukan
          admin ruang budidaya.
        </p>
      )}

      <section aria-labelledby="daftar-peringatan" className="space-y-4">
        <h2 id="daftar-peringatan" className={heading({ level: "panel", tone: "ink" })}>
          Daftar peringatan
        </h2>
        <StatusFilter active={status} />
        {alerts.length === 0 ? (
          <p className={`${panel()} text-sm text-ink`}>
            Daftar terisi saat perangkat mengirim pembacaan yang melewati ambang di Pengaturan.
            Kalau Anda menunggu peringatan yang tidak pernah muncul, periksa ambangnya di sana.
          </p>
        ) : visible.length === 0 ? (
          <div className={`${panel()} space-y-2 text-sm text-ink`}>
            <p>
              Tidak ada peringatan yang belum ditangani di antara {alerts.length} peringatan
              terakhir. Saringan sedang menyembunyikan yang sudah ditandai.
            </p>
            <Link href="/dashboard/alerts?status=semua" className={inlineLink}>
              Lihat semua peringatan
            </Link>
          </div>
        ) : (
          <AlertList alerts={visible} deviceNames={deviceNames} canAcknowledge={isAdmin} />
        )}
      </section>

      <section aria-labelledby="cara-peringatan" className="border-t border-foam-line pt-5">
        <h2 id="cara-peringatan" className={heading({ level: "sub", tone: "ink" })}>
          Cara peringatan ini dihitung
        </h2>
        <p className="mt-2 max-w-prose text-sm text-ink">
          Server membandingkan setiap pembacaan baru dengan ambang kualitas air ruang budidaya, yang
          nilai awalnya berasal dari ThresholdRules.php dan bisa diubah di Pengaturan. Peringatan
          ditulis saat pembacaan melewati batas sementara pembacaan sebelumnya dari sumber yang sama
          masih di dalam batas, jadi satu kondisi yang bertahan tidak mengisi daftar ini berulang
          kali.
        </p>
        <p className="mt-2 max-w-prose text-sm text-ink">
          Label sumber ditulis apa adanya dari server. SIMULASI berarti pembacaannya datang dari
          simulator, bukan sensor terkalibrasi. DEVICE berarti pengirimnya menyatakan data itu dari
          perangkat, dan kalibrasinya belum diverifikasi. MANUAL berarti barisnya ditulis orang.
          SEED / data contoh dan LEGACY / UNVERIFIED berarti barisnya ikut terpasang bersama data
          contoh instalasi, jadi baris itu belum tentu lahir dari pembacaan yang melewati ambang.
        </p>
      </section>
    </div>
  )
}
