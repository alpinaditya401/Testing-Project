"use client"

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Expand,
  Footprints,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  X,
} from "lucide-react"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import anchors from "../../public/models/component-anchors.json"
import { guideFor } from "./components-guide"
import type { Move, SceneId, Viewpoint, World } from "./world"

const SCENES: { id: SceneId; label: string; subtitle: string; description: string }[] = [
  {
    id: "aquaponik",
    label: "Aquaponik",
    subtitle: "Lele & selada",
    description:
      "Berjalan mengitari akuarium, lihat grow bed selada, lalu dekati casing di sisi instalasi. Animasi lele berasal dari keyframe Blender asli.",
  },
  {
    id: "rangkaian",
    label: "Rangkaian",
    subtitle: "Komponen & jalur kabel",
    description:
      "Kenali modul ESP32, jalur kabel, sensor dan catu pada model rangkaian. Objek diperbesar sebagai meja pamer agar lebih mudah dilihat.",
  },
  {
    id: "casing",
    label: "Casing",
    subtitle: "Tampilan terbuka",
    description:
      "Lihat susunan enclosure dan elektronik dalam posisi exploded dari scene Blender. Model diperbesar untuk inspeksi visual.",
  },
]
const VIEWS: { id: Viewpoint; label: string }[] = [
  { id: "front", label: "Depan" },
  { id: "side", label: "Samping" },
  { id: "back", label: "Belakang" },
  { id: "detail", label: "Detail" },
]

export function Walkthrough() {
  const [sceneId, setSceneId] = useState<SceneId>("aquaponik")
  const [started, setStarted] = useState(false)
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const [paused, setPaused] = useState(false)
  const [animated, setAnimated] = useState(true)
  const [light, setLight] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [fps, setFps] = useState<number | null>(null)
  const [mode, setMode] = useState("Tampak depan")
  const [componentId, setComponentId] = useState("temp")
  const activeId = anchors[sceneId].some((item) => item.id === componentId)
    ? componentId
    : (anchors[sceneId][0]?.id ?? "temp")
  const component = guideFor(activeId)
  const host = useRef<HTMLDivElement>(null)
  const controller = useRef<World | null>(null)
  const expandButton = useRef<HTMLButtonElement>(null)
  const player = useRef<HTMLDivElement>(null)
  const selected = SCENES.find((scene) => scene.id === sceneId) ?? {
    id: "aquaponik",
    label: "Aquaponik",
    subtitle: "Lele & selada",
    description: "Model Blender aquaponik.",
  }
  const ready = status === "ready"

  useEffect(() => {
    setAnimated(!matchMedia("(prefers-reduced-motion: reduce)").matches)
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry restarts a failed loader without changing the selected scene.
  useEffect(() => {
    if (!started || !host.current) return
    const target = host.current
    const abort = new AbortController()
    let world: World | undefined
    setStatus("loading")
    setProgress(0)
    setFps(null)
    setPaused(false)
    import("./world")
      .then(({ createWorld }) => {
        if (abort.signal.aborted) return undefined
        return createWorld(
          target,
          sceneId,
          {
            progress: (value) => {
              if (!abort.signal.aborted) setProgress(value)
            },
            fps: (value) => {
              if (!abort.signal.aborted) setFps(value)
            },
            mode: (value) => {
              if (!abort.signal.aborted) setMode(value)
            },
            error: (message) => {
              if (!abort.signal.aborted) {
                setError(message)
                setStatus("error")
              }
            },
            component: setComponentId,
          },
          abort.signal,
        )
      })
      .then((result) => {
        if (!result) return
        if (abort.signal.aborted) {
          result.dispose()
          return
        }
        world = result
        controller.current = result
        setStatus("ready")
      })
      .catch((reason) => {
        if (abort.signal.aborted) return
        setError(
          reason instanceof Error && !reason.message.includes("WebGL")
            ? reason.message
            : "Browser ini belum dapat membuka tampilan 3D. Coba browser dengan WebGL aktif; gambar scene tetap tersedia di sini.",
        )
        setStatus("error")
      })
    return () => {
      abort.abort()
      world?.dispose()
      controller.current = null
    }
  }, [sceneId, started, retry])
  useEffect(() => {
    if (ready) controller.current?.pause(paused)
  }, [paused, ready])
  useEffect(() => {
    if (ready) controller.current?.animate(animated)
  }, [animated, ready])
  useEffect(() => {
    if (ready) controller.current?.quality(light)
  }, [light, ready])
  useEffect(() => {
    if (ready) controller.current?.selectComponent(activeId)
  }, [activeId, ready])
  useEffect(() => {
    if (!expanded) return
    const close = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const controls = Array.from(
          player.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled):not([hidden]), canvas[tabindex], select, summary, a[href]",
          ) ?? [],
        )
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
      if (event.key === "Escape" && !document.pointerLockElement) {
        setExpanded(false)
        expandButton.current?.focus()
      }
    }
    document.addEventListener("keydown", close)
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", close)
      document.body.style.overflow = previous
    }
  }, [expanded])

  const movementButton = (action: Move, label: string, Icon: typeof ArrowUp) => (
    <button
      key={action}
      type="button"
      aria-label={label}
      disabled={!ready || paused}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        controller.current?.movement(action, true)
      }}
      onPointerUp={() => controller.current?.movement(action, false)}
      onPointerCancel={() => controller.current?.movement(action, false)}
      onLostPointerCapture={() => controller.current?.movement(action, false)}
      onBlur={() => controller.current?.movement(action, false)}
      onClick={(event) => {
        if (event.detail === 0) controller.current?.step(action)
      }}
    >
      <Icon size={19} aria-hidden="true" />
    </button>
  )

  return (
    <section className="walkthrough" aria-label="Jelajah model Blender">
      <fieldset className="scene-tabs" aria-label="Pilihan scene">
        {SCENES.map((scene, i) => (
          <button
            key={scene.id}
            type="button"
            aria-pressed={sceneId === scene.id}
            onClick={() => setSceneId(scene.id)}
          >
            <span className="scene-index">0{i + 1}</span>
            <span>
              <strong>{scene.label}</strong>
              <small>{scene.subtitle}</small>
            </span>
          </button>
        ))}
      </fieldset>
      <div ref={player} className={`walk-player${expanded ? " walk-expanded" : ""}`}>
        <div className="walk-toolbar">
          <span>
            {selected.label}
            <small>{ready ? mode : "Model Blender asli"}</small>
          </span>
          <div>
            <span className="walk-fps">{paused ? "Dijeda" : fps === null ? "" : `${fps} fps`}</span>
            <button
              ref={expandButton}
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-label={expanded ? "Kecilkan tampilan" : "Perbesar tampilan"}
            >
              {expanded ? (
                <X size={18} aria-hidden="true" />
              ) : (
                <Expand size={18} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        <div className="walk-stage">
          <div ref={host} className="walk-canvas-host" />
          {!ready && (
            <Image
              src={`/models/${sceneId}-poster.png`}
              alt={`Render asli Blender: ${selected.label}`}
              fill
              loading="eager"
              sizes="(max-width: 700px) 100vw, 1200px"
              className="walk-poster"
            />
          )}
          {!started && (
            <div className="walk-overlay">
              <div>
                <Footprints size={27} aria-hidden="true" />
                <h2>Masuk ke ruang budidaya.</h2>
                <p>Jelajahi model dari dekat dengan sudut pandang orang pertama.</p>
                <button type="button" className="studio-button" onClick={() => setStarted(true)}>
                  <Play size={17} aria-hidden="true" />
                  Mulai jelajah 3D
                </button>
                <small>Model dimuat saat Anda mulai.</small>
              </div>
            </div>
          )}
          {status === "loading" && (
            <div className="walk-overlay">
              <div role="status">
                <div className="walk-loading" />
                <h2>Menyiapkan {selected.label.toLowerCase()}…</h2>
                <p>
                  {progress < 55
                    ? "Mengunduh model dari penyimpanan lokal."
                    : progress < 80
                      ? "Membuka geometri dan material."
                      : "Menyiapkan cahaya dan kontrol."}
                </p>
              </div>
            </div>
          )}
          {status === "error" && (
            <div className="walk-overlay">
              <div role="alert">
                <h2>Scene belum dapat dibuka.</h2>
                <p>{error}</p>
                <button
                  type="button"
                  className="studio-button"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  Coba lagi
                </button>
              </div>
            </div>
          )}
          {ready && !paused && (
            <span className="walk-crosshair" aria-hidden="true">
              +
            </span>
          )}
          {ready && paused && (
            <div className="walk-overlay walk-pause-overlay">
              <div>
                <h2>Ambil jeda.</h2>
                <button className="studio-button" type="button" onClick={() => setPaused(false)}>
                  Lanjut jelajah
                </button>
              </div>
            </div>
          )}
          {ready && (
            <div className="walk-hud">
              <span>{paused ? "Tampilan dijeda" : "Geser layar untuk melihat sekeliling"}</span>
              <fieldset className="walk-direction" aria-label="Kontrol berjalan">
                {movementButton("forward", "Maju", ArrowUp)}
                <div>
                  {movementButton("left", "Geser kiri", ArrowLeft)}
                  {movementButton("backward", "Mundur", ArrowDown)}
                  {movementButton("right", "Geser kanan", ArrowRight)}
                </div>
              </fieldset>
            </div>
          )}
        </div>
        <div className="walk-actions">
          <fieldset className="walk-views" aria-label="Titik pandang cepat">
            {VIEWS.map((view) => (
              <button
                key={view.id}
                type="button"
                disabled={!ready || paused}
                onClick={() => controller.current?.viewpoint(view.id)}
              >
                {view.label}
              </button>
            ))}
          </fieldset>
          <div className="walk-tools">
            <button type="button" disabled={!ready} onClick={() => setPaused((value) => !value)}>
              {paused ? (
                <Play size={15} aria-hidden="true" />
              ) : (
                <Pause size={15} aria-hidden="true" />
              )}
              {paused ? "Lanjut" : "Jeda"}
            </button>
            <button
              type="button"
              disabled={!ready || paused}
              onClick={() => controller.current?.viewpoint("front")}
            >
              <RotateCcw size={15} aria-hidden="true" />
              Reset
            </button>
            <button
              className="walk-mouse"
              type="button"
              disabled={!ready || paused}
              onClick={() => controller.current?.lock()}
            >
              <MousePointer2 size={15} aria-hidden="true" />
              Mouse bebas
            </button>
          </div>
        </div>
        <details className="component-guide" open>
          <summary>Komponen & panduan sambungan</summary>
          <div className="component-guide-body">
            <div className="component-picker">
              <label htmlFor="component-choice">Pilih nomor pada model atau nama komponen</label>
              <select
                id="component-choice"
                value={activeId}
                onChange={(event) => setComponentId(event.target.value)}
              >
                {anchors[sceneId].map((anchor, index) => (
                  <option key={anchor.id} value={anchor.id}>
                    {String(index + 1).padStart(2, "0")} · {guideFor(anchor.id)?.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!ready || paused}
                onClick={() => controller.current?.selectComponent(activeId, true)}
              >
                Lihat posisi komponen
              </button>
              <p>
                Penanda menunjukkan lokasi komponen, bukan urutan kaki fisik. Scene Rangkaian dan
                Casing memuat 19 titik penjelasan.
              </p>
            </div>
            {component && (
              <article className="component-description" aria-live="polite" aria-atomic="true">
                <span className="component-status">{component.status}</span>
                <h3>{component.name}</h3>
                <p>{component.purpose}</p>
                <h4>Sambungan</h4>
                <ul>
                  {component.wires.map((wire) => (
                    <li key={wire}>{wire}</li>
                  ))}
                </ul>
                <p className="component-note">{component.note}</p>
              </article>
            )}
          </div>
        </details>
      </div>
      <p className="wiring-source">
        Acuan: rancangan Blender 23 September 2026, WIRING.md, dan pin firmware proyek. Rancangan
        belum diuji fisik. Matikan catu saat memasang kabel dan cocokkan label modul aktual.
        <a href="/models/panduan-wiring.md" download>
          Unduh panduan wiring
        </a>
      </p>
      <div className="walk-details">
        <div>
          <span className="eyebrow">Tentang scene ini</span>
          <h2>
            {selected.label}: {selected.subtitle.toLowerCase()}
          </h2>
          <p>{selected.description}</p>
          <p className="walk-disclaimer">
            Simulasi visual, bukan kondisi sensor langsung. Skala tampilan diadaptasi untuk
            penjelajahan; model bukan acuan ukuran produksi.
          </p>
        </div>
        <div className="walk-options">
          <label>
            Kualitas tampilan
            <select
              value={light ? "light" : "detail"}
              onChange={(event) => setLight(event.target.value === "light")}
            >
              <option value="light">Hemat · target 30 fps</option>
              <option value="detail">Lebih tajam · target 60 fps</option>
            </select>
          </label>
          {sceneId === "aquaponik" && (
            <label className="walk-toggle">
              <input
                type="checkbox"
                checked={animated}
                onChange={(event) => setAnimated(event.target.checked)}
              />
              Animasi renang lele
            </label>
          )}
          <p>
            Kecepatan aktual mengikuti kemampuan perangkat. Ganti ke Hemat jika gerakan tersendat.
          </p>
        </div>
      </div>
      <details className="walk-help" id="walk-help">
        <summary>Panduan kontrol</summary>
        <div>
          <p>
            <strong>Desktop:</strong> klik area 3D, lalu W/A/S/D untuk berjalan. Geser mouse sambil
            menekan area 3D, atau pilih Mouse bebas. Tombol panah mengubah arah pandang. Esc melepas
            mouse.
          </p>
          <p>
            <strong>Ponsel:</strong> geser area 3D untuk melihat. Tekan dan tahan tombol arah untuk
            berjalan. Gunakan Depan, Samping, Belakang, dan Detail untuk berpindah sudut dengan
            cepat.
          </p>
          <p>
            <strong>Navigasi keyboard:</strong> Tab menuju area 3D atau kontrol. Enter mengaktifkan
            tombol. Tombol arah layar dapat dipakai per langkah. Reset mengembalikan posisi awal.
          </p>
        </div>
      </details>
    </section>
  )
}
