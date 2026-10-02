"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { fieldProps } from "@/components/ui/a11y"
import { Field } from "@/components/ui/field"
import { button, control } from "@/components/ui/styles"
import { useCreateObservation } from "@/hooks/use-observations"
import { ObservationInput } from "@/lib/api/schemas"
import { fieldErrors, parseDecimal } from "@/lib/form"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"

const DATE_HINT = "Tanggal UTC, tidak boleh melewati hari ini."
// Kolom kosong berarti sampel tidak diukur dan API menyimpan null. Isian lain harus
// angka; parseDecimal menerima koma desimal dan menolak teks, bukan mengosongkannya.
const MEASURE_HINT = "Boleh dikosongkan kalau tidak diukur. Koma atau titik untuk desimal."
const NOTES_HINT = "Isi minimal salah satu: berat, panjang, atau catatan."

// today comes from the server render so the default and the max attribute match the
// UTC day the page was built with, instead of drifting with the browser clock.
export function ObservationForm({ deviceId, today }: { deviceId: string; today: string }) {
  const router = useRouter()
  const create = useCreateObservation()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<string>()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const parsed = ObservationInput.safeParse({
      device_id: deviceId,
      observed_at: data.get("observed_at"),
      weight_g: parseDecimal(data.get("weight_g")),
      length_cm: parseDecimal(data.get("length_cm")),
      notes: String(data.get("notes") ?? ""),
    })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    setSaved(undefined)
    create.mutate(parsed.data, {
      onSuccess: ({ observation }) => {
        setSaved(`Observasi ${formatDate(observation.observed_at)} tersimpan.`)
        form.reset()
        router.refresh()
      },
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          id="observation-date"
          label="Tanggal pengamatan"
          hint={DATE_HINT}
          error={errors.observed_at}
        >
          <input
            name="observed_at"
            type="date"
            max={today}
            defaultValue={today}
            className={control()}
            {...fieldProps("observation-date", { hint: DATE_HINT, error: errors.observed_at })}
          />
        </Field>

        <Field
          id="observation-weight"
          label="Berat sampel (gram)"
          hint={MEASURE_HINT}
          error={errors.weight_g}
        >
          <input
            name="weight_g"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className={control()}
            {...fieldProps("observation-weight", { hint: MEASURE_HINT, error: errors.weight_g })}
          />
        </Field>

        <Field
          id="observation-length"
          label="Panjang sampel (cm)"
          hint={MEASURE_HINT}
          error={errors.length_cm}
        >
          <input
            name="length_cm"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className={control()}
            {...fieldProps("observation-length", { hint: MEASURE_HINT, error: errors.length_cm })}
          />
        </Field>
      </div>

      <Field id="observation-notes" label="Catatan" hint={NOTES_HINT} error={errors.notes}>
        <textarea
          name="notes"
          rows={3}
          className={cn(control(), "min-h-24 py-2")}
          {...fieldProps("observation-notes", { hint: NOTES_HINT, error: errors.notes })}
        />
      </Field>

      <button type="submit" disabled={create.isPending} className={button()}>
        {create.isPending ? "Menyimpan..." : "Simpan observasi"}
      </button>

      {create.isError ? (
        <p role="alert" className="text-sm text-alarm-coral-text">
          {create.error.message}
        </p>
      ) : null}
      {saved && !create.isPending ? (
        <p role="status" className="text-sm text-ink">
          {saved}
        </p>
      ) : null}
    </form>
  )
}
