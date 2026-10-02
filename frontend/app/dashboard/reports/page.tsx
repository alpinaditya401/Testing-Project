import { NoDevice } from "@/components/dashboard/no-device"
import { ExportLinks } from "@/components/reports/export-links"
import { ObservationForm } from "@/components/reports/observation-form"
import { ObservationList } from "@/components/reports/observation-list"
import { ReportFilter } from "@/components/reports/report-filter"
import { ReportSummary } from "@/components/reports/report-summary"
import { ReportTable } from "@/components/reports/report-table"
import { heading, panel } from "@/components/ui/styles"
import { DevicesResponse, ObservationsResponse, Report, ReportQuery } from "@/lib/api/schemas"
import { requireSession, serverRequest } from "@/lib/api/server"
import { pickDevice } from "@/lib/devices"
import { fieldErrors } from "@/lib/form"

export const metadata = { title: "Laporan | AquaSmart" }

// ReportQuery only says which field is malformed; these sentences say what to do
// about it, because the zod messages read like developer output.
const FILTER_PROBLEM: Record<string, string> = {
  device_id: "Perangkat pada tautan tidak terbaca. Pilih perangkat dari daftar.",
  date: "Tanggal harus lengkap dengan format YYYY-MM-DD, misalnya 2026-09-20.",
  period: "Periode harus day, week, atau month.",
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ device_id?: string; date?: string; period?: string }>
}) {
  const session = await requireSession()
  const isAdmin = session.user.role === "admin"
  const [{ devices }, params] = await Promise.all([
    serverRequest("/api/devices", DevicesResponse),
    searchParams,
  ])
  const fallback = pickDevice(devices)
  if (!fallback) return <NoDevice isAdmin={isAdmin} />

  // Periods are UTC on the server side, so the default date is today in UTC as well.
  const today = new Date().toISOString().slice(0, 10)
  const requested = {
    device_id: params.device_id ?? fallback.id,
    date: params.date ?? today,
    period: params.period ?? "day",
  }
  const parsed = ReportQuery.safeParse(requested)
  const device = devices.find((candidate) => candidate.id === requested.device_id)

  const problems: string[] = []
  if (!parsed.success) {
    for (const field of Object.keys(fieldErrors(parsed.error))) {
      problems.push(FILTER_PROBLEM[field] ?? "Ada isian filter yang tidak dikenali.")
    }
  } else if (!device) {
    problems.push("Perangkat itu tidak ada di ruang budidaya ini. Pilih perangkat dari daftar.")
  }

  // A rejected filter is never sent to the API: the page says what is wrong instead.
  const loaded =
    parsed.success && device
      ? await Promise.all([
          serverRequest(`/api/reports?${new URLSearchParams(parsed.data).toString()}`, Report),
          serverRequest("/api/growth-observations", ObservationsResponse),
        ])
      : null
  const report = loaded?.[0]
  const observations =
    loaded?.[1].observations.filter((item) => item.device_id === requested.device_id) ?? []

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm text-muted">{device ? device.location : "Perangkat belum dipilih"}</p>
        <h1 className={heading()}>Laporan{device ? `: ${device.name}` : ""}</h1>
        <p className="text-sm text-ink">
          Periode dihitung dalam UTC dan minggu dimulai hari Senin. Filter ikut tersimpan di alamat
          halaman, jadi laporan ini bisa ditandai dan dibuka lagi.
        </p>
      </header>

      <section aria-labelledby="filter-laporan" className={`${panel()} space-y-4`}>
        <h2 id="filter-laporan" className={heading({ level: "panel", tone: "ink" })}>
          Pilih laporan
        </h2>
        <ReportFilter devices={devices} value={requested} />
        {problems.length > 0 ? (
          <p
            role="alert"
            className="rounded-crisp border border-alarm-coral-text p-3 text-sm text-alarm-coral-text"
          >
            Laporan belum dimuat. {problems.join(" ")}
          </p>
        ) : null}
      </section>

      {report && device ? (
        <>
          <section aria-labelledby="ringkasan-laporan" className="space-y-4">
            <h2 id="ringkasan-laporan" className={heading({ level: "panel", tone: "ink" })}>
              Ringkasan periode
            </h2>
            <ReportSummary report={report} />
          </section>

          {report.groups.length > 0 ? (
            <section aria-labelledby="rekap-harian" className="space-y-4">
              <h2 id="rekap-harian" className={heading({ level: "panel", tone: "ink" })}>
                Rekap per hari
              </h2>
              <ReportTable groups={report.groups} />
            </section>
          ) : null}

          <section aria-labelledby="unduh-data" className="space-y-4">
            <h2 id="unduh-data" className={heading({ level: "panel", tone: "ink" })}>
              Unduh data
            </h2>
            <ExportLinks
              query={{
                device_id: report.device_id,
                date: report.date,
                period: report.period,
              }}
            />
          </section>

          <section aria-labelledby="observasi" className="space-y-4">
            <div className="space-y-1">
              <h2 id="observasi" className={heading({ level: "panel", tone: "ink" })}>
                Observasi pertumbuhan
              </h2>
              <p className="text-sm text-ink">
                Observasi adalah catatan sampel yang ditimbang dan diukur orang, lalu diketik ke
                sistem. Angkanya bukan pembacaan sensor dan bukan prediksi pertumbuhan. Daftar ini
                memuat observasi perangkat terpilih dari 200 catatan terakhir ruang budidaya, dan
                tidak mengikuti tanggal maupun periode filter di atas.
              </p>
            </div>

            <ObservationList observations={observations} isAdmin={isAdmin} />

            {isAdmin ? (
              <div className={`${panel()} space-y-4`}>
                <h3 className={heading({ level: "sub", tone: "ink" })}>Catat observasi baru</h3>
                <p className="text-sm text-muted">
                  Catatan ini tersimpan untuk perangkat {device.name}.
                </p>
                <ObservationForm deviceId={device.id} today={today} />
              </div>
            ) : (
              <p className={`${panel()} text-sm text-ink`}>
                Akun viewer hanya bisa membaca observasi. Mencatat dan menghapus observasi hanya
                bisa dilakukan admin ruang budidaya.
              </p>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
