import { AutoRefresh } from "@/components/auto-refresh"
import { NoDevice } from "@/components/dashboard/no-device"
import { ParameterCard } from "@/components/dashboard/parameter-card"
import { ReadingsTable } from "@/components/dashboard/readings-table"
import { TelemetryPanel } from "@/components/dashboard/telemetry-panel"
import { DevicePicker } from "@/components/device-picker"
import { WaterChart } from "@/components/studio/water-chart"
import { heading, panel } from "@/components/ui/styles"
import {
  DevicesResponse,
  ReadingsResponse,
  TelemetryResponse,
  ThresholdsResponse,
} from "@/lib/api/schemas"
import { requireSession, serverRequest } from "@/lib/api/server"
import { pickDevice } from "@/lib/devices"
import { formatDateTime, provenanceLabel } from "@/lib/format"
import { PARAMETERS, withinLimits } from "@/lib/water-quality"

export const metadata = { title: "Kualitas Air | AquaSmart" }

// The screen answers one question for a fish farmer: is the water in this pond safe
// right now. The summary sentence comes first, then the three contract parameters,
// then what to do, then the device's extra raw sensors, then the history that explains it.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ device?: string }>
}) {
  const session = await requireSession("/dashboard")
  const [{ devices }, { thresholds }] = await Promise.all([
    serverRequest("/api/devices", DevicesResponse),
    serverRequest("/api/settings/thresholds", ThresholdsResponse),
  ])
  const device = pickDevice(devices, (await searchParams).device)
  if (!device) return <NoDevice isAdmin={session.user.role === "admin"} />

  const [{ readings }, { telemetry }] = await Promise.all([
    serverRequest(
      `/api/devices/${encodeURIComponent(device.id)}/readings?limit=18`,
      ReadingsResponse,
    ),
    serverRequest(`/api/devices/${encodeURIComponent(device.id)}/telemetry`, TelemetryResponse),
  ])
  const latest = device.latest_reading
  const outOfRange = latest
    ? PARAMETERS.filter((p) => !withinLimits(p.key, latest[p.key], thresholds))
    : []

  return (
    <div className="space-y-8">
      <AutoRefresh seconds={30} />

      <header className="dashboard-page-heading space-y-3">
        <p className="text-sm text-muted">{device.location}</p>
        <h1 className={heading()}>Kualitas Air: {device.name}</h1>
        <p className="text-sm text-ink">
          {device.online ? "Perangkat online" : "Perangkat offline"}
          {device.last_seen
            ? `, terakhir terlihat ${formatDateTime(device.last_seen)}`
            : ", belum pernah terhubung"}
          . Halaman diperbarui otomatis setiap 30 detik.
        </p>
        <DevicePicker devices={devices} selectedId={device.id} basePath="/dashboard" />
      </header>

      <section aria-labelledby="ringkasan" className={panel()}>
        <h2 id="ringkasan" className="sr-only">
          Ringkasan status air
        </h2>
        {!latest ? (
          <p className="text-ink">Belum ada pembacaan. Status kualitas air belum dapat dinilai.</p>
        ) : outOfRange.length === 0 ? (
          <p className="font-semibold text-clear-water-text">
            Semua parameter dalam batas yang dikonfigurasi.
          </p>
        ) : (
          <p className="font-semibold text-alarm-coral-text">
            Di luar batas: {outOfRange.map((p) => p.label).join(", ")}. Periksa pembacaan dan ambang
            yang dikonfigurasi.
          </p>
        )}
        {latest ? (
          <p className="mt-2 text-sm text-muted">
            Pembacaan terakhir {formatDateTime(latest.created_at)}. Sumber:{" "}
            {provenanceLabel(latest.provenance)}.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="parameter" className="space-y-4">
        <h2 id="parameter" className={heading({ level: "panel", tone: "ink" })}>
          Tiga parameter kualitas air
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PARAMETERS.map((p) => (
            <ParameterCard
              key={p.key}
              parameterKey={p.key}
              reading={latest}
              thresholds={thresholds}
            />
          ))}
        </div>
        <p className="text-xs text-muted">
          Label DEVICE adalah deklarasi pengirim, bukan bukti kalibrasi sensor. Nilai belum
          terkalibrasi.
        </p>
      </section>

      {outOfRange.length > 0 ? (
        <section aria-labelledby="saran" className={panel()}>
          <h2 id="saran" className={heading({ level: "panel", tone: "ink" })}>
            Yang perlu diperiksa
          </h2>
          <ul className="mt-3 space-y-3">
            {outOfRange.map((p) => (
              <li key={p.key}>
                <p className="font-semibold text-alarm-coral-text">{p.label} di luar batas</p>
                <p className="text-sm text-ink">{p.advice}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <TelemetryPanel record={telemetry[0] ?? null} />

      <section className="live-chart-panel" aria-labelledby="grafik-ph">
        <div className="preview-header">
          <div>
            <span className="eyebrow">Perjalanan kualitas air</span>
            <h2 id="grafik-ph">Tren pH kolam</h2>
          </div>
          <span className="demo-label">{readings.length} pembacaan terbaru</span>
        </div>
        <WaterChart values={readings.map((reading) => reading.ph)} />
        <p className="text-xs text-muted">
          Urutan waktu dari kiri ke kanan. Grafik mengikuti data perangkat terpilih; jarak
          antartitik tidak mewakili selang waktu.
        </p>
      </section>

      <section aria-labelledby="riwayat" className="space-y-4">
        <h2 id="riwayat" className={heading({ level: "panel", tone: "ink" })}>
          Riwayat pembacaan terbaru
        </h2>
        {readings.length === 0 ? (
          <p className={`${panel()} text-sm text-muted`}>
            Belum ada pembacaan untuk perangkat ini. Riwayat muncul setelah perangkat mengirim data.
          </p>
        ) : (
          <ReadingsTable readings={readings} />
        )}
      </section>
    </div>
  )
}
