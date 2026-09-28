import { heading, panel } from "@/components/ui/styles"
import type { TelemetryRecord } from "@/lib/api/schemas"
import { formatDateTime, formatNumber } from "@/lib/format"

// TDS and water level have no configured limits, so these cards carry no ok/danger
// colour: a colour would claim a judgement the backend never made.
export function TelemetryPanel({ record }: { record: TelemetryRecord | null }) {
  return (
    <section aria-labelledby="telemetri" className="space-y-4">
      <h2 id="telemetri" className={heading({ level: "panel", tone: "ink" })}>
        Sensor tambahan dari perangkat
      </h2>
      {!record ? (
        <p className={`${panel()} text-sm text-muted`}>
          Belum ada telemetri dari perangkat ini. Angka muncul setelah ESP32 tersambung ke WiFi dan
          mengirim data.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <RawReading
              id="telemetri-tds"
              label="TDS"
              value={record.tds_ppm_estimate}
              decimals={0}
              unit="ppm"
              note="Estimasi, belum terkalibrasi"
              detail={
                record.tds_mv === null
                  ? null
                  : `${formatNumber(record.tds_mv, 0)} mV terbaca di pin sensor`
              }
            />
            <RawReading
              id="telemetri-level"
              label="Level air"
              value={record.water_level_percent}
              decimals={0}
              unit="%"
              note="Dihitung dari jarak sensor ultrasonik"
              detail={
                record.water_distance_cm === null || record.tank_height_cm === null
                  ? null
                  : `Permukaan ${formatNumber(record.water_distance_cm, 1)} cm di bawah sensor, tinggi tandon ${formatNumber(record.tank_height_cm, 0)} cm`
              }
            />
          </div>
          <p className="text-xs text-muted">
            Data mentah terakhir diterima {formatDateTime(record.received_at)}. TDS memakai kurva
            pabrik sensor pada suhu 25°C. Level bergantung pada tinggi tandon di konfigurasi
            perangkat. Keduanya belum dipakai untuk menilai batas kualitas air.
          </p>
        </>
      )}
    </section>
  )
}

function RawReading({
  id,
  label,
  value,
  decimals,
  unit,
  note,
  detail,
}: {
  id: string
  label: string
  value: number | null
  decimals: number
  unit: string
  note: string
  detail: string | null
}) {
  return (
    <article
      aria-labelledby={id}
      className="sensor-card rounded-panel border border-foam-line bg-surface-white p-5"
    >
      <h3 id={id} className="text-sm font-semibold text-ink">
        {label}
      </h3>
      {value === null ? (
        <p className="mt-3 text-lg text-muted">Belum ada data</p>
      ) : (
        <p className="mt-3 font-data text-4xl text-deep-current">
          {formatNumber(value, decimals)}
          <span className="ml-1.5 text-base text-muted">{unit}</span>
        </p>
      )}
      <p className="mt-2 text-sm font-semibold text-muted">{note}</p>
      {detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}
    </article>
  )
}
