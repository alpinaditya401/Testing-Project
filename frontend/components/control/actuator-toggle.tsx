"use client"

import { useRouter } from "next/navigation"
import { button } from "@/components/ui/styles"
import { useControlActuator } from "@/hooks/use-control"
import { requestId } from "@/lib/request-id"

// An action button rather than a switch: a switch leaves the farmer guessing whether
// it shows the current state or the one it will change to. The current state is
// printed by the Server Component above this button.
export function ActuatorToggle({
  deviceId,
  actuator,
  label,
  on,
}: {
  deviceId: string
  actuator: "aerator" | "auto"
  label: string
  on: boolean
}) {
  const router = useRouter()
  const toggle = useControlActuator(deviceId)

  function send() {
    toggle.mutate(
      { actuator, value: !on, request_id: requestId() },
      { onSuccess: () => router.refresh() },
    )
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={send}
        disabled={toggle.isPending}
        className={button({ tone: on ? "secondary" : "primary", className: "w-full" })}
      >
        {toggle.isPending ? "Mengirim perintah..." : `${on ? "Matikan" : "Nyalakan"} ${label}`}
      </button>
      {toggle.isError ? (
        <p role="alert" className="text-sm text-alarm-coral-text">
          {toggle.error.message}
        </p>
      ) : null}
    </div>
  )
}
