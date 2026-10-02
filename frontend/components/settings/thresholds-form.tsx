"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { fieldProps } from "@/components/ui/a11y"
import { Field } from "@/components/ui/field"
import { button, control } from "@/components/ui/styles"
import { useUpdateThresholds } from "@/hooks/use-thresholds"
import { type Thresholds, ThresholdsInput } from "@/lib/api/schemas"
import { fieldErrors, parseDecimal } from "@/lib/form"

const PH_HINT = "0 sampai 14."

// An empty box must not be read as zero, so it becomes NaN and fails validation.
// Inputnya type=text: type=number di Chromium membuang koma desimal diam-diam, jadi
// "27,5" tersimpan sebagai 275. parseDecimal menerima koma maupun titik.
function numberOf(value: FormDataEntryValue | null): number {
  return parseDecimal(value) ?? Number.NaN
}

// Every field starts from the value the server sent. ThresholdRules.php owns the
// default numbers, so none of them may be written here.
export function ThresholdsForm({ thresholds }: { thresholds: Thresholds }) {
  const router = useRouter()
  const update = useUpdateThresholds()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const parsed = ThresholdsInput.safeParse({
      ph_min: numberOf(data.get("ph_min")),
      ph_max: numberOf(data.get("ph_max")),
      temperature_min: numberOf(data.get("temperature_min")),
      temperature_max: numberOf(data.get("temperature_max")),
      turbidity_max: numberOf(data.get("turbidity_max")),
    })
    setSaved(false)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    update.mutate(parsed.data, {
      onSuccess: () => {
        setSaved(true)
        router.refresh()
      },
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ph-min" label="pH minimum" hint={PH_HINT} error={errors.ph_min}>
          <input
            name="ph_min"
            type="text"
            inputMode="decimal"
            defaultValue={thresholds.ph_min}
            className={control()}
            {...fieldProps("ph-min", { hint: PH_HINT, error: errors.ph_min })}
          />
        </Field>
        <Field id="ph-max" label="pH maksimum" hint={PH_HINT} error={errors.ph_max}>
          <input
            name="ph_max"
            type="text"
            inputMode="decimal"
            defaultValue={thresholds.ph_max}
            className={control()}
            {...fieldProps("ph-max", { hint: PH_HINT, error: errors.ph_max })}
          />
        </Field>
        <Field id="suhu-min" label="Suhu minimum (°C)" error={errors.temperature_min}>
          <input
            name="temperature_min"
            type="text"
            inputMode="decimal"
            defaultValue={thresholds.temperature_min}
            className={control()}
            {...fieldProps("suhu-min", { error: errors.temperature_min })}
          />
        </Field>
        <Field id="suhu-max" label="Suhu maksimum (°C)" error={errors.temperature_max}>
          <input
            name="temperature_max"
            type="text"
            inputMode="decimal"
            defaultValue={thresholds.temperature_max}
            className={control()}
            {...fieldProps("suhu-max", { error: errors.temperature_max })}
          />
        </Field>
        <Field id="kekeruhan-max" label="Kekeruhan maksimum (NTU)" error={errors.turbidity_max}>
          <input
            name="turbidity_max"
            type="text"
            inputMode="decimal"
            defaultValue={thresholds.turbidity_max}
            className={control()}
            {...fieldProps("kekeruhan-max", { error: errors.turbidity_max })}
          />
        </Field>
      </div>

      <button type="submit" disabled={update.isPending} className={button()}>
        {update.isPending ? "Menyimpan..." : "Simpan ambang"}
      </button>

      {update.isError ? (
        <p role="alert" className="text-sm text-alarm-coral-text">
          {update.error.message}
        </p>
      ) : null}
      {saved && !update.isPending ? (
        <p role="status" className="text-sm text-ink">
          Ambang tersimpan. Halaman Kualitas Air menilai pembacaan dengan angka ini.
        </p>
      ) : null}
    </form>
  )
}
