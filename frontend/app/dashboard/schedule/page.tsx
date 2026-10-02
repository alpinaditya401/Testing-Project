import Link from "next/link"
import { SimulationNotice } from "@/components/control/simulation-notice"
import { NoDevice } from "@/components/dashboard/no-device"
import { DevicePicker } from "@/components/device-picker"
import { DeleteScheduleButton } from "@/components/schedule/delete-schedule-button"
import { ScheduleForm } from "@/components/schedule/schedule-form"
import { heading, inlineLink, panel } from "@/components/ui/styles"
import { DevicesResponse, SchedulesResponse } from "@/lib/api/schemas"
import { requireSession, serverRequest } from "@/lib/api/server"
import { pickDevice } from "@/lib/devices"

export const metadata = { title: "Jadwal Pakan | AquaSmart" }

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ device?: string }>
}) {
  const session = await requireSession()
  const isAdmin = session.user.role === "admin"
  const { devices } = await serverRequest("/api/devices", DevicesResponse)
  const device = pickDevice(devices, (await searchParams).device)
  if (!device) return <NoDevice isAdmin={isAdmin} />

  const { schedules } = await serverRequest(
    `/api/devices/${encodeURIComponent(device.id)}/schedules`,
    SchedulesResponse,
  )
  const query = `?device=${encodeURIComponent(device.id)}`

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm text-muted">{device.location}</p>
        <h1 className={heading()}>Jadwal Pakan: {device.name}</h1>
        <p className="text-sm text-ink">
          Jam dalam WIB. Hasil setiap jadwal tercatat di riwayat perintah halaman Kontrol.
        </p>
        <DevicePicker devices={devices} selectedId={device.id} basePath="/dashboard/schedule" />
      </header>

      <SimulationNotice />

      <section aria-labelledby="mode" className={panel()}>
        <h2 id="mode" className={heading({ level: "sub", tone: "ink" })}>
          Mode otomatis {device.auto ? "menyala" : "mati"}
        </h2>
        <p className="mt-1 text-sm text-ink">
          {device.auto
            ? "Jadwal aktif di bawah dijalankan scheduler simulator pada jamnya."
            : "Jadwal tetap tersimpan, tetapi tidak dijalankan sampai Mode otomatis dinyalakan."}
        </p>
        <Link href={`/dashboard/control${query}`} className={`mt-2 ${inlineLink}`}>
          {device.auto ? "Buka halaman Kontrol" : "Nyalakan di halaman Kontrol"}
        </Link>
      </section>

      <section aria-labelledby="daftar-jadwal" className="space-y-4">
        <h2 id="daftar-jadwal" className={heading({ level: "panel", tone: "ink" })}>
          Jadwal tersimpan
        </h2>
        {schedules.length === 0 ? (
          <p className={`${panel()} text-sm text-muted`}>
            Belum ada jadwal pakan untuk perangkat ini.
            {isAdmin ? " Tambahkan jadwal pertama dengan formulir di bawah." : ""}
          </p>
        ) : (
          <ul className="divide-y divide-foam-line rounded-panel border border-foam-line bg-surface-white">
            {schedules.map((schedule) => (
              <li
                key={schedule.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6"
              >
                <div>
                  <p className="font-data text-lg font-semibold text-ink">{schedule.time} WIB</p>
                  <p className="text-sm text-muted">
                    {schedule.days}, pakan {schedule.duration} detik
                    {schedule.active ? "" : ", nonaktif"}
                  </p>
                </div>
                {isAdmin ? (
                  <DeleteScheduleButton
                    deviceId={device.id}
                    scheduleId={schedule.id}
                    time={schedule.time}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin ? (
        <section aria-labelledby="tambah-jadwal" className={`${panel()} space-y-4`}>
          <h2 id="tambah-jadwal" className={heading({ level: "panel", tone: "ink" })}>
            Tambah jadwal
          </h2>
          <ScheduleForm deviceId={device.id} />
        </section>
      ) : (
        <p className={`${panel()} text-sm text-ink`}>
          Akun viewer hanya bisa melihat jadwal. Jadwal hanya bisa diubah admin ruang budidaya.
        </p>
      )}
    </div>
  )
}
