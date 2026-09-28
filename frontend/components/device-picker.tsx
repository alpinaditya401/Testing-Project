import Form from "next/form"
import Link from "next/link"
import { button, control } from "@/components/ui/styles"
import { cn } from "@/lib/utils"

// Switching device is a server-rendered navigation that works without JavaScript. On phones
// a GET form replaces the link row and submits on the button, not on every arrow key.
export function DevicePicker({
  devices,
  selectedId,
  basePath,
}: {
  devices: { id: string; name: string }[]
  selectedId: string
  basePath: string
}) {
  if (devices.length < 2) return null
  return (
    <nav aria-label="Pilih perangkat">
      <Form action={basePath} className="sm:hidden">
        <label htmlFor="device-choice" className="block text-sm font-medium">
          Perangkat aktif
        </label>
        <div className="mt-2 flex gap-2">
          <select
            key={selectedId}
            id="device-choice"
            name="device"
            defaultValue={selectedId}
            className={cn(control(), "min-w-0 flex-1")}
          >
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
          <button type="submit" className={button({ tone: "secondary", size: "compact" })}>
            Tampilkan
          </button>
        </div>
      </Form>
      <ul className="hidden flex-wrap gap-2 sm:flex">
        {devices.map((device) => {
          const selected = device.id === selectedId
          return (
            <li key={device.id}>
              <Link
                href={`${basePath}?device=${encodeURIComponent(device.id)}`}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-crisp border px-3 text-sm",
                  selected
                    ? "border-deep-current bg-deep-current text-foam"
                    : "border-muted bg-surface-white text-ink hover:bg-bg-deep",
                )}
              >
                {device.name}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
