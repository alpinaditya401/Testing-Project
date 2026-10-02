import { z } from "zod"

// Safety net so no validation message reaches a user in English. Form-facing
// schemas below still carry their own plain-language messages, because the
// locale's defaults read like developer output ("harus sesuai pola /regex/").
z.config(z.locales.id())

// Contract for every browser endpoint in server/API.md.
//
// Each schema was written from API.md, then checked against responses captured from
// the PHP backend on a seeded throwaway database (fixtures.json, schemas.test.ts).
// Where the prose and the running server disagreed, the server won and the
// difference is noted next to the field. Enum members come from CHECK constraints
// and validators in server/src, not from whichever values the seed happened to emit.
//
// z.object strips unknown keys instead of rejecting them, so a field added on the
// backend cannot take the UI down. A missing or mistyped field still fails loudly;
// schemas.test.ts also fails when a captured response carries a key that the
// schema would silently drop.
//
// Device-only endpoints (heartbeat, reading and telemetry ingestion, simulator and
// device command queues) are not here: they authenticate with X-Device-Key and are
// never called from the browser. POST /api/devices/{id}/hardware-commands is left
// out as well, because it answers 503 unless AQUASMART_HARDWARE_ENABLED=1 and its
// success shape could not be captured.

/* Primitives */

export const Provenance = z.enum(["simulation", "device", "manual", "seed", "legacy_unverified"])

const UtcSeconds = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
// Growth observations and invitations are stamped with gmdate('c'), which ends in
// +00:00 rather than Z.
const AtomTimestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/)
// Command timestamps are epoch seconds, unlike every other timestamp in the API.
const EpochSeconds = z.number().int().nonnegative()
const CalendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const ClockTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/)
const Id = z.number().int().positive()
const Count = z.number().int().nonnegative()

export const ApiErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
})

/* Public */

export const Health = z.object({ status: z.literal("ok"), service: z.string() })

export const Rules = z.object({
  version: z.string(),
  rule: z.object({ min: z.number(), max: z.number(), source_sha256: Sha256 }),
})

/* Auth and profile */

// users.role has no CHECK constraint; the code only ever writes these two values.
export const Role = z.enum(["admin", "viewer"])

export const User = z.object({
  id: Id,
  username: z.string(),
  contact: z.string().nullable(),
  name: z.string(),
  role: Role,
  phone: z.string(),
  workspace_owner_id: Id.nullable(),
})

// server/src/Auth.php sets the token to bin2hex(random_bytes(24)): 48 hex characters.
export const Session = z.object({ user: User, csrf_token: z.string().regex(/^[0-9a-f]{48}$/) })

export const LoggedOut = z.object({ logged_out: z.literal(true) })

// PATCH /api/profile answers with a narrower user: no contact, no workspace_owner_id.
export const ProfileUpdated = z.object({
  user: z.object({ id: Id, username: z.string(), name: z.string(), role: Role, phone: z.string() }),
})

/* Devices and readings */

const ReadingValues = {
  // Range enforced by CHECK (ph >= 0 AND ph <= 14) on sensor_readings.
  ph: z.number().min(0).max(14),
  temperature: z.number(),
  turbidity: z.number().nonnegative(),
  simulation: z.boolean(),
  provenance: Provenance,
  source_session: z.string().nullable(),
}

// The same moment is called created_at on /api/devices and time on /readings.
export const LatestReading = z.object({ ...ReadingValues, created_at: UtcSeconds })
export const Reading = z.object({ ...ReadingValues, time: UtcSeconds })

export const Device = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string(),
  online: z.boolean(),
  aerator: z.boolean(),
  feeder: z.boolean(),
  // Stored as auto_mode, serialised as auto.
  auto: z.boolean(),
  last_seen: UtcSeconds.nullable(),
  latest_reading: LatestReading.nullable(),
})

export const DevicesResponse = z.object({ devices: z.array(Device) })
export const ReadingsResponse = z.object({ readings: z.array(Reading) })

// POST /api/devices returns only the identity of the claimed device, not a full Device.
export const DeviceClaimed = z.object({
  device: z.object({ id: z.string(), name: z.string(), location: z.string() }),
})

export const DeviceUpdated = z.object({ updated: z.literal(true) })

// The key is shown exactly once; the server keeps only its SHA-256.
export const DeviceKeyIssued = z.object({
  device_id: z.string(),
  device_key: z.string().min(1),
  notice: z.string(),
})

/* Telemetry (diagnostic, raw) */

export const TelemetryRecord = z.object({
  created_at: UtcSeconds,
  received_at: UtcSeconds,
  // CHECK(provenance IN ('device','simulation')) on device_telemetry.
  provenance: z.enum(["device", "simulation"]),
  simulation: z.boolean(),
  source_session: z.string(),
  temperature: z.number().nullable(),
  temperature_status: z.enum(["ok", "disconnected", "unverified"]),
  turbidity_adc: z.number().int().nullable(),
  turbidity_mv: z.number().nullable(),
  turbidity_sensor_mv: z.number().nullable(),
  turbidity_mapping_percent: z.number().nullable(),
  soil_ph_adc: z.number().int().nullable(),
  soil_ph_mv: z.number().nullable(),
  // API.md: the pH input is a soil-sensor placeholder and is never calibrated.
  ph_sensor: z.literal("soil_placeholder"),
  calibrated: z.literal(false),
})

export const TelemetryResponse = z.object({
  telemetry: z.array(TelemetryRecord),
  notice: z.string(),
})

/* Schedules */

export const ScheduleDays = z.enum(["Setiap hari", "Senin - Jumat", "Akhir pekan"])

export const Schedule = z.object({
  id: Id,
  time: ClockTime,
  duration: z.number().int().min(1).max(30),
  days: ScheduleDays,
  active: z.boolean(),
  created_at: UtcSeconds,
})

export const SchedulesResponse = z.object({ schedules: z.array(Schedule) })
export const ScheduleCreated = z.object({ schedule: Schedule })
export const Deleted = z.object({ deleted: z.literal(true) })

/* Commands and control */

export const CommandStatus = z.enum(["pending", "delivered", "succeeded", "failed", "timeout"])
// "pump" is not controllable from this API, but OperationsRepository stores the
// product unit's pump commands in the same table, so they show up in history.
export const CommandActuator = z.enum(["feeder", "aerator", "pump"])

export const Command = z.object({
  id: z.string().regex(/^[0-9a-f]{32}$/),
  device_id: z.string(),
  user_id: Id,
  actuator: CommandActuator,
  value: z.boolean(),
  duration: z.number().int().nonnegative(),
  request_id: z.string(),
  status: CommandStatus,
  simulation: z.boolean(),
  created_at: EpochSeconds,
  expires_at: EpochSeconds,
  delivered_at: EpochSeconds.nullable(),
  completed_at: EpochSeconds.nullable(),
  provenance: Provenance,
  source_session: z.string().nullable(),
})

export const CommandsResponse = z.object({ commands: z.array(Command) })
export const FeedingLogsResponse = z.object({ feeding_logs: z.array(Command) })

// Switching auto mode changes device state without queueing a command, so command is null.
export const ControlResult = z.object({ device: Device, command: Command.nullable() })

/* Alerts and audit */

// CHECK (severity IN ("info", "warning", "critical")) on alerts. The seed only emits
// warning and critical, but the bootstrap seed in Database.php writes info.
export const Severity = z.enum(["info", "warning", "critical"])

export const Alert = z.object({
  id: Id,
  device_id: z.string(),
  severity: Severity,
  message: z.string(),
  // Display label from Provenance::label(), e.g. "SIMULASI" or "LEGACY / UNVERIFIED".
  source: z.string(),
  provenance: Provenance,
  source_session: z.string().nullable(),
  acknowledged: z.boolean(),
  created_at: UtcSeconds,
  acknowledged_at: UtcSeconds.nullable(),
})

export const AlertsResponse = z.object({ alerts: z.array(Alert), unacknowledged_count: Count })
export const AlertAcknowledged = z.object({ alert: Alert })

// PHP encodes an empty metadata array as [] rather than {}; normalise it to an object.
const AuditMetadata = z.union([
  z.record(z.string(), z.unknown()),
  z.tuple([]).transform((): Record<string, unknown> => ({})),
])

export const AuditLog = z.object({
  id: Id,
  device_id: z.string().nullable(),
  action: z.string(),
  provenance: Provenance,
  source_session: z.string().nullable(),
  metadata: AuditMetadata,
  created_at: UtcSeconds,
})

export const AuditLogsResponse = z.object({ audit_logs: z.array(AuditLog) })

/* Thresholds and rule versions */

// Ranges from the CHECK constraints on threshold_settings.
const PH_RANGE = "pH harus di antara 0 dan 14."

export const Thresholds = z.object({
  ph_min: z.number(PH_RANGE).min(0, PH_RANGE).max(14, PH_RANGE),
  ph_max: z.number(PH_RANGE).min(0, PH_RANGE).max(14, PH_RANGE),
  temperature_min: z.number("Isi suhu minimum dengan angka."),
  temperature_max: z.number("Isi suhu maksimum dengan angka."),
  turbidity_max: z
    .number("Isi kekeruhan maksimum dengan angka.")
    .positive("Kekeruhan maksimum harus lebih dari 0."),
})

export const ThresholdsResponse = z.object({ thresholds: Thresholds })

export const RuleVersion = z.object({
  id: Sha256,
  version: z.string(),
  created_at: UtcSeconds,
  reading_count: Count,
  config: Thresholds,
})

export const RuleVersionsResponse = z.object({ versions: z.array(RuleVersion), note: z.string() })

/* Growth observations */

export const Observation = z.object({
  id: Id,
  user_id: Id,
  device_id: z.string(),
  observed_at: CalendarDate,
  weight_g: z.number().positive().nullable(),
  length_cm: z.number().positive().nullable(),
  // notes is TEXT NOT NULL; an observation with measurements only stores "".
  notes: z.string(),
  created_at: AtomTimestamp,
  provenance: Provenance,
  source_session: z.string().nullable(),
})

export const ObservationsResponse = z.object({ observations: z.array(Observation) })
export const ObservationCreated = z.object({ observation: Observation })

/* Workspace and invitations */

export const InvitationCreated = z.object({
  invitation: z.object({
    id: Id,
    contact: z.string(),
    // Shown once; API.md: 64 hex, expires after 24 hours.
    token: z.string().regex(/^[0-9a-f]{64}$/),
    expires_at: AtomTimestamp,
  }),
})

export const InvitationAccepted = z.object({ user: User })

export const Workspace = z.object({
  owner_id: Id,
  members: z.array(z.object({ id: Id, name: z.string(), role: Role })),
})

export const MemberRevoked = z.object({ revoked: z.literal(true) })

/* Reports and export */

export const ReportPeriod = z.enum(["day", "week", "month"])

const SourceCounts = z.object({
  simulation: Count,
  device: Count,
  manual: Count,
  seed: Count,
  legacy_unverified: Count,
})

export const ReportGroup = z.object({
  day: CalendarDate,
  cnt: Count,
  ph_avg: z.number(),
  temperature_avg: z.number(),
  turbidity_avg: z.number(),
  simulation_samples: Count,
  non_simulation_samples: Count,
  source_simulation: Count,
  source_device: Count,
  source_manual: Count,
  source_seed: Count,
  source_legacy_unverified: Count,
})

const Window = {
  period: ReportPeriod,
  date: CalendarDate,
  // Reports and export are always computed in UTC (hard-coded in both repositories).
  timezone: z.literal("UTC"),
  start_at: UtcSeconds,
  end_at_exclusive: UtcSeconds,
}

export const Report = z.object({
  device_id: z.string(),
  ...Window,
  groups: z.array(ReportGroup),
  total_samples: Count,
  source_counts: SourceCounts,
  simulation_samples: Count,
  non_simulation_samples: Count,
})

export const ExportKind = z.enum([
  "readings",
  "alerts",
  "commands",
  "feeding_logs",
  "reports",
  "telemetry",
])
export const ExportFormat = z.enum(["json", "csv"])

// Export rows are a flatter projection than the list endpoints: booleans that the
// list endpoints cast (alert acknowledged, command value) arrive here as 0 or 1.
const Bit = z.union([z.literal(0), z.literal(1)])

const ExportReadingRow = z.object({
  id: Id,
  device_id: z.string(),
  created_at: UtcSeconds,
  ph: z.number().min(0).max(14),
  temperature: z.number(),
  turbidity: z.number().nonnegative(),
  simulation: z.boolean(),
  provenance: Provenance,
  source_session: z.string().nullable(),
})

const ExportAlertRow = z.object({
  id: Id,
  device_id: z.string(),
  created_at: UtcSeconds,
  severity: Severity,
  message: z.string(),
  acknowledged: Bit,
  acknowledged_at: UtcSeconds.nullable(),
  provenance: Provenance,
  source_session: z.string().nullable(),
  source: z.string(),
})

const ExportCommandRow = z.object({
  id: z.string().regex(/^[0-9a-f]{32}$/),
  device_id: z.string(),
  created_at: EpochSeconds,
  actuator: CommandActuator,
  value: Bit,
  duration: z.number().int().nonnegative(),
  status: CommandStatus,
  simulation: z.boolean(),
  completed_at: EpochSeconds.nullable(),
  provenance: Provenance,
  source_session: z.string().nullable(),
})

function exportOf<K extends z.infer<typeof ExportKind>, R extends z.ZodType>(kind: K, row: R) {
  return z.object({
    meta: z.object({
      device_id: z.string(),
      kind: z.literal(kind),
      ...Window,
      // API.md: every JSON export carries hardware_verified = false.
      hardware_verified: z.literal(false),
      source_counts: SourceCounts,
    }),
    rows: z.array(row),
  })
}

export const ExportResponse = z.union([
  exportOf("readings", ExportReadingRow),
  exportOf("alerts", ExportAlertRow),
  exportOf("commands", ExportCommandRow),
  exportOf("feeding_logs", ExportCommandRow),
  exportOf("reports", ReportGroup),
  exportOf("telemetry", TelemetryRecord),
])

/* Request bodies. These mirror the server-side rules in API.md so forms can fail
   early; the PHP validators remain the authority. */

export const LoginInput = z.object({
  username: z.string().trim().min(1, "Isi email, nomor WA, atau username."),
  password: z.string().min(1, "Isi password."),
})

export const RegisterInput = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Isi nama lengkap dulu.")
      .max(100, "Nama maksimal 100 karakter."),
    contact: z.string().trim().min(1, "Isi email atau nomor WA."),
    // API.md counts 8-1024 bytes; length in characters is the closest client-side check.
    password: z
      .string()
      .min(8, "Password minimal 8 karakter.")
      .max(1024, "Password terlalu panjang."),
    password_confirmation: z.string(),
    serial_number: z.string().trim().optional(),
  })
  .refine((v) => v.password === v.password_confirmation, {
    path: ["password_confirmation"],
    message: "Password dan konfirmasi belum sama.",
  })

// Same normalisation and pattern as DeviceLifecycle::claim.
export const DeviceClaimInput = z.object({
  serial_number: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{1,128}$/, "Serial perangkat tidak valid."),
})

export const DeviceUpdateInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Isi nama perangkat.")
    .max(100, "Nama perangkat maksimal 100 karakter."),
  location: z
    .string()
    .trim()
    .min(1, "Isi lokasi perangkat.")
    .max(150, "Lokasi maksimal 150 karakter."),
})

const FEED_DURATION = "Durasi pakan 1 sampai 30 detik."

export const ScheduleInput = z.object({
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Pilih jam dalam format JJ:MM."),
  duration: z.number(FEED_DURATION).int(FEED_DURATION).min(1, FEED_DURATION).max(30, FEED_DURATION),
  days: z.enum(ScheduleDays.options, "Pilih hari jadwal."),
})

const RequestId = z
  .string()
  .regex(/^[A-Za-z0-9:_.-]{1,120}$/)
  .optional()

export const ControlInput = z.discriminatedUnion("actuator", [
  z.object({
    actuator: z.literal("feeder"),
    value: z.boolean(),
    duration: z
      .number(FEED_DURATION)
      .int(FEED_DURATION)
      .min(1, FEED_DURATION)
      .max(30, FEED_DURATION)
      .optional(),
    request_id: RequestId,
  }),
  z.object({ actuator: z.literal("aerator"), value: z.boolean(), request_id: RequestId }),
  z.object({ actuator: z.literal("auto"), value: z.boolean(), request_id: RequestId }),
])

export const ThresholdsInput = Thresholds.refine((t) => t.ph_min < t.ph_max, {
  path: ["ph_max"],
  message: "pH maksimum harus lebih besar dari pH minimum.",
}).refine((t) => t.temperature_min < t.temperature_max, {
  path: ["temperature_max"],
  message: "Suhu maksimum harus lebih besar dari suhu minimum.",
})

export const ProfileInput = z.object({
  name: z.string().trim().min(1, "Isi nama lengkap dulu.").max(100, "Nama maksimal 100 karakter."),
  phone: z
    .string()
    .trim()
    .min(1, "Isi nomor telepon.")
    .max(30, "Nomor telepon maksimal 30 karakter."),
})

// Mirrors ObservationRepository: the date must round-trip through the calendar
// (no 2026-02-30) and may not lie after today in UTC.
function isRealDate(date: string): boolean {
  const parsed = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}

export const ObservationInput = z
  .object({
    device_id: z.string().min(1, "Pilih perangkat."),
    observed_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Pilih tanggal pengamatan.")
      .refine(isRealDate, "Tanggal pengamatan tidak ada di kalender.")
      .refine(
        (date) => date <= new Date().toISOString().slice(0, 10),
        "Tanggal pengamatan tidak boleh melewati hari ini (UTC).",
      ),
    // Pesan pada z.number() muncul saat isian bukan angka (parseDecimal memberi NaN).
    weight_g: z
      .number("Tulis berat sebagai angka, misalnya 12,5.")
      .positive("Berat harus lebih dari 0.")
      .nullable(),
    length_cm: z
      .number("Tulis panjang sebagai angka, misalnya 8,5.")
      .positive("Panjang harus lebih dari 0.")
      .nullable(),
    notes: z.string().max(2000, "Catatan maksimal 2000 karakter."),
  })
  .refine((o) => o.weight_g !== null || o.length_cm !== null || o.notes.trim() !== "", {
    path: ["notes"],
    message: "Isi pengukuran atau catatan observasi.",
  })

export const InvitationInput = z.object({
  contact: z.string().trim().min(1, "Isi email atau nomor WA."),
})
export const InvitationAcceptInput = z.object({
  // The server hashes the token as typed and only ever issues lowercase hex.
  token: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[0-9a-f]{64}$/, "Kode undangan berisi 64 karakter huruf a-f dan angka."),
})

export const ReportQuery = z.object({
  device_id: z.string().min(1),
  // The server rejects an impossible calendar date with 422; checking it here keeps
  // the report page on its own "filter salah" branch instead of the error boundary.
  date: CalendarDate.refine(isRealDate, "Tanggal laporan tidak ada di kalender."),
  period: ReportPeriod,
})
export const ExportQuery = ReportQuery.extend({ kind: ExportKind, format: ExportFormat })

/* Types */

export type User = z.output<typeof User>
export type Session = z.output<typeof Session>
export type Device = z.output<typeof Device>
export type Reading = z.output<typeof Reading>
export type Schedule = z.output<typeof Schedule>
export type Command = z.output<typeof Command>
export type Alert = z.output<typeof Alert>
export type AuditLog = z.output<typeof AuditLog>
export type Thresholds = z.output<typeof Thresholds>
export type Observation = z.output<typeof Observation>
export type Report = z.output<typeof Report>
export type ReportQuery = z.output<typeof ReportQuery>
export type ExportQuery = z.output<typeof ExportQuery>
export type ControlInput = z.input<typeof ControlInput>
