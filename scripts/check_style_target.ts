import { buildPath, sampleAtS } from "../controllers/baseline/path"
import { loadTracks } from "../app/playground/loadTracks"
import { StyleParamController, defaultStyleParamConfig } from "../controllers/style-param"
import type { TrackDefinition } from "../app/playground/types"

function pointInOrientedRect(rect: { x: number; y: number; yaw: number; length: number; width: number }, point: { x: number; y: number }) {
  const dx = point.x - rect.x
  const dy = point.y - rect.y
  const cos = Math.cos(rect.yaw)
  const sin = Math.sin(rect.yaw)
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos
  const halfL = rect.length / 2
  const halfW = rect.width / 2
  return Math.abs(localX) <= halfL && Math.abs(localY) <= halfW
}

async function findTrack(id: string): Promise<TrackDefinition | null> {
  const tracks = await loadTracks()
  return tracks.find((t: TrackDefinition) => t.id === id) ?? null
}

async function main() {
  const accel = await findTrack("acceleration")
  if (!accel) {
    console.error("acceleration track not found")
    process.exit(1)
  }
  const path = buildPath(accel)
  const controller = new StyleParamController(defaultStyleParamConfig)
  const startPose = accel.metadata.startPose ?? { position: { x: 0, y: 0 }, yaw: 0 }
  const state = { x: startPose.position.x, y: startPose.position.y, psi: startPose.yaw, v: 0 }
  const dt = 0.02
  const output = controller.step({ state, path, dt })
  const targetPoint = sampleAtS(path, output.lookahead.steerS).point
  const rect = { x: state.x, y: state.y, yaw: state.psi, length: 4.5, width: 1.8 }
  const inside = pointInOrientedRect(rect, targetPoint)
  console.log({
    baseS: output.lookahead.baseS,
    steerS: output.lookahead.steerS,
    steerOffset: output.lookahead.steerOffset,
    targetPoint,
    rect,
    pathLength: path.length,
    sampleForward1: sampleAtS(path, output.lookahead.baseS + 1).point,
    startPose,
  })
  if (inside) {
    console.error("FAIL: target inside footprint", targetPoint)
    process.exit(1)
  }
  console.log("PASS: target outside footprint", targetPoint)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
