'use client'

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { FiAlertTriangle, FiFlag, FiMap, FiRefreshCcw, FiTarget } from "react-icons/fi"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ConfigManager, type Fetcher } from "@/velox/io/ConfigManager"
import {
  ControlMode,
  ModelType,
  SimulationDaemon,
  UserInputLimits,
} from "@/velox/simulation/SimulationDaemon"
import type { SimulationTelemetry } from "@/velox/telemetry"
import { SimulationTelemetryState } from "@/velox/telemetry"
import { MpccControllerClient, toMpccTrack } from "@/controllers/mpcc"
import type { MpccConfig, MpccControl, MpccState } from "@/controllers/mpcc"

import type { TrackDefinition, VehicleOption, VeloxConfigBundle, Vec2 } from "./types"
import { Separator } from "@/components/ui/separator"

type ControlState = {
  throttle: number
  brake: number
  steering: number
}

type InputSample = ControlState & { t: number }

type ConeState = {
  id: string
  tag: string
  radius: number
  x: number
  y: number
  vx: number
  vy: number
  hits: number
}

type TrackProgress = {
  laps: number
  checkpointsHit: Set<string>
  lastStartAt?: number
  lastFinishAt?: number
}

type TrackTransform = {
  scale: number
  originX: number
  originY: number
  padding: number
}

const fallbackTrackScalePx = 12
const trackSizePx = 620
const defaultLimits = new UserInputLimits({
  min_throttle: 0,
  max_throttle: 1,
  min_brake: 0,
  max_brake: 1,
  min_steering_nudge: -3.5,
  max_steering_nudge: 3.5,
  min_steering_rate: -3.5,
  max_steering_rate: 3.5,
  min_accel: -6,
  max_accel: 4,
})
const defaultMpccConfig: MpccConfig = {
  horizon_steps: 32,
  dt: 0.05,
  weights: {
    progress: 6,
    lateral: 8,
    heading: 4,
    curvature: 0.6,
    input: 0.2,
    rate: 0.05,
    slack: 10,
  },
  bounds: {
    steering_rate: defaultLimits.max_steering_rate,
    acceleration: { min: defaultLimits.min_accel, max: defaultLimits.max_accel },
    slack: 2,
  },
  vehicle: { wheelbase: 0.3, l_r: 0.17 },
  warm_start: true,
}
type VehicleControlMode = "manual" | "mpcc" | "style"

const DEG_PER_RAD = 180 / Math.PI

const toDegrees = (radians: number) => radians * DEG_PER_RAD
const worldToScreenDeg = (radians: number) => -toDegrees(radians)

const GRID_SPACING_M = 2
const DEFAULT_VEHICLE_LENGTH = 4.5
const DEFAULT_VEHICLE_WIDTH = 1.8
const MAX_TRACE_POINTS = 140
const DEFAULT_TRACK_SPAN = 60
const MIN_ZOOM = 0.4
const MAX_ZOOM = 3.2

const coneColors: Record<string, string> = {
  blue: "#38bdf8",
  yellow: "#fbbf24",
  orange: "#fb923c",
  unknown: "#e5e7eb",
}

type OrientedRect = {
  x: number
  y: number
  yaw: number
  length: number
  width: number
}

type CircleShape = {
  x: number
  y: number
  radius: number
}

const clampValue = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

function mpccControlToControlState(command: MpccControl, config: MpccConfig): ControlState {
  const accelBounds = config.bounds.acceleration
  const accelMax = Math.max(Math.abs(accelBounds.max ?? defaultLimits.max_accel), 1e-6)
  const accelMin = Math.max(Math.abs(accelBounds.min ?? defaultLimits.min_accel), 1e-6)
  const accel = command.acceleration ?? 0
  const throttle = accel > 0 ? accel / accelMax : 0
  const brake = accel < 0 ? Math.abs(accel) / accelMin : 0
  return {
    throttle: clampValue(throttle, 0, 1),
    brake: clampValue(brake, 0, 1),
    steering: command.steering_rate ?? 0,
  }
}

function computeTransform(
  track: TrackDefinition,
  size: { width: number; height: number },
  scale: number,
  focus?: Vec2
): TrackTransform {
  const padding = 32
  const innerWidth = Math.max(size.width - padding * 2, 1)
  const innerHeight = Math.max(size.height - padding * 2, 1)
  const bounds = track.metadata.bounds
  const finalScale =
    scale ||
    Math.min(innerWidth / Math.max(bounds.width, 1), innerHeight / Math.max(bounds.height, 1))
  const center = focus ?? bounds.center
  const originX = padding + innerWidth / 2 - center.x * finalScale
  const originY = padding + innerHeight / 2 + center.y * finalScale
  return { scale: finalScale, originX, originY, padding }
}

function worldToScreen(transform: TrackTransform, point: Vec2) {
  return {
    x: transform.originX + point.x * transform.scale,
    y: transform.originY - point.y * transform.scale,
  }
}

function screenToWorld(transform: TrackTransform, point: Vec2) {
  return {
    x: (point.x - transform.originX) / transform.scale,
    y: -(point.y - transform.originY) / transform.scale,
  }
}

function computeBaseScale(tracks: TrackDefinition[], size: { width: number; height: number }): number {
  const padding = 32
  const innerWidth = Math.max(size.width - padding * 2, 1)
  const innerHeight = Math.max(size.height - padding * 2, 1)
  const maxSpan =
    tracks.reduce((acc, track) => Math.max(acc, track.metadata.bounds.span), DEFAULT_TRACK_SPAN) ||
    DEFAULT_TRACK_SPAN
  const scale = Math.min(innerWidth / maxSpan, innerHeight / maxSpan)
  return Math.max(4, Math.min(scale || fallbackTrackScalePx, fallbackTrackScalePx * 3))
}

function segmentsIntersect(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2) {
  const orient = (a: Vec2, b: Vec2, c: Vec2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const o1 = orient(p1, p2, q1)
  const o2 = orient(p1, p2, q2)
  const o3 = orient(q1, q2, p1)
  const o4 = orient(q1, q2, p2)

  if (o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0) return false
  return (o1 <= 0 && o2 >= 0 || o1 >= 0 && o2 <= 0) && (o3 <= 0 && o4 >= 0 || o3 >= 0 && o4 <= 0)
}

function lineCrossed(prev: Vec2 | null, next: Vec2, line?: { a: Vec2; b: Vec2 }) {
  if (!line || !prev) return false
  return segmentsIntersect(prev, next, line.a, line.b)
}

function rectCircleCollision(rect: OrientedRect, circle: CircleShape) {
  const dx = circle.x - rect.x
  const dy = circle.y - rect.y
  const cos = Math.cos(rect.yaw)
  const sin = Math.sin(rect.yaw)
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos
  const halfL = rect.length / 2
  const halfW = rect.width / 2
  const clampedX = clampValue(localX, -halfL, halfL)
  const clampedY = clampValue(localY, -halfW, halfW)
  const diffX = localX - clampedX
  const diffY = localY - clampedY
  let distSq = diffX * diffX + diffY * diffY
  const r = circle.radius

  if (distSq > r * r) {
    return { hit: false, push: { x: 0, y: 0 }, depth: 0 }
  }

  if (distSq === 0) {
    distSq = 1e-6
  }

  const dist = Math.sqrt(distSq)
  const overlap = r - dist
  const nx = diffX / dist || (localX >= 0 ? 1 : -1)
  const ny = diffY / dist || (localY >= 0 ? 1 : -1)
  const worldNx = nx * cos - ny * sin
  const worldNy = nx * sin + ny * cos

  return {
    hit: true,
    push: { x: worldNx * overlap, y: worldNy * overlap },
    depth: overlap,
  }
}

function pointInOrientedRect(rect: OrientedRect, point: Vec2): boolean {
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

function updateConeDynamics(cones: ConeState[], rect: OrientedRect, dt: number) {
  const drag = 0.9
  const maxSpeed = 18
  let hits = 0
  const updated = cones.map((cone) => {
    let vx = cone.vx * drag
    let vy = cone.vy * drag
    let x = cone.x + vx * dt
    let y = cone.y + vy * dt

    const collision = rectCircleCollision(rect, { x, y, radius: cone.radius })
    if (collision.hit) {
      hits += 1
      vx += collision.push.x * 6
      vy += collision.push.y * 6
      x += collision.push.x * 0.6
      y += collision.push.y * 0.6
    }

    const speed = Math.hypot(vx, vy)
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed
      vx *= scale
      vy *= scale
    }

    return { ...cone, x, y, vx, vy, hits: cone.hits + (collision.hit ? 1 : 0) }
  })

  return { cones: updated, hits }
}

function createLocalFetcher(bundle: VeloxConfigBundle): Fetcher {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const method =
      (init?.method ??
        (input instanceof Request ? input.method : undefined) ??
        "GET")?.toUpperCase() || "GET"
    const url = new URL(input instanceof Request ? input.url : input.toString())
    const path = url.pathname.replace(/^\//, "")
    const bucket =
      url.hostname.includes("parameter") || url.hostname.includes("parameters")
        ? bundle.parameterFiles
        : bundle.configFiles

    if (method === "HEAD") {
      return new Response(null, { status: 200 })
    }

    const body = bucket[path]
    if (!body) {
      return new Response(null, { status: 404, statusText: `Missing config: ${path}` })
    }

    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/plain" },
    })
  }
}

function cloneTelemetry(telemetry: SimulationTelemetry): SimulationTelemetry {
  return {
    pose: { ...telemetry.pose },
    velocity: { ...telemetry.velocity },
    acceleration: { ...telemetry.acceleration },
    traction: { ...telemetry.traction },
    steering: { ...telemetry.steering },
    controller: { ...telemetry.controller },
    powertrain: { ...telemetry.powertrain },
    front_axle: {
      ...telemetry.front_axle,
      left: { ...telemetry.front_axle.left },
      right: { ...telemetry.front_axle.right },
    },
    rear_axle: {
      ...telemetry.rear_axle,
      left: { ...telemetry.rear_axle.left },
      right: { ...telemetry.rear_axle.right },
    },
    totals: { ...telemetry.totals },
    detector_severity: telemetry.detector_severity,
    safety_stage: telemetry.safety_stage,
    detector_forced: telemetry.detector_forced,
    low_speed_engaged: telemetry.low_speed_engaged,
  }
}

function renderSummary(vehicle: VehicleOption): string {
  const parts = []
  if (vehicle.summary.massKg) parts.push(`${vehicle.summary.massKg.toFixed(0)} kg`)
  if (vehicle.summary.lengthM && vehicle.summary.widthM) {
    parts.push(`${vehicle.summary.lengthM.toFixed(2)} m × ${vehicle.summary.widthM.toFixed(2)} m`)
  }
  return parts.join(" · ")
}

function buildConeState(track?: TrackDefinition): ConeState[] {
  if (!track) return []
  return track.cones
    .filter((cone) => {
      const tag = cone.tag.toLowerCase()
      return tag === "blue" || tag === "yellow"
    })
    .map((cone) => ({
      ...cone,
      vx: 0,
      vy: 0,
      hits: 0,
    }))
}

function emptyProgress(): TrackProgress {
  return {
    laps: 0,
    checkpointsHit: new Set<string>(),
    lastStartAt: undefined,
    lastFinishAt: undefined,
  }
}

function footprintFromVehicle(vehicle?: VehicleOption) {
  return {
    length: vehicle?.summary.lengthM ?? DEFAULT_VEHICLE_LENGTH,
    width: vehicle?.summary.widthM ?? DEFAULT_VEHICLE_WIDTH,
  }
}

function formatCoord(value: number) {
  return value.toFixed(2)
}

function buildInitialStateFromPose(pose?: { position: Vec2; yaw: number }): number[] {
  if (!pose) return []
  const { position, yaw } = pose
  return [position.x, position.y, yaw, 0, 0]
}

export function VeloxPlayground({ bundle }: { bundle: VeloxConfigBundle }) {
  const primaryVehicle = bundle.vehicles[0]
  const vehicleId = primaryVehicle?.id ?? 2
  const model = ModelType.ST

  const [telemetry, setTelemetry] = useState<SimulationTelemetry>(new SimulationTelemetryState())
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const [trace, setTrace] = useState<Array<{ x: number; y: number }>>([])
  const [inputHistory, setInputHistory] = useState<InputSample[]>([])
  const [trackSize, setTrackSize] = useState({ width: trackSizePx, height: (trackSizePx * 3) / 4 })
  const [zoom, setZoom] = useState(1)
  const [baseScale, setBaseScale] = useState(fallbackTrackScalePx)
  const [followCar, setFollowCar] = useState(false)
  const [controlModeSelection, setControlModeSelection] = useState<VehicleControlMode>("manual")
  const [mpccStatus, setMpccStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [mpccError, setMpccError] = useState<string | null>(null)
  const [mpccHorizon, setMpccHorizon] = useState<Vec2[]>([])
  const [mpccCommand, setMpccCommand] = useState<MpccControl>({ steering_rate: 0, acceleration: 0 })
  const [mpccConfig, setMpccConfig] = useState<MpccConfig>(defaultMpccConfig)
  const tracks = bundle.tracks
  const initialTrack = tracks[0]
  const [selectedTrackId, setSelectedTrackId] = useState<string>(initialTrack?.id ?? "empty")
  const selectedTrack = useMemo(
    () => tracks.find((track) => track.id === selectedTrackId) ?? tracks[0] ?? initialTrack,
    [initialTrack, selectedTrackId, tracks]
  )
  const [cones, setCones] = useState<ConeState[]>(() => buildConeState(initialTrack))
  const [coneHits, setConeHits] = useState(0)
  const [progress, setProgress] = useState<TrackProgress>(() => emptyProgress())
  const [hoverWorld, setHoverWorld] = useState<Vec2 | null>(null)
  const [cameraFocus, setCameraFocus] = useState<Vec2 | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const vehicleFootprint = useMemo(() => footprintFromVehicle(primaryVehicle), [primaryVehicle])
  const transform = useMemo(() => {
    const track = selectedTrack ?? initialTrack ?? tracks[0]
    const manualFocus = cameraFocus ?? track?.metadata.bounds.center
    const focus = followCar ? { x: telemetry.pose.x, y: telemetry.pose.y } : manualFocus
    return computeTransform(track, trackSize, baseScale * zoom, focus)
  }, [baseScale, cameraFocus, followCar, initialTrack, selectedTrack, telemetry.pose.x, telemetry.pose.y, trackSize, tracks, zoom])
  const simControlMode = controlModeSelection === "mpcc" ? ControlMode.MPCC : ControlMode.Keyboard
  const mpccTrack = useMemo(() => (selectedTrack ? toMpccTrack(selectedTrack) : null), [selectedTrack])

  const loopCancelRef = useRef<(() => void) | null>(null)
  const simRef = useRef<SimulationDaemon | null>(null)
  const inputRef = useRef<ControlState>({ throttle: 0, brake: 0, steering: 0 })
  const lastFrameRef = useRef<number>(0)
  const resetRef = useRef<(() => void) | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const panOriginRef = useRef<{ start: Vec2; focus: Vec2 } | null>(null)
  const inputHistoryRef = useRef<InputSample[]>([])
  const lastPoseRef = useRef<Vec2 | null>(null)
  const telemetryRef = useRef<SimulationTelemetry>(telemetry)
  const mpccClientRef = useRef<MpccControllerClient | null>(null)
  const mpccCommandRef = useRef<MpccControl>({ steering_rate: 0, acceleration: 0 })
  const mpccConfigRef = useRef<MpccConfig>(defaultMpccConfig)
  const mpccUpdatePeriodRef = useRef<number>(defaultMpccConfig.dt)
  const mpccLastUpdateRef = useRef<number>(0)
  const mpccStatusRef = useRef<"idle" | "loading" | "ready" | "error">(mpccStatus)
  const mpccPendingRef = useRef<Promise<unknown> | null>(null)
  const mpccTrackIdRef = useRef<string | null>(null)
  const inputHistoryWindowSeconds = 12

  const fetcher = useMemo(() => createLocalFetcher(bundle), [bundle])

  const resetMpccOutputs = useCallback(() => {
    mpccCommandRef.current = { steering_rate: 0, acceleration: 0 }
    setMpccCommand({ steering_rate: 0, acceleration: 0 })
    setMpccHorizon([])
  }, [])

  const updateMpccWeight = useCallback(
    (key: keyof MpccConfig["weights"], value: number) => {
      setMpccConfig((prev) => ({
        ...prev,
        weights: { ...prev.weights, [key]: value },
      }))
    },
    []
  )

  const updateMpccConfigValue = useCallback((key: "dt" | "horizon_steps", value: number) => {
    setMpccConfig((prev) => ({
      ...prev,
      [key]: key === "horizon_steps" ? Math.round(value) : value,
    }))
  }, [])

  const updateMpccSteeringRate = useCallback((value: number) => {
    setMpccConfig((prev) => ({
      ...prev,
      bounds: { ...prev.bounds, steering_rate: value },
    }))
  }, [])

  const updateMpccAccelerationBound = useCallback(
    (bound: "min" | "max", value: number) => {
      setMpccConfig((prev) => {
        const accel = { ...prev.bounds.acceleration }
        if (bound === "min") {
          accel.min = Math.min(value, accel.max - 0.05)
        } else {
          accel.max = Math.max(value, accel.min + 0.05)
        }
        return { ...prev, bounds: { ...prev.bounds, acceleration: accel } }
      })
    },
    []
  )

  const handleKeyState = useCallback((keys: Set<string>) => {
    const has = (target: string[]) => target.some((key) => keys.has(key))
    const steeringDir =
      (has(["arrowleft", "a"]) ? -1 : 0) + (has(["arrowright", "d"]) ? 1 : 0)
    const steering = steeringDir * defaultLimits.max_steering_nudge
    const throttle = has(["w", "arrowup"]) ? 1 : 0
    const brake = has(["s", "arrowdown", " "]) ? 1 : 0
    inputRef.current = {
      throttle,
      brake,
      steering: steering,
    }
  }, [])

  useEffect(() => {
    const keys = new Set<string>()
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
        event.preventDefault()
      }
      if (key === "r" && !event.repeat) {
        event.preventDefault()
        resetRef.current?.()
      }
      keys.add(key)
      handleKeyState(keys)
    }
    const up = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      keys.delete(key)
      handleKeyState(keys)
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [handleKeyState])

  const stopLoop = useCallback(() => {
    loopCancelRef.current?.()
    loopCancelRef.current = null
  }, [])

  const recordInputHistory = useCallback(
    (timestampSec: number, controls: ControlState) => {
      const windowStart = timestampSec - inputHistoryWindowSeconds
      const sample: InputSample = { t: timestampSec, ...controls }
      const nextHistory = [...inputHistoryRef.current, sample].filter((point) => point.t >= windowStart)
      inputHistoryRef.current = nextHistory
      setInputHistory(nextHistory)
    },
    [inputHistoryWindowSeconds]
  )

  const buildMpccState = useCallback(
    (snap: SimulationTelemetry): MpccState => {
      return {
        x: snap.pose.x,
        y: snap.pose.y,
        psi: snap.pose.yaw ?? 0,
        v: snap.velocity.speed ?? 0,
        delta: snap.steering.actual_angle ?? 0,
      }
    },
    []
  )

  const requestMpccUpdate = useCallback(
    async (snap: SimulationTelemetry, timestampSec: number) => {
      if (controlModeSelection !== "mpcc" || mpccStatusRef.current !== "ready") return
      if (timestampSec - mpccLastUpdateRef.current < mpccUpdatePeriodRef.current - 1e-4) return
      mpccLastUpdateRef.current = timestampSec
      const client = mpccClientRef.current
      if (!client) return
      try {
        const pending = client.step(buildMpccState(snap), timestampSec)
        mpccPendingRef.current = pending
        const result = await pending
        mpccCommandRef.current = result.control
        setMpccCommand(result.control)
        setMpccHorizon(result.horizon.map((pt) => pt.position))
      } catch (err) {
        const message = err instanceof Error ? err.message : "MPCC solve failed"
        setMpccError(message)
        setMpccStatus("error")
      } finally {
        mpccPendingRef.current = null
      }
    },
    [buildMpccState, controlModeSelection]
  )

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const local = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      setHoverWorld(screenToWorld(transform, local))
      if (!isPanning || !panOriginRef.current) return
      event.preventDefault()
      const delta = { x: local.x - panOriginRef.current.start.x, y: local.y - panOriginRef.current.start.y }
      const deltaWorld = { x: -delta.x / transform.scale, y: delta.y / transform.scale }
      const baseFocus = panOriginRef.current.focus
      setCameraFocus({
        x: baseFocus.x + deltaWorld.x,
        y: baseFocus.y + deltaWorld.y,
      })
    },
    [isPanning, transform]
  )

  const stopPanning = useCallback(() => {
    setIsPanning(false)
    panOriginRef.current = null
  }, [])

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      const rect = event.currentTarget.getBoundingClientRect()
      const local = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      const fallbackCenter = selectedTrack?.metadata.bounds.center ?? { x: 0, y: 0 }
      const currentFocus = followCar
        ? { x: telemetry.pose.x, y: telemetry.pose.y }
        : cameraFocus ?? fallbackCenter
      panOriginRef.current = { start: local, focus: currentFocus }
      setCameraFocus(currentFocus)
      setFollowCar(false)
      setIsPanning(true)
    },
    [cameraFocus, followCar, selectedTrack?.metadata.bounds.center, telemetry.pose.x, telemetry.pose.y]
  )

  const handleMouseUp = useCallback(() => {
    stopPanning()
  }, [stopPanning])

  const handleMouseLeave = useCallback(() => {
    setHoverWorld(null)
    stopPanning()
  }, [stopPanning])

  useEffect(() => {
    const node = trackRef.current
    if (!node) return
    const wheelHandler = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const delta = -event.deltaY
      const step = delta > 0 ? 0.08 : -0.08
      setZoom((z) => clampValue(z + step, MIN_ZOOM, MAX_ZOOM))
    }
    node.addEventListener("wheel", wheelHandler, { passive: false })
    return () => node.removeEventListener("wheel", wheelHandler)
  }, [])

  const startLoop = useCallback(() => {
    stopLoop()
    let cancelled = false
    const tick = async (time: number) => {
      if (cancelled || !simRef.current) return
      const timestampSec = time / 1000
      const dtCandidate = (time - lastFrameRef.current) / 1000
      const dt = Math.min(Math.max(dtCandidate, 0.005), 0.05)
      lastFrameRef.current = time
      try {
        if (simControlMode === ControlMode.MPCC) {
          await requestMpccUpdate(telemetryRef.current, timestampSec)
        }
        const mpccControl = mpccControlToControlState(mpccCommandRef.current, mpccConfigRef.current)
        const next = await simRef.current.step(
          simControlMode === ControlMode.MPCC
            ? {
                control_mode: ControlMode.MPCC,
                longitudinal: { throttle: 0, brake: 0 },
                steering_rate: mpccCommandRef.current.steering_rate,
                acceleration: mpccCommandRef.current.acceleration,
                timestamp: timestampSec,
                dt,
              }
            : {
                control_mode: ControlMode.Keyboard,
                longitudinal: {
                  throttle: inputRef.current.throttle,
                  brake: inputRef.current.brake,
                },
                steering_nudge: inputRef.current.steering,
                timestamp: timestampSec,
                dt,
              }
        )
        const carRect: OrientedRect = {
          x: next.pose.x,
          y: next.pose.y,
          yaw: next.pose.yaw,
          length: vehicleFootprint.length,
          width: vehicleFootprint.width,
        }

        setCones((prev) => {
          const { cones: nextCones, hits } = updateConeDynamics(prev, carRect, dt)
          if (hits > 0) {
            setConeHits((count) => count + hits)
          }
          return nextCones
        })

        const updatedTelemetry = cloneTelemetry(next)
        setTelemetry(updatedTelemetry)
        telemetryRef.current = updatedTelemetry
        const currentPose = { x: next.pose.x, y: next.pose.y }
        setTrace((prev) => {
          const nextTrace = [...prev, currentPose]
          return nextTrace.slice(-MAX_TRACE_POINTS)
        })
        const controlSample = simControlMode === ControlMode.MPCC ? mpccControl : inputRef.current
        recordInputHistory(timestampSec, controlSample)
        setProgress((prev) => {
          const checkpoints = selectedTrack?.metadata.checkpoints ?? []
          const isLoop = selectedTrack?.metadata.isLoop ?? false
          const sameLine = isLoop && selectedTrack?.metadata.startLine === selectedTrack?.metadata.finishLine
          const nextState: TrackProgress = {
            laps: prev.laps,
            checkpointsHit: new Set(prev.checkpointsHit),
            lastStartAt: prev.lastStartAt,
            lastFinishAt: prev.lastFinishAt,
          }
          let changed = false

          if (lineCrossed(lastPoseRef.current, currentPose, selectedTrack?.metadata.startLine)) {
            nextState.checkpointsHit.clear()
            nextState.lastStartAt = next.totals.simulation_time_s
            changed = true
          }

          for (const cp of checkpoints) {
            if (nextState.checkpointsHit.has(cp.id)) continue
            const dx = currentPose.x - cp.position.x
            const dy = currentPose.y - cp.position.y
            const dist = Math.hypot(dx, dy)
            if (dist <= cp.radius) {
              nextState.checkpointsHit.add(cp.id)
              changed = true
            }
          }

          if (
            lineCrossed(lastPoseRef.current, currentPose, selectedTrack?.metadata.finishLine) &&
            (sameLine
              ? nextState.lastStartAt !== undefined &&
                next.totals.simulation_time_s - (nextState.lastStartAt ?? 0) > 0.4
              : nextState.lastStartAt !== undefined || selectedTrack?.isEmpty)
          ) {
            nextState.laps += 1
            nextState.lastFinishAt = next.totals.simulation_time_s
            nextState.checkpointsHit.clear()
            changed = true
          }

          return changed ? nextState : prev
        })
        lastPoseRef.current = currentPose
        setStatus((prev) => (prev === "ready" ? prev : "ready"))
      } catch (err) {
        const message = err instanceof Error ? err.message : "Simulation step failed"
        setError(message)
        setStatus("error")
        cancelled = true
        return
      }
      frame = requestAnimationFrame(tick)
    }

    let frame = requestAnimationFrame((time) => {
      lastFrameRef.current = time
      tick(time)
    })

    loopCancelRef.current = () => {
      cancelled = true
      if (frame) cancelAnimationFrame(frame)
    }
  }, [recordInputHistory, requestMpccUpdate, selectedTrack, simControlMode, stopLoop, vehicleFootprint])

  const rebuildDaemon = useCallback(async () => {
    stopLoop()
    setStatus("loading")
    setError(null)
    setTrace([])
    inputHistoryRef.current = []
    setInputHistory([])
    setCones(buildConeState(selectedTrack))
    setConeHits(0)
    setProgress(emptyProgress())
    lastPoseRef.current = null

    const configManager = new ConfigManager(bundle.configRoot, bundle.parameterRoot, fetcher)
    const daemon = new SimulationDaemon({
      model,
      vehicle_id: vehicleId,
      control_mode: simControlMode,
      config_manager: configManager,
      limits: defaultLimits,
      initial_state: buildInitialStateFromPose(selectedTrack?.metadata.startPose),
    })

    try {
      await daemon.ready
      simRef.current = daemon
      const snap = await daemon.snapshot()
      setTelemetry(cloneTelemetry(snap.telemetry))
      setStatus("ready")
      startLoop()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start the simulation daemon"
      setError(message)
      setStatus("error")
    }
  }, [bundle.configRoot, bundle.parameterRoot, fetcher, model, selectedTrack, simControlMode, startLoop, stopLoop, vehicleId])

  useEffect(() => {
    rebuildDaemon()
    return () => stopLoop()
  }, [rebuildDaemon, stopLoop])

  useEffect(() => {
    const node = trackRef.current
    if (!node) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      setTrackSize({ width, height })
    })

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setBaseScale(computeBaseScale(tracks, trackSize))
  }, [trackSize, tracks])

  useEffect(() => {
    if (!selectedTrack) return
    setCameraFocus(selectedTrack.metadata.bounds.center)
  }, [selectedTrack?.id])

  useEffect(() => {
    if (followCar) {
      setIsPanning(false)
      panOriginRef.current = null
    }
  }, [followCar])

  useEffect(() => {
    telemetryRef.current = telemetry
  }, [telemetry])

  useEffect(() => {
    if (controlModeSelection !== "mpcc") {
      mpccClientRef.current?.dispose()
      mpccClientRef.current = null
      resetMpccOutputs()
      mpccLastUpdateRef.current = 0
      setMpccStatus("idle")
      setMpccError(null)
      return
    }
    const currentTrackId = selectedTrack?.id ?? null
    if (mpccTrackIdRef.current && mpccTrackIdRef.current !== currentTrackId) {
      mpccPendingRef.current = null
      mpccClientRef.current?.dispose()
      mpccClientRef.current = null
      resetMpccOutputs()
      mpccLastUpdateRef.current = 0
      setMpccStatus("idle")
      setMpccError(null)
    }
    mpccTrackIdRef.current = currentTrackId
    if (!mpccTrack) {
      resetMpccOutputs()
      setMpccStatus("error")
      setMpccError("Selected track is missing MPCC map data")
      return
    }
    let cancelled = false
    const client = mpccClientRef.current ?? new MpccControllerClient()
    mpccClientRef.current = client
    const initClient = async () => {
      resetMpccOutputs()
      mpccLastUpdateRef.current = 0
      setMpccStatus("loading")
      setMpccError(null)
      if (mpccPendingRef.current) {
        try {
          await mpccPendingRef.current
        } catch {
          // ignore errors from the previous step while rebuilding the solver
        }
      }
      try {
        await client.init(mpccConfig, mpccTrack)
        if (cancelled) return
        setMpccStatus("ready")
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : "Failed to initialize MPCC"
        setMpccError(message)
        setMpccStatus("error")
      }
    }
    void initClient()

    return () => {
      cancelled = true
      if (controlModeSelection !== "mpcc") {
        client.dispose()
        mpccClientRef.current = null
      }
    }
  }, [controlModeSelection, mpccConfig, mpccTrack, resetMpccOutputs])

  useEffect(() => {
    mpccUpdatePeriodRef.current = mpccConfig.dt
    mpccConfigRef.current = mpccConfig
  }, [mpccConfig])

  useEffect(() => {
    mpccStatusRef.current = mpccStatus
  }, [mpccStatus])

  const pose = telemetry.pose
  const carScreen = worldToScreen(transform, pose)
  const yawDeg = toDegrees(pose.yaw)
  const headingDeg = worldToScreenDeg(pose.yaw)
  const speed = telemetry.velocity.speed ?? 0
  const accel = telemetry.acceleration.longitudinal ?? 0
  const slipVisualDeg = worldToScreenDeg(telemetry.traction.slip_angle ?? 0) * 0.1
  const renderRotationDeg = headingDeg
  const carScale = 0.9 + Math.min(Math.abs(speed) / 24, 0.35)
  const carLengthPx = clampValue(vehicleFootprint.length * transform.scale, 34, 240)
  const carWidthPx = clampValue(vehicleFootprint.width * transform.scale, 16, 140)
  const startLine = selectedTrack?.metadata.startLine
  const finishLine = selectedTrack?.metadata.finishLine
  const checkpoints = selectedTrack?.metadata.checkpoints ?? []
  const checkpointLabels = useMemo(
    () =>
      new Map<string, number>(
        checkpoints.map((cp, idx) => [cp.id, Number.isFinite(cp.order) ? cp.order : idx + 1])
      ),
    [checkpoints]
  )
  const startLineScreen = startLine ? { a: worldToScreen(transform, startLine.a), b: worldToScreen(transform, startLine.b) } : null
  const finishLineScreen = finishLine ? { a: worldToScreen(transform, finishLine.a), b: worldToScreen(transform, finishLine.b) } : null
  const gridSizePx = Math.max(12, GRID_SPACING_M * transform.scale)
  const checkpointsHit = progress.checkpointsHit
  const checkpointProgress = checkpoints.length > 0 ? Math.min(1, checkpointsHit.size / checkpoints.length) : 1
  const trackSpan = selectedTrack?.metadata.bounds.span ?? 0
  const carRect: OrientedRect = {
    x: pose.x,
    y: pose.y,
    yaw: pose.yaw,
    length: vehicleFootprint.length,
    width: vehicleFootprint.width,
  }
  const mpccHorizonPoints = mpccHorizon.map((pt) => worldToScreen(transform, pt))
  let hoverLabel: string | null = null
  if (hoverWorld) {
    if (pointInOrientedRect(carRect, hoverWorld)) {
      hoverLabel = "Car"
    }
    let nearestDist = hoverLabel ? 0 : Infinity
    checkpoints.forEach((cp, idx) => {
      const dx = hoverWorld.x - cp.position.x
      const dy = hoverWorld.y - cp.position.y
      const dist = Math.hypot(dx, dy)
      if (dist <= cp.radius && dist < nearestDist) {
        nearestDist = dist
        const label = checkpointLabels.get(cp.id) ?? cp.order ?? idx + 1
        const collected = checkpointsHit.has(cp.id)
        hoverLabel = `Checkpoint ${label}${collected ? " (collected)" : ""}`
      }
    })
    cones.forEach((cone) => {
      const dx = hoverWorld.x - cone.x
      const dy = hoverWorld.y - cone.y
      const dist = Math.hypot(dx, dy)
      if (dist <= cone.radius * 2 && dist < nearestDist) {
        nearestDist = dist
        const color = cone.tag.toLowerCase()
        hoverLabel = `${color} cone`
      }
    })
  }
  const statusTone =
    status === "ready"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100"
      : status === "error"
        ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-100"
        : "bg-amber-100 text-amber-700 dark:bg-amber-400/20 dark:text-amber-200"
  const statusLabel =
    status === "ready" ? "Live" : status === "loading" ? "Loading..." : status === "error" ? "Error" : "Paused"
  const vehicleSummary = primaryVehicle ? renderSummary(primaryVehicle) : ""
  const displayedControls =
    controlModeSelection === "mpcc"
      ? mpccControlToControlState(mpccCommand, mpccConfig)
      : inputRef.current
  const steeringMax =
    controlModeSelection === "mpcc" ? mpccConfig.bounds.steering_rate : defaultLimits.max_steering_nudge
  const steeringMin =
    controlModeSelection === "mpcc" ? -mpccConfig.bounds.steering_rate : defaultLimits.min_steering_nudge
  const steeringRange: [number, number] = [steeringMin, steeringMax]
  const steeringValueNormalized = clampValue(
    (displayedControls.steering - steeringMin) / Math.max(steeringMax - steeringMin, 1e-6),
    0,
    1
  )
  const steeringHint = `${displayedControls.steering.toFixed(2)} rad/s`

  const handleReset = useCallback(async () => {
    if (!simRef.current) return
    stopLoop()
    inputHistoryRef.current = []
    setInputHistory([])
    setCones(buildConeState(selectedTrack))
    setConeHits(0)
    setProgress(emptyProgress())
    lastPoseRef.current = null
    resetMpccOutputs()
    await simRef.current.reset({
      vehicle_id: vehicleId,
      model,
      control_mode: simControlMode,
      initial_state: buildInitialStateFromPose(selectedTrack?.metadata.startPose),
    })
    const snap = await simRef.current.snapshot()
    setTelemetry(cloneTelemetry(snap.telemetry))
    setTrace([])
    startLoop()
  }, [model, resetMpccOutputs, selectedTrack, simControlMode, startLoop, stopLoop, vehicleId])

  useEffect(() => {
    resetRef.current = handleReset
  }, [handleReset])

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="rounded-3xl border bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 shadow-lg ring-1 ring-white/10">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-3xl font-semibold uppercase tracking-[0.2em] text-emerald-300">Simulation  Playground</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-200">
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 font-semibold text-emerald-200">Real-time loop</span>
            <span className="rounded-full bg-sky-500/20 px-3 py-1 font-semibold text-sky-100">Framer Motion visuals</span>
            <span
              className={cn(
                "rounded-full px-3 py-1 font-semibold",
                statusTone
              )}
            >
              {statusLabel}
            </span>
          </div>
        </div>
        <Separator className="my-4 border-white/10" />
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-200">
          <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Control mode</span>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={controlModeSelection === "manual" ? "default" : "outline"}
              className="border-white/10"
              onClick={() => setControlModeSelection("manual")}
            >
              Manual (Keyboard)
            </Button>
            <Button
              size="sm"
              variant={controlModeSelection === "mpcc" ? "default" : "outline"}
              className="border-white/10"
              onClick={() => setControlModeSelection("mpcc")}
            >
              MPCC (beta)
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled
              className="border-white/10 opacity-70"
              onClick={() => setControlModeSelection("style")}
            >
              Style Param (soon)
            </Button>
          </div>
          {controlModeSelection === "mpcc" && (
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                mpccStatus === "ready"
                  ? "bg-emerald-500/20 text-emerald-100"
                  : mpccStatus === "loading"
                    ? "bg-amber-500/20 text-amber-100"
                : "bg-rose-500/20 text-rose-100"
              )}
            >
              MPCC {mpccStatus}
            </span>
          )}
          {mpccError && (
            <span className="text-xs font-medium text-rose-200"> {mpccError}</span>
          )}
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 shadow-inner ring-1 ring-white/5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-400">Track space · {selectedTrack?.label ?? "No track"}</p>
                <p className="text-lg font-semibold text-white">
                  {primaryVehicle?.label ?? "BMW 320i"} · {model}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-200">
                <span className="rounded-full bg-white/5 px-3 py-1">W/S throttle</span>
                <span className="rounded-full bg-white/5 px-3 py-1">A/D steer</span>
                <span className="rounded-full bg-white/5 px-3 py-1">Space brake</span>
              </div>
            </div>
            <div
              ref={trackRef}
              className={cn(
                "relative mt-4 aspect-[4/3] overflow-hidden rounded-xl bg-slate-950/70",
                isPanning ? "cursor-grabbing" : "cursor-grab"
              )}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              style={{ overscrollBehavior: "none" }}
            >
              <motion.div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px), radial-gradient(circle at 20% 20%, rgba(255,255,255,0.03), transparent 35%), radial-gradient(circle at 80% 40%, rgba(16,185,129,0.08), transparent 40%)",
                  backgroundSize: `${gridSizePx}px ${gridSizePx}px, ${gridSizePx}px ${gridSizePx}px, 100% 100%, 100% 100%`,
                  backgroundPosition: "0 0, 0 0, center, center",
                }}
              />
              <div className="absolute inset-3 rounded-xl border border-white/10" />
              <svg
                className="pointer-events-none absolute inset-0"
                viewBox={`0 0 ${trackSize.width} ${trackSize.height}`}
                preserveAspectRatio="none"
              >
                {selectedTrack?.metadata.isLoop
                  ? startLineScreen && (
                      <>
                        <defs>
                          <linearGradient id="loop-start-finish" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#22c55e" />
                            <stop offset="50%" stopColor="#ef4444" />
                            <stop offset="100%" stopColor="#22c55e" />
                          </linearGradient>
                        </defs>
                        <line
                          x1={startLineScreen.a.x}
                          y1={startLineScreen.a.y}
                          x2={startLineScreen.b.x}
                          y2={startLineScreen.b.y}
                          stroke="url(#loop-start-finish)"
                          strokeWidth="4"
                          strokeDasharray="10 8"
                        />
                      </>
                    )
                  : (
                    <>
                      {startLineScreen && (
                        <line
                          x1={startLineScreen.a.x}
                          y1={startLineScreen.a.y}
                          x2={startLineScreen.b.x}
                          y2={startLineScreen.b.y}
                          stroke="#22c55e"
                          strokeWidth="3"
                          strokeDasharray="6 6"
                        />
                      )}
                      {finishLineScreen && (
                        <line
                          x1={finishLineScreen.a.x}
                          y1={finishLineScreen.a.y}
                          x2={finishLineScreen.b.x}
                          y2={finishLineScreen.b.y}
                          stroke="#ef4444"
                          strokeWidth="3"
                          strokeDasharray="8 6"
                        />
                      )}
                </>
              )}
            {checkpoints.map((cp) => {
              const pos = worldToScreen(transform, cp.position)
              const r = Math.max(4, cp.radius * transform.scale * 0.5)
              const hit = checkpointsHit.has(cp.id)
              const label = checkpointLabels.get(cp.id) ?? cp.order
              const fontSize = Math.max(8, r * 0.85)
              return (
                <g key={cp.id}>
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={r}
                    fill={hit ? "rgba(148,163,184,0.5)" : "rgba(255,255,255,0.12)"}
                    stroke={hit ? "rgba(148,163,184,0.9)" : "rgba(255,255,255,0.35)"}
                    strokeWidth="2"
                  />
                  <text
                    x={pos.x}
                    y={pos.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={fontSize}
                    fontWeight={700}
                    fill={hit ? "#0f172a" : "#e2e8f0"}
                    stroke="rgba(15,23,42,0.55)"
                    strokeWidth={0.7}
                    style={{ paintOrder: "stroke" }}
                  >
                    {label}
                  </text>
                </g>
              )
            })}
            {controlModeSelection === "mpcc" && mpccHorizonPoints.length > 1 && (
                  <polyline
                    points={mpccHorizonPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                    stroke="#a855f7"
                    strokeWidth={3}
                    fill="none"
                    strokeDasharray="6 5"
                    opacity={0.75}
                  />
                )}
              </svg>

              {trace.map((point, idx) => {
                const screen = worldToScreen(transform, point)
                const opacity = (idx + 1) / trace.length
                return (
                  <motion.div
                    key={`${point.x}-${point.y}-${idx}`}
                    className="pointer-events-none absolute rounded-full bg-emerald-300"
                    style={{
                      x: screen.x,
                      y: screen.y,
                      width: 6,
                      height: 6,
                      opacity: 0.15 + 0.6 * opacity,
                    }}
                    layout
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  />
                )
              })}

              {cones.map((cone) => {
                const screen = worldToScreen(transform, cone)
                const size = Math.max(8, cone.radius * transform.scale * 4)
                const color = coneColors[cone.tag.toLowerCase()] ?? coneColors.unknown
                return (
                  <motion.div
                    key={cone.id}
                    className="pointer-events-none absolute rounded-full shadow-md"
                    style={{
                      x: screen.x,
                      y: screen.y,
                      width: size,
                      height: size,
                      translateX: "-50%",
                      translateY: "-50%",
                      background: color,
                      boxShadow: `0 0 0 1px rgba(255,255,255,0.08), 0 8px 18px rgba(0,0,0,0.35)`,
                    }}
                    transition={{ type: "spring", stiffness: 140, damping: 18 }}
                  />
                )
              })}

              <motion.div
                className="pointer-events-none absolute rounded-full bg-emerald-400/15 blur-3xl"
                style={{
                  x: carScreen.x,
                  y: carScreen.y,
                  width: carLengthPx * 1.3,
                  height: carWidthPx * 2.2,
                  translateX: "-50%",
                  translateY: "-50%",
                }}
                animate={{ scale: carScale * 1.15, opacity: 0.18 + Math.min(Math.abs(speed) / 28, 0.3) }}
                transition={{ type: "spring", stiffness: 110, damping: 18, mass: 0.6 }}
              />

              <motion.div
                className="pointer-events-none absolute rounded-md border border-white/60 bg-gradient-to-r from-emerald-400 to-sky-500 shadow-xl"
                style={{
                  x: carScreen.x,
                  y: carScreen.y,
                  width: Math.max(34, carLengthPx),
                  height: Math.max(18, carWidthPx),
                  translateX: "-50%",
                  translateY: "-50%",
                  originX: "50%",
                  originY: "50%",
                }}
                animate={{ rotate: renderRotationDeg, scale: carScale }}
                transition={{ type: "spring", stiffness: 160, damping: 22, mass: 0.7 }}
              >
                <div className="absolute inset-0 rounded-md bg-white/10" />
                <div
                  className="absolute inset-y-1 left-1 right-1 rounded-sm bg-black/30"
                  style={{ mixBlendMode: "soft-light" }}
                />
                <motion.div
                  className="absolute inset-0 rounded-md bg-white/15 mix-blend-screen"
                  style={{ originX: "50%", originY: "50%" }}
                  animate={{ rotate: slipVisualDeg * 0.6 }}
                  transition={{ type: "spring", stiffness: 140, damping: 20 }}
                />
              </motion.div>

              <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/50 px-2 py-1 text-xs text-slate-100 shadow">
                {hoverWorld ? (
                  <span>
                    x {formatCoord(hoverWorld.x)} · y {formatCoord(hoverWorld.y)}
                    {hoverLabel ? ` · ${hoverLabel}` : ""}
                  </span>
                ) : (
                  <span>Hover for coordinates</span>
                )}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-200 md:grid-cols-4">
              <StatChip label="Speed" value={`${speed.toFixed(2)} m/s`} />
              <StatChip label="Accel" value={`${accel.toFixed(2)} m/s²`} />
              <StatChip label="Yaw" value={`${yawDeg.toFixed(1)}°`} />
              <StatChip label="Distance" value={`${(telemetry.totals.distance_traveled_m ?? 0).toFixed(1)} m`} />
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-inner ring-1 ring-white/5">
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Track selection</p>
                  <p className="text-lg font-semibold text-white">{selectedTrack?.label ?? "Select a track"}</p>
                  <p className="text-sm text-slate-300">
                    {selectedTrack?.description ?? "Choose a track or free practice to drive against cones."}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-200">
                    <MetaPill icon={<FiMap className="h-3.5 w-3.5" />} label={`${selectedTrack?.cones.length ?? 0} cones`} />
                    <MetaPill icon={<FiFlag className="h-3.5 w-3.5" />} label={`${progress.laps} laps`} />
                    <MetaPill icon={<FiTarget className="h-3.5 w-3.5" />} label={`${coneHits} cone hits`} />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 text-xs text-slate-200">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={handleReset} className="gap-2">
                      <FiRefreshCcw className="h-4 w-4" />
                      Restart run
                    </Button>
                    <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-100">
                      <input
                        type="checkbox"
                        checked={followCar}
                        onChange={(e) => {
                          const checked = e.target.checked
                          if (!checked) {
                            setCameraFocus({ x: telemetry.pose.x, y: telemetry.pose.y })
                          }
                          setFollowCar(checked)
                        }}
                        className="h-3.5 w-3.5 accent-emerald-400"
                      />
                      Track car
                    </label>
                  </div>
                  <span className="rounded-full bg-white/5 px-3 py-1 font-semibold">
                    Span {trackSpan.toFixed(1)} m
                  </span>
                  <span className="rounded-full bg-white/5 px-3 py-1 font-semibold">
                    Checkpoints {checkpointsHit.size}/{checkpoints.length || 0}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {tracks.map((track) => {
                  const active = track.id === selectedTrack?.id
                  return (
                    <Button
                      key={track.id}
                      variant={active ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "justify-between truncate",
                        active
                          ? "border-emerald-300 bg-emerald-500/90 text-emerald-50 hover:bg-emerald-500"
                          : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                      )}
                      onClick={() => setSelectedTrackId(track.id)}
                    >
                      <span className="truncate text-left">{track.label}</span>
                      <span className="text-[10px] uppercase tracking-wide">
                        {track.metadata.checkpoints.length} cp
                      </span>
                    </Button>
                  )
                })}
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between text-xs text-slate-200">
                  <span>Checkpoint progress</span>
                  <span className="font-semibold text-white">
                    {checkpointsHit.size}/{checkpoints.length || 0}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-white/10">
                  <motion.div
                    className="h-2 rounded-full bg-gradient-to-r from-emerald-400 to-sky-400"
                    animate={{ width: `${Math.max(2, checkpointProgress * 100)}%` }}
                    transition={{ type: "spring", stiffness: 160, damping: 20 }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
                  <MetaPill
                    icon={<FiFlag className="h-3.5 w-3.5" />}
                    label={startLine ? "Start line ready" : "No start line"}
                  />
                  <MetaPill
                    icon={<FiTarget className="h-3.5 w-3.5" />}
                    label={finishLine ? "Finish line ready" : "No finish line"}
                  />
                </div>
              </div>
            </div>

            <Separator className="border-white/10" />

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Vehicle snapshot</p>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-base font-semibold text-white">{primaryVehicle?.label ?? "BMW 320i"}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-300">
                    {primaryVehicle?.description ?? "Single vehicle dataset kept for this playground."}
                  </p>
                  {vehicleSummary && (
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">{vehicleSummary}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 text-xs font-semibold text-white">
                  <span className="rounded-full bg-sky-500/20 px-3 py-1 text-sky-100">ST model</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Input state</p>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <ControlBar
                  label="Throttle"
                  value={displayedControls.throttle}
                  color="from-emerald-400 to-emerald-300"
                />
                <ControlBar label="Brake" value={displayedControls.brake} color="from-rose-400 to-amber-300" />
                <ControlBar
                  label="Steering"
                  value={steeringValueNormalized}
                  color="from-sky-400 to-indigo-300"
                  hint={steeringHint}
                />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <InputHistoryGraph
                  label="Throttle"
                  samples={inputHistory}
                  accessor={(sample) => sample.throttle}
                  range={[0, 1]}
                  color="#34d399"
                />
                <InputHistoryGraph
                  label="Brake"
                  samples={inputHistory}
                  accessor={(sample) => sample.brake}
                  range={[0, 1]}
                  color="#fb7185"
                />
                <InputHistoryGraph
                  label="Steering"
                  samples={inputHistory}
                  accessor={(sample) => sample.steering}
                  range={steeringRange}
                  color="#38bdf8"
                  formatter={(value) => `${value.toFixed(2)} rad/s`}
                />
              </div>
              <p className="mt-2 text-xs text-slate-300">
                Tap <kbd className="rounded bg-white/10 px-1">R</kbd> to reset the run. Values reflect keyboard input or MPCC
                outputs (accel mapped into throttle/brake).
              </p>
            </div>

            {controlModeSelection === "mpcc" && (
              <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-300">MPCC controller</p>
                    <p className="text-sm text-slate-300 px-3 py-2">Tweak solver weights and bounds; changes apply live.</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-xs font-semibold text-white">
                    <span
                      className={cn(
                        "rounded-full px-3 py-1",
                        mpccStatus === "ready"
                          ? "bg-emerald-500/20 text-emerald-100"
                          : mpccStatus === "loading"
                            ? "bg-amber-500/20 text-amber-100"
                          : "bg-rose-500/20 text-rose-100"
                      )}
                    >
                      {mpccStatus === "ready" ? "Solver ready" : mpccStatus === "loading" ? "Recompiling..." : "MPCC error"}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <TuningSlider
                    label="Horizon"
                    value={mpccConfig.horizon_steps}
                    min={8}
                    max={64}
                    step={1}
                    format={(value) => `${Math.round(value)} steps`}
                    onChange={(value) => updateMpccConfigValue("horizon_steps", value)}
                  />
                  <TuningSlider
                    label="Time step"
                    value={mpccConfig.dt}
                    min={0.02}
                    max={0.12}
                    step={0.005}
                    format={(value) => `${value.toFixed(3)} s`}
                    onChange={(value) => updateMpccConfigValue("dt", value)}
                  />
                  <TuningSlider
                    label="Weight · progress"
                    value={mpccConfig.weights.progress}
                    min={0}
                    max={12}
                    step={0.1}
                    format={(value) => value.toFixed(1)}
                    onChange={(value) => updateMpccWeight("progress", value)}
                  />
                  <TuningSlider
                    label="Weight · lateral"
                    value={mpccConfig.weights.lateral}
                    min={0}
                    max={15}
                    step={0.1}
                    format={(value) => value.toFixed(1)}
                    onChange={(value) => updateMpccWeight("lateral", value)}
                  />
                  <TuningSlider
                    label="Weight · heading"
                    value={mpccConfig.weights.heading}
                    min={0}
                    max={10}
                    step={0.1}
                    format={(value) => value.toFixed(1)}
                    onChange={(value) => updateMpccWeight("heading", value)}
                  />
                  <TuningSlider
                    label="Weight · curvature"
                    value={mpccConfig.weights.curvature}
                    min={0}
                    max={1}
                    step={0.02}
                    format={(value) => value.toFixed(2)}
                    onChange={(value) => updateMpccWeight("curvature", value)}
                  />
                  <TuningSlider
                    label="Weight · rate"
                    value={mpccConfig.weights.rate}
                    min={0}
                    max={0.5}
                    step={0.01}
                    format={(value) => value.toFixed(2)}
                    onChange={(value) => updateMpccWeight("rate", value)}
                  />
                  <TuningSlider
                    label="Weight · input"
                    value={mpccConfig.weights.input}
                    min={0}
                    max={1}
                    step={0.02}
                    format={(value) => value.toFixed(2)}
                    onChange={(value) => updateMpccWeight("input", value)}
                  />
                  <TuningSlider
                    label="Steer rate limit"
                    value={mpccConfig.bounds.steering_rate}
                    min={0.5}
                    max={6}
                    step={0.05}
                    format={(value) => `${value.toFixed(2)} rad/s`}
                    onChange={updateMpccSteeringRate}
                  />
                  <TuningSlider
                    label="Accel max"
                    value={mpccConfig.bounds.acceleration.max}
                    min={0.5}
                    max={8}
                    step={0.1}
                    format={(value) => `${value.toFixed(2)} m/s²`}
                    onChange={(value) => updateMpccAccelerationBound("max", value)}
                  />
                  <TuningSlider
                    label="Accel min"
                    value={mpccConfig.bounds.acceleration.min}
                    min={-10}
                    max={-0.2}
                    step={0.1}
                    format={(value) => `${value.toFixed(2)} m/s²`}
                    onChange={(value) => updateMpccAccelerationBound("min", value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {status === "error" && error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-50"
          >
            <FiAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500 dark:text-amber-200" />
            <div>
              <p className="font-semibold">Simulation hiccup</p>
              <p className="text-sm text-amber-800/80 dark:text-amber-100/80">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MetaPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-100">
      {icon}
      <span className="font-semibold text-white">{label}</span>
    </span>
  )
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <motion.div
      layout
      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"
      transition={{ type: "spring", stiffness: 180, damping: 20 }}
    >
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="text-base font-semibold text-white">{value}</p>
    </motion.div>
  )
}

function ControlBar({
  label,
  value,
  color,
  hint,
}: {
  label: string
  value: number
  color: string
  hint?: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-200">
        <span className="uppercase tracking-[0.2em] text-slate-400">{label}</span>
        <span className="font-semibold text-white">{hint ?? `${Math.round(value * 100)}%`}</span>
      </div>
      <div className="mt-1 h-2 w-full rounded-full bg-white/10">
        <motion.div
          className={cn("h-2 rounded-full bg-gradient-to-r", color)}
          animate={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
          transition={{ type: "spring", stiffness: 180, damping: 20 }}
        />
      </div>
    </div>
  )
}

function InputHistoryGraph({
  label,
  samples,
  accessor,
  range,
  color,
  formatter = (value: number) => `${Math.round(value * 100)}%`,
}: {
  label: string
  samples: InputSample[]
  accessor: (sample: InputSample) => number
  range: [number, number]
  color: string
  formatter?: (value: number) => string
}) {
  const width = 160
  const height = 72
  const [min, max] = range
  const start = samples[0]?.t ?? 0
  const end = samples[samples.length - 1]?.t ?? start + 1
  const span = Math.max(end - start, 1)
  const latestValue = samples.length ? accessor(samples[samples.length - 1]) : 0
  const normalize = (value: number) => {
    const clamped = Math.min(max, Math.max(min, value))
    return (clamped - min) / Math.max(max - min, 1e-6)
  }
  const coords = samples.map((sample) => {
    const x = ((sample.t - start) / span) * width
    const y = height - normalize(accessor(sample)) * height
    return { x, y }
  })
  const path = coords.length
    ? coords.map((pt, idx) => `${idx === 0 ? "M" : "L"}${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join(" ")
    : `M0,${height / 2} L${width},${height / 2}`
  const zeroY = height - normalize(0) * height
  const showZero = zeroY >= 0 && zeroY <= height
  const lastPoint = coords[coords.length - 1]

  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3">
      <div className="flex items-center justify-between text-xs text-slate-200">
        <span className="uppercase tracking-[0.2em] text-slate-400">{label}</span>
        <span className="font-semibold text-white">{formatter(latestValue)}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 h-24 w-full">
        {showZero && (
          <line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke="rgba(255,255,255,0.35)" strokeDasharray="4 4" />
        )}
        <path d={path} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
        {lastPoint && <circle cx={lastPoint.x} cy={lastPoint.y} r={3.5} fill={color} stroke="rgba(0,0,0,0.2)" />}
      </svg>
    </div>
  )
}

function TuningSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (value: number) => string
  onChange: (value: number) => void
}) {
  const display = format
    ? format(value)
    : Math.abs(step) >= 1
      ? value.toFixed(0)
      : step < 0.01
        ? value.toFixed(3)
        : value.toFixed(2)
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3">
      <div className="flex items-center justify-between text-xs text-slate-200">
        <span className="uppercase tracking-[0.2em] text-slate-400">{label}</span>
        <span className="font-semibold text-white">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(parseFloat(event.target.value))}
        className="mt-3 h-2 w-full cursor-pointer accent-emerald-400"
      />
    </div>
  )
}
