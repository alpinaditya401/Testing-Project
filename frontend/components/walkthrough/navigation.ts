export type Position2 = { x: number; z: number }
export type Barrier = { minX: number; maxX: number; minZ: number; maxZ: number }
export function moveWithBarrier(
  position: Position2,
  dx: number,
  dz: number,
  barrier: Barrier,
  radius = 8,
): Position2 {
  const next = { ...position }
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.08))
  const blocked = (x: number, z: number) =>
    x > barrier.minX && x < barrier.maxX && z > barrier.minZ && z < barrier.maxZ
  for (let i = 0; i < count; i++) {
    const x = Math.max(-radius, Math.min(radius, next.x + dx / count))
    if (!blocked(x, next.z)) next.x = x
    const z = Math.max(-radius, Math.min(radius, next.z + dz / count))
    if (!blocked(next.x, z)) next.z = z
  }
  return next
}
