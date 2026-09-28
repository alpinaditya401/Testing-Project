import assert from "node:assert/strict"
import { test } from "node:test"
import { moveWithBarrier } from "./navigation.ts"

const box = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
test("a long step cannot tunnel through the aquarium", () => {
  const p = moveWithBarrier({ x: 0, z: 3 }, 0, -6, box)
  assert.ok(p.z >= 1)
})
test("walking diagonally slides along the side instead of entering the model", () => {
  const p = moveWithBarrier({ x: -1.2, z: 0 }, 0.7, 0.5, box)
  assert.ok(p.x <= -1)
  assert.ok(Math.abs(p.z - 0.5) < 0.001)
})
test("the viewing area bounds hold for long travel", () => {
  const p = moveWithBarrier({ x: 3, z: 3 }, 20, 20, box)
  assert.equal(p.x, 8)
  assert.equal(p.z, 8)
})
