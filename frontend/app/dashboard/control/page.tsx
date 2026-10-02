import Link from "next/link"
import { AutoRefresh } from "@/components/auto-refresh"
import { ActuatorToggle } from "@/components/control/actuator-toggle"
import { CommandTable, STATUS_LABEL } from "@/components/control/command-table"
import { FeedNowForm } from "@/components/control/feed-now-form"
import { SimulationNotice } from "@/components/control/simulation-notice"
import { NoDevice } from "@/components/dashboard/no-device"
import { DevicePicker } from "@/components/device-picker"
import { heading, inlineLink, panel } from "@/components/ui/styles"
import { CommandsResponse, DevicesResponse } from "@/lib/api/schemas"
import { requireSession, serverRequest } from "@/lib/api/server"
import { pickDevice } from "@/lib/devices"
import { formatDateTime, formatEpoch } from "@/lib/format"

export const metadata = { title: "Kontrol Aktuator | AquaSmart" }

function State({ on }: { on: boolean }) {
  return (
    <p className="text-sm text-ink">
      Status tercatat:{" "}
      <span className={on ? "font-semibold text-clear-water-text" : "font-semibold text-muted"}>
        {on ? "Menyala" : "Mati"}
      </span>
    </p>
  )
}

export default async function ControlPage({
  searchParams,
}: {
  searchParams: Promise<{ device?: string }>
}) {
  const session = await requireSession()
  const isAdmin = session.user.role === "admin"
  const { devices } = await serverRequest("/api/devices", DevicesResponse)
  const device = pickDevice(devices, (await searchParams).device)
  if (!device) return <NoDevice isAdmin={isAdmin} />

  const { commands } = await serverRequest(
    `/api/devices/${encodeURIComponent(device.id)}/commands`,
    CommandsResponse,
  )
  const lastFeed = commands.find((command) => command.actuator === "feeder")
  const query = `?device=${encodeURIComponent(device.id)}`

  return (
    <div className="space-y-8">
      <AutoRefresh seconds={10} />

      <header className="space-y-3">
        <p className="text-sm text-muted">{device.location}</p>
        <h1 className={heading()}>Kontrol Aktuator: {device.name}</h1>
        <p className="text-sm text-ink">
          {device.online
            ? "Perangkat online."
            : "Perangkat offline. Perintah tetap tercatat, tetapi belum tentu diambil."}{" "}
          Status diperbarui otomatis setiap 10 detik.
        </p>
        <DevicePicker devices={devices} selectedId={device.id} basePath="/dashboard/control" />
      </header>

      <SimulationNotice />

      {isAdmin ? null : (
        <p className={`${panel()} text-sm text-ink`}>
          Akun viewer hanya bisa melihat status. Perintah hanya bisa dikirim admin ruang budidaya.
        </p>
      )}

      <section aria-labelledby="aktuator" className="space-y-4">
        <h2 id="aktuator" className="sr-only">
          Aktuator
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <article className={`${panel()} flex flex-col gap-4`}>
            <div className="space-y-1">
              <h3 className={heading({ level: "panel", tone: "ink" })}>Aerator</h3>
              <p className="text-sm text-muted">Menambah sirkulasi dan oksigen di air kolam.</p>
            </div>
            <State on={device.aerator} />
            {isAdmin ? (
              <div className="mt-auto">
                <ActuatorToggle
                  deviceId={device.id}
                  actuator="aerator"
                  label="aerator"
                  on={device.aerator}
                />
              </div>
            ) : null}
          </article>

          <article className={`${panel()} flex flex-col gap-4`}>
            <div className="space-y-1">
              <h3 className={heading({ level: "panel", tone: "ink" })}>Feeder</h3>
              <p className="text-sm text-muted">
                Memberi pakan satu kali selama durasi yang dipilih.
              </p>
            </div>
            <p className="text-sm text-ink">
              {lastFeed
                ? `Perintah pakan terakhir ${formatEpoch(lastFeed.created_at)}, status ${STATUS_LABEL[lastFeed.status]}.`
                : "Belum ada perintah pakan untuk perangkat ini."}
            </p>
            {isAdmin ? (
              <div className="mt-auto">
                <FeedNowForm deviceId={device.id} />
              </div>
            ) : null}
          </article>

          <article className={`${panel()} flex flex-col gap-4`}>
            <div className="space-y-1">
              <h3 className={heading({ level: "panel", tone: "ink" })}>Mode otomatis</h3>
              <p className="text-sm text-muted">
                Saat menyala, jadwal pakan yang aktif dijalankan scheduler simulator.
              </p>
            </div>
            <State on={device.auto} />
            <Link href={`/dashboard/schedule${query}`} className={inlineLink}>
              Lihat jadwal pakan
            </Link>
            {isAdmin ? (
              <div className="mt-auto">
                <ActuatorToggle
                  deviceId={device.id}
                  actuator="auto"
                  label="mode otomatis"
                  on={device.auto}
                />
              </div>
            ) : null}
          </article>
        </div>
      </section>

      <section aria-labelledby="riwayat-perintah" className="space-y-4">
        <div className="space-y-1">
          <h2 id="riwayat-perintah" className={heading({ level: "panel", tone: "ink" })}>
            Riwayat perintah
          </h2>
          <p className="text-sm text-muted">
            Antre: menunggu diambil. Terkirim: sudah diambil simulator. Berhasil atau Gagal: jawaban
            simulator. Tanpa balasan: tidak ada jawaban sebelum batas waktu.
          </p>
        </div>
        {commands.length === 0 ? (
          <p className={`${panel()} text-sm text-muted`}>
            Belum ada perintah untuk perangkat ini.
            {isAdmin ? " Perintah yang Anda kirim di atas akan muncul di sini." : ""}
          </p>
        ) : (
          <CommandTable commands={commands} />
        )}
        {device.last_seen ? (
          <p className="text-xs text-muted">
            Perangkat terakhir terlihat {formatDateTime(device.last_seen)}.
          </p>
        ) : null}
      </section>
    </div>
  )
}
