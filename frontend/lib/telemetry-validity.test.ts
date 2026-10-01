import assert from "node:assert/strict"
import { test } from "node:test"
import type { TelemetryRecord } from "./api/schemas.ts"
import { assessTelemetry } from "./telemetry-validity.ts"

const now = Date.parse("2026-09-30T10:00:00Z")
const record: TelemetryRecord = {
  created_at: "2026-09-30T10:00:00Z",
  received_at: "2026-09-30T10:00:00Z",
  provenance: "device",
  simulation: false,
  source_session: "esp32-validity-test",
  temperature: 27,
  temperature_status: "ok",
  turbidity_adc: 1000,
  turbidity_mv: 1000,
  turbidity_sensor_mv: 1000,
  turbidity_mapping_percent: 70,
  soil_ph_adc: null,
  soil_ph_mv: null,
  tds_adc: 1000,
  tds_mv: 1200,
  tds_ppm_estimate: 445.5,
  water_distance_cm: 20,
  tank_height_cm: 50,
  water_level_percent: 60,
  ph_sensor: "soil_placeholder",
  calibrated: false,
}

test("existing firmware cannot claim water presence from numeric readings alone", () => {
  const result = assessTelemetry(record, now)
  assert.equal(result.water, "unknown")
  for (const key of ["temperature", "tds", "turbidity", "level"] as const)
    assert.equal(result[key], null)
})

test("0.9 cm echo never becomes a displayed 98 percent water level", () => {
  const result = assessTelemetry(
    {
      ...record,
      water_distance_cm: 0.9,
      water_level_percent: 98.2,
      water_level_reference_confirmed: true,
      water_probes_immersed: true,
    },
    now,
  )
  assert.equal(result.water, "invalid")
  assert.equal(result.level, null)
  assert.equal(result.tds, null)
})

test("empty or shallow pond suppresses water-probe values even if sensors still send numbers", () => {
  const result = assessTelemetry(
    {
      ...record,
      water_distance_cm: 50,
      water_level_percent: 0,
      water_level_reference_confirmed: true,
      water_probes_immersed: true,
    },
    now,
  )
  assert.equal(result.water, "empty")
  assert.equal(result.level, 0)
  assert.equal(result.temperature, null)
  assert.equal(result.tds, null)
  assert.equal(result.turbidity, null)
})

test("confirming water level alone cannot turn ambient temperature into water temperature", () => {
  const result = assessTelemetry({ ...record, water_level_reference_confirmed: true }, now)
  assert.equal(result.water, "present")
  assert.equal(result.level, 60)
  assert.equal(result.temperature, null)
  assert.equal(result.tds, null)
})

test("confirmed water and immersed probes still hide uncalibrated TDS", () => {
  const result = assessTelemetry(
    { ...record, water_level_reference_confirmed: true, water_probes_immersed: true },
    now,
  )
  assert.equal(result.temperature, 27)
  assert.equal(result.tds, null)
  assert.equal(result.tdsStatus, "Belum terkalibrasi")
  assert.equal(result.turbidity, 70)
})

test("out-of-range TDS is hidden while its raw diagnostic voltage is preserved", () => {
  const input = {
    ...record,
    tds_mv: 3134,
    tds_ppm_estimate: 2140.5,
    water_level_reference_confirmed: true,
    water_probes_immersed: true,
  }
  assert.equal(assessTelemetry(input, now).tds, null)
  assert.equal(assessTelemetry(input, now).tdsStatus, "Sinyal belum valid")
  assert.equal(input.tds_mv, 3134)
})

test("stale telemetry and missing or impossible echoes never claim current water presence", () => {
  assert.equal(assessTelemetry(record, now + 11_000).water, "stale")
  assert.equal(assessTelemetry(record, now - 6_000).water, "stale")
  assert.equal(assessTelemetry({ ...record, water_distance_cm: null }, now).water, "unknown")
  assert.equal(assessTelemetry({ ...record, water_distance_cm: 80 }, now).water, "invalid")
  assert.equal(assessTelemetry({ ...record, water_distance_cm: 451 }, now).level, null)
})
