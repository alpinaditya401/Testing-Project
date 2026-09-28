import { formatNumber } from "@/lib/format"

export function WaterChart({ values, label = "Riwayat pH" }: { values: number[]; label?: string }) {
  if (values.length < 2)
    return <p className="chart-empty">Grafik muncul setelah tersedia sedikitnya dua pembacaan.</p>
  const low = Math.min(...values) - 0.3
  const range = Math.max(...values) - low + 0.3
  const points = values
    .map((v, i) => `${20 + (i / (values.length - 1)) * 760},${155 - ((v - low) / range) * 125}`)
    .join(" ")
  // Semicolons separate the values because Indonesian decimals already use commas.
  const spoken = values.map((v) => formatNumber(v, 1)).join("; ")
  // SVG text would shrink with the viewBox to about 5px on a phone, so the axis ends are HTML.
  return (
    <div className="water-chart">
      <svg
        viewBox="0 0 800 180"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}, dari yang lebih awal ke yang terbaru: ${spoken}`}
      >
        <title>{label}</title>
        {[35, 75, 115, 155].map((y) => (
          <line key={y} x1="20" y1={y} x2="780" y2={y} className="chart-grid" />
        ))}
        <polygon points={`20,175 ${points} 780,175`} className="chart-fill" />
        <polyline points={points} className="chart-line" />
      </svg>
      <div className="chart-axis" aria-hidden="true">
        <span>Lebih awal</span>
        <span>Terbaru</span>
      </div>
    </div>
  )
}
