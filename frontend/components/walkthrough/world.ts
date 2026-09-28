import * as THREE from "three"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import anchors from "../../public/models/component-anchors.json"
import { guideFor } from "./components-guide"
import { moveWithBarrier } from "./navigation"

export type SceneId = "aquaponik" | "rangkaian" | "casing"
export type Move = "forward" | "backward" | "left" | "right"
export type Viewpoint = "front" | "side" | "back" | "detail"
export type World = {
  dispose(): void
  movement(action: Move, pressed: boolean): void
  step(action: Move): void
  look(x: number, y: number): void
  viewpoint(view: Viewpoint): void
  pause(value: boolean): void
  animate(value: boolean): void
  quality(light: boolean): void
  lock(): void
  selectComponent(id: string, focus?: boolean): void
}
type Sample = { p: [number, number, number]; q: [number, number, number, number] }
type Motion = { fps: number; frames: number; tracks: Record<string, Sample[]> }
type Callbacks = {
  progress(value: number): void
  fps(value: number): void
  mode(value: string): void
  error(value: string): void
  component(id: string): void
}

export async function createWorld(
  host: HTMLDivElement,
  sceneId: SceneId,
  callbacks: Callbacks,
  signal: AbortSignal,
): Promise<World> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.85
  const canvas = renderer.domElement
  canvas.tabIndex = 0
  canvas.setAttribute(
    "aria-label",
    "Area jelajah 3D. WASD untuk berjalan, tombol panah untuk melihat. Escape melepas mouse.",
  )
  canvas.setAttribute("aria-describedby", "walk-help")
  const scene = new THREE.Scene()
  scene.background = new THREE.Color("#e8eee7")
  scene.fog = new THREE.Fog("#e8eee7", 9, 20)
  const camera = new THREE.PerspectiveCamera(55, 1, 0.015, 40)
  camera.rotation.order = "YXZ"
  const room = new RoomEnvironment()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(room)
  scene.environment = env.texture
  scene.environmentIntensity = 0.65
  room.dispose()
  pmrem.dispose()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x65796d, 0.9))
  const sun = new THREE.DirectionalLight(0xfff4dd, 1.8)
  sun.position.set(3, 6, 5)
  scene.add(sun)
  const draco = new DRACOLoader().setDecoderPath("/draco/").setWorkerLimit(2)
  const loader = new GLTFLoader().setDRACOLoader(draco)
  const listeners = new AbortController()
  let frameId = 0
  let observer: ResizeObserver | undefined
  let disposed = false
  let paused = false
  let animated = !matchMedia("(prefers-reduced-motion: reduce)").matches
  let light = matchMedia("(max-width: 700px)").matches
  const keys = new Set<string>()
  const moves = new Set<Move>()
  const labels = document.createElement("div")
  labels.className = "component-markers"
  const dispose = () => {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frameId)
    listeners.abort()
    observer?.disconnect()
    if (document.pointerLockElement === canvas) document.exitPointerLock()
    draco.dispose()
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          for (const value of Object.values(material))
            if (value instanceof THREE.Texture) value.dispose()
          material.dispose()
        }
      }
    })
    env.dispose()
    renderer.dispose()
    canvas.remove()
    labels.remove()
  }
  try {
    callbacks.progress(10)
    const response = await fetch(`/models/${sceneId}.glb`, { signal })
    if (!response.ok) throw new Error("Model belum tersedia. Coba muat ulang.")
    const buffer = await response.arrayBuffer()
    if (signal.aborted) throw new DOMException("Aborted", "AbortError")
    callbacks.progress(55)
    const gltf = await loader.parseAsync(buffer, "/models/")
    scene.add(gltf.scene)
    if (signal.aborted) throw new DOMException("Aborted", "AbortError")
    callbacks.progress(80)
    const model = gltf.scene
    const original = new THREE.Box3().setFromObject(model)
    const size = original.getSize(new THREE.Vector3())
    const center = original.getCenter(new THREE.Vector3())
    const scale = sceneId === "aquaponik" ? 1.55 : 2.5 / Math.max(size.x, size.z)
    const content = new THREE.Group()
    scene.remove(model)
    content.add(model)
    scene.add(content)
    model.position.set(-center.x, -original.min.y, -center.z)
    content.scale.setScalar(scale)
    content.position.y = sceneId === "aquaponik" ? 0 : 0.78
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material.transparent) {
          material.depthWrite = false
          material.side = THREE.DoubleSide
        }
      }
    })
    const bounds = new THREE.Box3().setFromObject(content)
    const barrier = {
      minX: bounds.min.x - 0.16,
      maxX: bounds.max.x + 0.16,
      minZ: bounds.min.z - 0.16,
      maxZ: bounds.max.z + 0.16,
    }
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(18, 80),
      new THREE.MeshStandardMaterial({ color: 0xdbe3d9, roughness: 0.95 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.02
    scene.add(floor)
    if (sceneId !== "aquaponik") {
      const pedestal = new THREE.Mesh(
        new THREE.BoxGeometry(
          bounds.max.x - bounds.min.x + 0.2,
          0.76,
          bounds.max.z - bounds.min.z + 0.2,
        ),
        new THREE.MeshStandardMaterial({ color: 0xc6d3c6, roughness: 0.85 }),
      )
      pedestal.position.set(0, 0.38, 0)
      scene.add(pedestal)
    }
    let motion: Motion | undefined
    if (sceneId === "aquaponik") {
      const response = await fetch("/models/fish-motion.json", { signal })
      if (!response.ok) throw new Error("Animasi lele belum dapat dimuat.")
      motion = (await response.json()) as Motion
    }
    if (signal.aborted) throw new DOMException("Aborted", "AbortError")
    const conversion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      -Math.PI / 2,
    )
    const inverseConversion = conversion.clone().invert()
    const qa = new THREE.Quaternion(),
      qb = new THREE.Quaternion()
    const pa = new THREE.Vector3(),
      pb = new THREE.Vector3()
    const tracks = Object.entries(motion?.tracks ?? {}).map(([name, samples]) => ({
      node:
        model.getObjectByName(name) ??
        model.children.find(
          (object) =>
            typeof object.userData.name === "string" &&
            object.userData.name.replace(/\.\d{3}$/, "") === name,
        ),
      samples,
    }))
    if (tracks.some((track) => !track.node))
      throw new Error("Sebagian animasi lele tidak cocok dengan model. Coba muat ulang scene.")
    const target = new THREE.Vector3(0, sceneId === "aquaponik" ? 1.1 : 0.95, 0)
    const viewpoint = (view: Viewpoint) => {
      keys.clear()
      moves.clear()
      const aspect = host.clientWidth / Math.max(1, host.clientHeight)
      const distance = Math.min(
        6,
        Math.max(
          2.2,
          (bounds.max.x - bounds.min.x) / (2 * Math.tan(THREE.MathUtils.degToRad(27.5)) * aspect),
        ),
      )
      const front = Math.min(7.8, barrier.maxZ + distance)
      if (view === "front") camera.position.set(aspect < 1 ? 0 : 0.65, 1.65, front)
      if (view === "side") camera.position.set(Math.min(7.8, barrier.maxX + distance), 1.65, 0.5)
      if (view === "back") camera.position.set(-0.6, 1.65, Math.max(-7.8, barrier.minZ - distance))
      if (view === "detail")
        camera.position.set(
          0,
          sceneId === "aquaponik" ? 0.65 : bounds.max.y + 1.4,
          barrier.maxZ + (sceneId === "aquaponik" ? 0.6 : 1.2),
        )
      camera.lookAt(
        view === "detail" ? new THREE.Vector3(0, sceneId === "aquaponik" ? 0.6 : 0.9, 0) : target,
      )
      callbacks.mode(
        {
          front: "Tampak depan",
          side: "Sisi perangkat",
          back: "Tampak belakang",
          detail: "Lihat detail",
        }[view],
      )
    }
    viewpoint("front")
    const leaders = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    leaders.setAttribute("aria-hidden", "true")
    leaders.classList.add("component-leaders")
    labels.appendChild(leaders)
    const markers = anchors[sceneId].map((anchor, index) => {
      const button = document.createElement("button")
      button.type = "button"
      button.className = "component-marker"
      button.textContent = String(index + 1).padStart(2, "0")
      const name = guideFor(anchor.id)?.name ?? anchor.id
      button.title = name
      button.setAttribute("aria-label", `${index + 1}. ${name}: lihat sambungan`)
      button.setAttribute("aria-pressed", "false")
      button.addEventListener(
        "click",
        () => {
          selectComponent(anchor.id)
          callbacks.component(anchor.id)
        },
        { signal: listeners.signal },
      )
      labels.appendChild(button)
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
      leaders.appendChild(line)
      return {
        id: anchor.id,
        button,
        line,
        point: new THREE.Vector3(...(anchor.position as [number, number, number])),
      }
    })
    const projected = new THREE.Vector3()
    const offsets = Array.from({ length: 225 }, (_, i) => ({
      x: ((i % 15) - 7) * 46,
      y: (Math.floor(i / 15) - 7) * 46,
    })).sort((a, b) => a.x ** 2 + a.y ** 2 - b.x ** 2 - b.y ** 2)
    const updateMarkers = () => {
      camera.updateMatrixWorld()
      model.updateWorldMatrix(true, false)
      const placed: { x: number; y: number }[] = []
      const width = host.clientWidth
      const height = host.clientHeight
      for (const marker of markers) {
        projected.copy(marker.point).applyMatrix4(model.matrixWorld).project(camera)
        const visible =
          projected.z > -1 &&
          projected.z < 1 &&
          Math.abs(projected.x) < 0.96 &&
          Math.abs(projected.y) < 0.92
        marker.button.hidden = !visible
        marker.line.style.display = visible ? "" : "none"
        if (visible) {
          const x = ((projected.x + 1) * width) / 2
          const y = ((1 - projected.y) * height) / 2
          const offset = offsets.find((candidate) => {
            const px = x + candidate.x,
              py = y + candidate.y
            return (
              px > 24 &&
              px < width - 24 &&
              py > 24 &&
              py < height - 120 &&
              placed.every((other) => Math.hypot(other.x - px, other.y - py) >= 44)
            )
          })
          if (!offset) {
            marker.button.hidden = true
            marker.line.style.display = "none"
            continue
          }
          const point = { x: x + offset.x, y: y + offset.y }
          placed.push(point)
          marker.button.style.left = `${point.x}px`
          marker.button.style.top = `${point.y}px`
          marker.line.setAttribute("x1", String(x))
          marker.line.setAttribute("y1", String(y))
          marker.line.setAttribute("x2", String(point.x))
          marker.line.setAttribute("y2", String(point.y))
        }
      }
    }
    const selectComponent = (id: string, focus = false) => {
      const marker = markers.find((item) => item.id === id)
      if (!marker) return
      for (const item of markers) item.button.setAttribute("aria-pressed", String(item.id === id))
      if (focus) {
        keys.clear()
        moves.clear()
        const point = model.localToWorld(marker.point.clone())
        camera.position.set(
          point.x,
          sceneId === "aquaponik" ? point.y + 0.3 : bounds.max.y + 1.3,
          barrier.maxZ + 1.4,
        )
        camera.lookAt(point)
        callbacks.mode(guideFor(id)?.name ?? "Komponen")
        renderer.render(scene, camera)
      }
      updateMarkers()
    }
    const look = (x: number, y: number) => {
      camera.rotation.y -= x
      camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - y, -1.35, 1.35)
      callbacks.mode("Jelajah bebas")
    }
    const travel = (forward: number, right: number, distance: number) => {
      const length = Math.hypot(forward, right) || 1
      const yaw = camera.rotation.y
      const dx = ((-Math.sin(yaw) * forward + Math.cos(yaw) * right) * distance) / length
      const dz = ((-Math.cos(yaw) * forward - Math.sin(yaw) * right) * distance) / length
      const next = moveWithBarrier(camera.position, dx, dz, barrier)
      camera.position.x = next.x
      camera.position.z = next.z
      callbacks.mode("Jelajah bebas")
    }
    const step = (action: Move) =>
      travel(
        action === "forward" ? 1 : action === "backward" ? -1 : 0,
        action === "right" ? 1 : action === "left" ? -1 : 0,
        0.28,
      )
    const listenOptions = { signal: listeners.signal }
    const resetInput = () => {
      keys.clear()
      moves.clear()
    }
    canvas.addEventListener(
      "keydown",
      (event) => {
        if (
          [
            "KeyW",
            "KeyA",
            "KeyS",
            "KeyD",
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
          ].includes(event.code)
        ) {
          event.preventDefault()
          if (!event.repeat && !paused) {
            const action = (
              { KeyW: "forward", KeyS: "backward", KeyA: "left", KeyD: "right" } as const
            )[event.code as "KeyW" | "KeyS" | "KeyA" | "KeyD"]
            if (action) step(action)
            if (event.code === "ArrowLeft") look(-0.08, 0)
            if (event.code === "ArrowRight") look(0.08, 0)
            if (event.code === "ArrowUp") look(0, -0.08)
            if (event.code === "ArrowDown") look(0, 0.08)
          }
          keys.add(event.code)
        }
        if (event.code === "Escape") {
          resetInput()
          if (document.pointerLockElement === canvas) document.exitPointerLock()
        }
      },
      listenOptions,
    )
    window.addEventListener("keyup", (event) => keys.delete(event.code), listenOptions)
    window.addEventListener("blur", resetInput, listenOptions)
    canvas.addEventListener("blur", resetInput, listenOptions)
    document.addEventListener("visibilitychange", resetInput, listenOptions)
    let drag: { id: number; x: number; y: number } | undefined
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        canvas.focus()
        if (document.pointerLockElement !== canvas) {
          drag = { id: event.pointerId, x: event.clientX, y: event.clientY }
          canvas.setPointerCapture(event.pointerId)
        }
      },
      listenOptions,
    )
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (!drag || drag.id !== event.pointerId || paused) return
        look((event.clientX - drag.x) * 0.004, (event.clientY - drag.y) * 0.004)
        drag.x = event.clientX
        drag.y = event.clientY
      },
      listenOptions,
    )
    canvas.addEventListener(
      "pointerup",
      () => {
        drag = undefined
      },
      listenOptions,
    )
    canvas.addEventListener(
      "pointercancel",
      () => {
        drag = undefined
      },
      listenOptions,
    )
    document.addEventListener(
      "mousemove",
      (event) => {
        if (document.pointerLockElement === canvas && !paused)
          look(event.movementX * 0.002, event.movementY * 0.002)
      },
      listenOptions,
    )
    document.addEventListener(
      "pointerlockchange",
      () => {
        resetInput()
        callbacks.mode(
          document.pointerLockElement === canvas
            ? "Mouse aktif · Esc untuk keluar"
            : "Geser layar untuk melihat",
        )
      },
      listenOptions,
    )
    document.addEventListener(
      "pointerlockerror",
      () => callbacks.mode("Mouse bebas tidak tersedia. Geser layar untuk melihat."),
      listenOptions,
    )
    canvas.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault()
        paused = true
        resetInput()
        callbacks.error("Tampilan 3D terhenti. Muat ulang scene untuk melanjutkan.")
      },
      listenOptions,
    )
    const resize = () => {
      renderer.setPixelRatio(Math.min(devicePixelRatio, light ? 1 : 1.5))
      renderer.setSize(host.clientWidth, host.clientHeight)
      camera.aspect = host.clientWidth / Math.max(1, host.clientHeight)
      camera.updateProjectionMatrix()
    }
    host.appendChild(canvas)
    host.appendChild(labels)
    resize()
    observer = new ResizeObserver(resize)
    observer.observe(host)
    let lastFrame = 0,
      elapsed = 0,
      statsTime = 0,
      frames = 0
    const tick = (time: number) => {
      if (disposed) return
      frameId = requestAnimationFrame(tick)
      if (paused || document.hidden) {
        lastFrame = time
        statsTime = time
        frames = 0
        return
      }
      if (time - lastFrame < 1000 / (light ? 30 : 60) - 1) return
      const dt = Math.min((time - lastFrame) / 1000, 0.05)
      lastFrame = time
      const forward =
        Number(keys.has("KeyW") || moves.has("forward")) -
        Number(keys.has("KeyS") || moves.has("backward"))
      const right =
        Number(keys.has("KeyD") || moves.has("right")) -
        Number(keys.has("KeyA") || moves.has("left"))
      if (forward || right) travel(forward, right, dt * 1.5)
      if (keys.has("ArrowLeft")) look(-dt, 0)
      if (keys.has("ArrowRight")) look(dt, 0)
      if (keys.has("ArrowUp")) look(0, -dt)
      if (keys.has("ArrowDown")) look(0, dt)
      if (animated && motion) {
        elapsed += dt
        const f = (elapsed * motion.fps) % motion.frames
        const a = Math.floor(f),
          b = (a + 1) % motion.frames
        for (const { node, samples } of tracks) {
          const sa = samples[a],
            sb = samples[b]
          if (!node || !sa || !sb) continue
          pa.fromArray(sa.p)
          pb.fromArray(sb.p)
          pa.lerp(pb, f - a)
          node.position.set(pa.x, pa.z, -pa.y)
          qa.fromArray(sa.q)
          qb.fromArray(sb.q)
          qa.slerp(qb, f - a)
          node.quaternion.copy(conversion).multiply(qa).multiply(inverseConversion)
        }
      }
      renderer.render(scene, camera)
      updateMarkers()
      frames++
      if (time - statsTime > 1200) {
        callbacks.fps(Math.round((frames * 1000) / (time - statsTime)))
        frames = 0
        statsTime = time
      }
    }
    renderer.render(scene, camera)
    frameId = requestAnimationFrame(tick)
    callbacks.progress(100)
    return {
      dispose,
      selectComponent,
      movement: (action, pressed) => {
        if (pressed) moves.add(action)
        else moves.delete(action)
      },
      step,
      look,
      viewpoint,
      pause: (value) => {
        paused = value
        resetInput()
        if (value && document.pointerLockElement === canvas) document.exitPointerLock()
      },
      animate: (value) => {
        animated = value
      },
      quality: (value) => {
        light = value
        resize()
      },
      lock: () => {
        canvas.focus()
        if (!canvas.requestPointerLock) {
          callbacks.mode("Geser layar untuk melihat.")
          return
        }
        try {
          const result = canvas.requestPointerLock()
          result?.catch(() =>
            callbacks.mode("Geser layar untuk melihat; mouse bebas tidak tersedia."),
          )
        } catch {
          callbacks.mode("Geser layar untuk melihat; mouse bebas tidak tersedia.")
        }
      },
    }
  } catch (error) {
    dispose()
    throw error
  }
}
