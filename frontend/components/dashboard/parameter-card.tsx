import type { Thresholds } from "@/lib/api/schemas"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { limitText, PARAMETERS, type ParameterKey, withinLimits } from "@/lib/water-quality"

type Reading = { ph: number; temperature: number; turbidity: number }

// One card per parameter. Status is written as text next to the colour, so it
// still reads in forced-colours mode and for colour-blind users.
export function ParameterCard({
  parameterKey,
  reading,
  thresholds,
}: {
  parameterKey: ParameterKey
  reading: Reading | null
  thresholds: Thresholds
}) {
  const parameter = PARAMETERS.find((p) => p.key === parameterKey)
  if (!parameter) return null
  const value = reading ? reading[parameterKey] : null
  const ok = value === null ? null : withinLimits(parameterKey, value, thresholds)

  return (
    <article
      aria-labelledby={`param-${parameterKey}`}
      data-status={ok === null ? "none" : ok ? "ok" : "out"}
      className={cn(
        "sensor-card rounded-panel border bg-surface-white p-5",
        ok === false ? "border-alarm-coral-text" : "border-foam-line",
      )}
    >
      <h3 id={`param-${parameterKey}`} className="text-sm font-semibold text-ink">
        {parameter.label}
      </h3>
      {value === null ? (
        <p className="mt-3 text-lg text-muted">Belum ada data</p>
      ) : (
        <p className="mt-3 font-data text-4xl text-deep-current">
          {formatNumber(value, parameter.decimals)}
          <span className="ml-1.5 text-base text-muted">{parameter.unit}</span>
        </p>
      )}
      <p
        className={cn(
          "mt-2 text-sm font-semibold",
          ok === null ? "text-muted" : ok ? "text-clear-water-text" : "text-alarm-coral-text",
        )}
      >
        {ok === null ? "Belum dapat dinilai" : ok ? parameter.okLabel : parameter.outLabel}
      </p>
      <p className="mt-1 text-xs text-muted">{limitText(parameterKey, thresholds)}</p>
    </article>
  )
}
