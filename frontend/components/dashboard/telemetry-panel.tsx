"use client"

import { useQuery } from "@tanstack/react-query"
import { heading, panel } from "@/components/ui/styles"
import { apiRequest, devicePath } from "@/lib/api/client"
import { type TelemetryRecord, TelemetryResponse } from "@/lib/api/schemas"
import { formatDateTime, formatNumber } from "@/lib/format"
import { assessTelemetry } from "@/lib/telemetry-validity"

// Raw telemetry is displayed without claiming calibrated water-quality limits.
export function TelemetryPanel({
  deviceId,
  record: initialRecord,
}: {
  deviceId: string
  record: TelemetryRecord | null
}) {
  const { data, isError, dataUpdatedAt } = useQuery({
    queryKey: ["telemetry-live", deviceId],
    queryFn: ({ signal }) =>
      apiRequest(devicePath(deviceId, "/telemetry?limit=1"), TelemetryResponse, { signal }),
    initialData: { telemetry: initialRecord ? [initialRecord] : [], notice: "" },
    staleTime: 0,
    refetchInterval: 1000,
    refetchOnWindowFocus: true,
  })
  const record = data.telemetry[0] ?? null
  const assessment = record ? assessTelemetry(record, Math.max(Date.now(), dataUpdatedAt)) : null
  return (
    <section aria-labelledby="telemetri" className="space-y-4">
      <h2 id="telemetri" className={heading({ level: "panel", tone: "ink" })}>
        Pembacaan langsung ESP32
      </h2>
      <p className="text-sm text-muted">
        Pembacaan terbaru diperiksa setiap 1 detik saat tab ini aktif.
      </p>
      {isError ? (
        <p role="status" className={`${panel()} text-sm text-alarm-coral-text`}>
          Pembaruan sensor gagal. Pembacaan terakhir tetap ditampilkan; koneksi akan dicoba kembali.
        </p>
      ) : null}
      {!record ? (
        <p className={`${panel()} text-sm text-muted`}>
          Belum ada telemetri dari perangkat ini. Angka muncul setelah ESP32 tersambung ke WiFi dan
          mengirim data.
        </p>
      ) : assessment ? (
        <>
          <p role="status" className={`${panel()} text-sm text-sediment-text`}>
            {assessment.message}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <RawReading
              id="telemetri-suhu"
              label="Suhu air"
              value={assessment.temperature}
              emptyLabel={
                record.temperature_status === "ok" ? assessment.blocked : "Sensor tidak terbaca"
              }
              decimals={1}
              unit="°C"
              note={
                assessment.immersed && record.temperature_status === "ok"
                  ? "Terbaca dari DS18B20, belum terkalibrasi"
                  : record.temperature_status === "ok"
                    ? "DS18B20 juga membaca suhu udara. Suhu air belum dapat dipastikan."
                    : "Sensor belum berhasil dibaca"
              }
              detail={
                record.temperature_status === "disconnected"
                  ? "Periksa kabel DATA, daya, dan resistor pull-up sensor"
                  : null
              }
            />
            <RawReading
              id="telemetri-kekeruhan"
              label="Kekeruhan mentah"
              value={assessment.turbidity}
              emptyLabel={assessment.blocked}
              decimals={1}
              unit="%"
              note={
                assessment.immersed
                  ? "Pemetaan tegangan, bukan NTU terkalibrasi"
                  : assessment.reason
              }
              detail={null}
            />
            <RawReading
              id="telemetri-tds"
              label="TDS"
              value={assessment.tds}
              emptyLabel={assessment.tdsStatus}
              decimals={0}
              unit="ppm"
              note={assessment.tdsNote}
              detail={null}
            />
            <RawReading
              id="telemetri-level"
              label="Level air"
              value={assessment.level}
              emptyLabel={assessment.blocked}
              decimals={0}
              unit="%"
              note={
                assessment.water === "present" || assessment.water === "empty"
                  ? "Estimasi level dari HY-SRF05, referensi wadah dikonfirmasi"
                  : assessment.message
              }
              detail={null}
            />
          </div>
          <p className="text-xs text-muted">
            Data terakhir diterima {formatDateTime(record.received_at)}. TDS memakai kurva pabrik
            sensor pada suhu 25°C. Level bergantung pada tinggi tandon di konfigurasi perangkat.
            Data mentah ini belum dipakai untuk menilai seluruh batas kualitas air. pH air belum
            tersedia dari konfigurasi sensor ini.
          </p>
          <details className={`${panel()} text-sm`}>
            <summary className="min-h-11 cursor-pointer font-semibold text-ink">
              Lihat data mentah untuk pemeriksaan
            </summary>
            <p className="my-3 text-muted">
              Angka berikut adalah sinyal sensor, bukan bukti ada air atau hasil pengukuran air yang
              valid.
            </p>
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ["Suhu sensor (bisa suhu udara)", record.temperature, "°C"],
                ["Tegangan TDS", record.tds_mv, "mV"],
                ["Tegangan kekeruhan", record.turbidity_mv, "mV"],
                ["Pemetaan kekeruhan", record.turbidity_mapping_percent, "%"],
                ["Jarak pantulan HY-SRF05", record.water_distance_cm, "cm"],
                ["Referensi tinggi wadah", record.tank_height_cm, "cm"],
              ].map(([label, value, unit]) => (
                <div key={String(label)}>
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-data text-ink">
                    {typeof value === "number"
                      ? `${formatNumber(value, 1)} ${unit}`
                      : "Tidak terbaca"}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </>
      ) : null}
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
  emptyLabel = "Belum ada data",
}: {
  id: string
  label: string
  value: number | null
  decimals: number
  unit: string
  note: string
  detail: string | null
  emptyLabel?: string
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
        <p className="mt-3 text-lg text-muted">{emptyLabel}</p>
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
