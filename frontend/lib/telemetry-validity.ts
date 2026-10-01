import type { TelemetryRecord } from "./api/schemas"

export type WaterState = "unknown" | "invalid" | "empty" | "present" | "stale"

export function assessTelemetry(record: TelemetryRecord, now: number) {
  const age = now - Date.parse(record.received_at)
  let water: WaterState = "unknown"
  let message = "Keberadaan air belum terverifikasi. Referensi tinggi wadah belum dikonfirmasi."
  const distance = record.water_distance_cm
  const height = record.tank_height_cm
  if (!Number.isFinite(age) || age > 10_000 || age < -5_000) {
    water = "stale"
    message =
      "Data sensor sudah lama atau waktu tidak sesuai. Kondisi air saat ini belum diketahui."
  } else if (distance === null || height === null) {
    message = "Keberadaan air belum terverifikasi. Sensor level belum menghasilkan jarak."
  } else if (
    distance < 2 ||
    distance > 450 ||
    height < 2 ||
    height > 450 ||
    distance > height + 1
  ) {
    water = "invalid"
    message = "Pembacaan level belum valid. Periksa arah sensor, pantulan, dan tinggi wadah."
  } else if (record.water_level_reference_confirmed) {
    // HY-SRF05: 2–450 cm. Bottom tolerance is 1 cm; shallow water is labelled explicitly.
    water = distance >= height - 1 ? "empty" : "present"
    message =
      water === "empty"
        ? "Tidak ada air terukur atau air sangat dangkal (kedalaman paling banyak 1 cm)."
        : "Air terindikasi dari jarak ultrasonik dengan referensi wadah yang dikonfirmasi."
  }
  const immersed = water === "present" && record.water_probes_immersed === true
  const blocked =
    water === "stale"
      ? "Data sudah lama"
      : water === "empty"
        ? "Tidak ada air terukur"
        : "Belum valid"
  const reason =
    water === "present" && !immersed ? "Posisi probe terendam belum dikonfirmasi." : message
  const tdsInRange =
    record.tds_mv !== null &&
    record.tds_mv >= 0 &&
    record.tds_mv <= 2300 &&
    record.tds_ppm_estimate !== null &&
    record.tds_ppm_estimate >= 0 &&
    record.tds_ppm_estimate <= 1000
  const tdsStatus = !immersed
    ? blocked
    : !tdsInRange
      ? "Sinyal belum valid"
      : !record.calibrated
        ? "Belum terkalibrasi"
        : "Terbaca"
  return {
    water,
    message,
    immersed,
    blocked,
    reason,
    temperature: immersed && record.temperature_status === "ok" ? record.temperature : null,
    tds: immersed && tdsInRange && record.calibrated ? record.tds_ppm_estimate : null,
    tdsStatus,
    turbidity: immersed ? record.turbidity_mapping_percent : null,
    level: water === "present" || water === "empty" ? record.water_level_percent : null,
    tdsNote: !immersed
      ? reason
      : !tdsInRange
        ? "Sinyal tidak tersedia atau di luar rentang SEN0244 (0–2300 mV, 0–1000 ppm)."
        : !record.calibrated
          ? "Angka ppm disembunyikan sampai sensor dikalibrasi dengan larutan referensi."
          : "TDS dari sensor terkalibrasi",
  }
}
