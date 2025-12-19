'use client'

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { FiAlertTriangle, FiFlag, FiMap, FiRefreshCcw, FiTarget } from "react-icons/fi"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { ConfigManager, type Fetcher } from "@/velox/io/ConfigManager"
import { isSingleTrackParameters, type SingleTrackParameters } from "@/velox/models/types"
import {
  ControlMode,
  ModelType,
  SimulationDaemon,
  UserInputLimits,
  type UserInput,
} from "@/velox/simulation/SimulationDaemon"
import type { SimulationTelemetry } from "@/velox/telemetry"
import { SimulationTelemetryState } from "@/velox/telemetry"
import {
  BaselineController,
  type BaselineOutput,
  type BaselineState,
  stateFromTelemetry,
} from "@/controllers/baseline"
import { buildPath, sampleAtS } from "@/controllers/baseline/path"
import {
  StyleParamController,
  type StyleControllerOutput,
  type StyleParamControllerConfig,
  type StyleControllerPath,
  defaultStyleParamConfig,
} from "@/controllers/style-param"

import type { TrackCheckpoint, TrackDefinition, VehicleOption, VeloxConfigBundle, Vec2 } from "./types"
import { Separator } from "@/components/ui/separator"

type ControlState = {
  throttle: number
  brake: number
  steering: number
}

type InputSample = ControlState & {
  t: number
  mode: VehicleControlMode
  targetSpeed?: number
  speed?: number
  accel?: number
  steeringRate?: number
  lookahead?: number
  steerLookahead?: number
  speedLookahead?: number
}

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
  lastLapMs?: number
  lastLapValid?: boolean
  invalidLap: boolean
  invalidReason?: string
  lapJustFinished?: boolean
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
  min_steering_nudge: -4.5,
  max_steering_nudge: 4.5,
  min_steering_rate: -4.5,
  max_steering_rate: 4.5,
  min_accel: -6,
  max_accel: 4,
})
type VehicleControlMode = "manual" | "baseline" | "style" | "head-to-head"

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
// Keep loop handling aligned with server-side tagging in loadTracks.
const LOOP_TRACK_IDS = new Set(["box_loop", "oval", "hairpins_increasing_difficulty"])
const SPEED_CAP_MPS = 16
const OFF_TRACK_MARGIN = 0.8
const BOUNDS_SAFETY_MARGIN = 3.5
const MIN_LAP_TIME_S = 0.6
const LINE_CAPTURE_MARGIN = 1.4
const GATE_CAPTURE_MARGIN = 1.5

type BaselineHyperParams = {
  baseLookahead: number
  lookaheadGain: number
  lookaheadMin: number
  lookaheadMax: number
  riskScale: number
  previewDistance: number
  speedSmoothing: number
  pidKp: number
  pidKi: number
  pidKd: number
  jerkMax: number
}

type StyleHyperParams = {
  aLatMax: number
  maxSteerDeg: number
  styleA: number
  betaEntry: number
  betaExit: number
  K0: number
  KvGain: number
  Kkappa: number
  D: number
  axMax: number
  ayMax: number
  KvTrack: number
  steerKnots: number[]
  steerDeltas: number[]
  speedKnots: number[]
  speedDeltas: number[]
}

const baselineDefaults: BaselineHyperParams = {
  baseLookahead: 1.8,
  lookaheadGain: 0.22,
  lookaheadMin: 0.6,
  lookaheadMax: 16,
  riskScale: 0.85,
  previewDistance: 18,
  speedSmoothing: 0.55,
  pidKp: 1.0,
  pidKi: 0.4,
  pidKd: 0.08,
  jerkMax: 8,
}

const styleDefaults: StyleHyperParams = {
  aLatMax: defaultStyleParamConfig.aLatMax,
  maxSteerDeg: defaultStyleParamConfig.maxSteerDeg,
  styleA: defaultStyleParamConfig.styleA,
  betaEntry: defaultStyleParamConfig.betaEntry,
  betaExit: defaultStyleParamConfig.betaExit,
  K0: defaultStyleParamConfig.K0,
  KvGain: defaultStyleParamConfig.KvGain,
  Kkappa: defaultStyleParamConfig.Kkappa,
  D: defaultStyleParamConfig.D,
  axMax: defaultStyleParamConfig.axMax,
  ayMax: defaultStyleParamConfig.ayMax,
  KvTrack: defaultStyleParamConfig.KvTrack,
  steerKnots: [...defaultStyleParamConfig.steerKnots],
  steerDeltas: [...defaultStyleParamConfig.steerDeltas],
  speedKnots: [...defaultStyleParamConfig.speedKnots],
  speedDeltas: [...defaultStyleParamConfig.speedDeltas],
}

const baselineHint =
  "Hover a hyper-parameter to learn how it shapes the baseline: lookahead steers responsiveness, risk/preview govern braking, and PID/jerk tune the pedals."
const styleHint =
  "Hover a hyper-parameter to see how it shapes style control: beta warp sculpts entry/exit speed, steering gains set eagerness/damping, and friction ellipse terms gate throttle/brake."

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

type LookaheadSplineProps = {
  label: string
  knots: number[]
  deltas: number[]
  color: string
  onChange: (knots: number[], deltas: number[]) => void
  defaultKnots: number[]
  defaultDeltas: number[]
  valueScale?: number
}

// Visual size multiplier for the lookahead preview graphs; tweak to your taste.
const LOOKAHEAD_PREVIEW_SCALE = 3
// Visual size multiplier for preview axis labels.
const LOOKAHEAD_PREVIEW_LABEL_SCALE = 1.2
// Padding inside the preview frame to keep labels visible.
const LOOKAHEAD_PREVIEW_PADDING = 18

const deltasToCumulative = (deltas: number[]) => {
  const vals = new Array(deltas.length).fill(0)
  let acc = 0
  for (let i = 0; i < deltas.length; i += 1) {
    acc += Math.max(0, deltas[i] ?? 0)
    vals[i] = acc
  }
  return vals
}

function LookaheadSplineEditor({
  label,
  knots,
  deltas,
  color,
  onChange,
  defaultKnots,
  defaultDeltas,
  valueScale = 1,
}: LookaheadSplineProps) {
  const scale = Math.max(valueScale, 1e-6)
  const cumulativeMeters = useMemo(
    () => deltasToCumulative(deltas).map((v) => v * scale),
    [deltas, scale]
  )

  const renderMax = useMemo(() => {
    const peak = Math.max(...cumulativeMeters, 0)
    return Math.max(1, peak * 1.2 + 0.5)
  }, [cumulativeMeters])

  const commitSpline = useCallback(
    (nextKnots: number[], nextMeters: number[]) => {
      const cleanedKnots = [...nextKnots]
      const cleanedMeters = nextMeters.map((val) => Math.max(0, val))

      cleanedKnots[0] = 0
      cleanedKnots[cleanedKnots.length - 1] = 1
      for (let i = 1; i < cleanedKnots.length - 1; i += 1) {
        const prev = cleanedKnots[i - 1]
        const next = cleanedKnots[i + 1] ?? 1
        cleanedKnots[i] = clampValue(cleanedKnots[i], prev, next)
      }
      for (let i = 1; i < cleanedMeters.length; i += 1) {
        cleanedMeters[i] = Math.max(cleanedMeters[i], cleanedMeters[i - 1])
      }

      const cumIdx = cleanedMeters.map((val) => val / scale)
      for (let i = 1; i < cumIdx.length; i += 1) {
        cumIdx[i] = Math.max(cumIdx[i], cumIdx[i - 1])
      }
      const nextDeltas = cumIdx.map((val, i) => (i === 0 ? val : Math.max(0, val - cumIdx[i - 1])))
      onChange(cleanedKnots, nextDeltas)
    },
    [onChange, scale]
  )

  const handleKnotChange = useCallback(
    (idx: number, value: number) => {
      const nextKnots = [...knots]
      nextKnots[idx] = clampValue(value, 0, 1)
      commitSpline(nextKnots, cumulativeMeters)
    },
    [commitSpline, cumulativeMeters, knots]
  )

  const handleValueChange = useCallback(
    (idx: number, valueMeters: number) => {
      const nextMeters = [...cumulativeMeters]
      const prev = idx === 0 ? 0 : nextMeters[idx - 1]
      nextMeters[idx] = Math.max(prev, valueMeters)
      commitSpline(knots, nextMeters)
    },
    [commitSpline, cumulativeMeters, knots]
  )

  const handleAddPoint = useCallback(() => {
    if (knots.length < 2) {
      onChange([...defaultKnots], [...defaultDeltas])
      return
    }
    const insertIdx = knots.length - 1
    const prevKnot = knots[insertIdx - 1]
    const prevVal = cumulativeMeters[insertIdx - 1]
    const nextKnot = knots[insertIdx]
    const nextVal = cumulativeMeters[insertIdx]
    const newKnot = clampValue((prevKnot + nextKnot) / 2, prevKnot, nextKnot)
    const newVal = Math.max(prevVal, (prevVal + nextVal) / 2)
    const nextKnots = [...knots]
    const nextMeters = [...cumulativeMeters]
    nextKnots.splice(insertIdx, 0, newKnot)
    nextMeters.splice(insertIdx, 0, newVal)
    commitSpline(nextKnots, nextMeters)
  }, [commitSpline, cumulativeMeters, defaultDeltas, defaultKnots, knots, onChange])

  const handleRemove = useCallback(
    (idx: number) => {
      if (knots.length <= 2 || idx === 0 || idx === knots.length - 1) return
      const nextKnots = [...knots]
      const nextMeters = [...cumulativeMeters]
      nextKnots.splice(idx, 1)
      nextMeters.splice(idx, 1)
      commitSpline(nextKnots, nextMeters)
    },
    [commitSpline, cumulativeMeters, knots]
  )

  const previewPoints = useMemo(() => {
    const width = 200 * LOOKAHEAD_PREVIEW_SCALE
    const height = 120 * LOOKAHEAD_PREVIEW_SCALE
    const padding = LOOKAHEAD_PREVIEW_PADDING
    const chartWidth = width - padding * 2
    const chartHeight = height - padding * 2
    const pts = knots.map((k, i) => ({
      x: k * chartWidth,
      y: (1 - (cumulativeMeters[i] ?? 0) / Math.max(renderMax, 1e-6)) * chartHeight,
    }))
    return { pts, width, height, padding, chartWidth, chartHeight }
  }, [cumulativeMeters, knots, renderMax])

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-200">
        <span className="font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-emerald-200" onClick={handleAddPoint}>
            Add point
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-sky-200"
            onClick={() => onChange([...defaultKnots], [...defaultDeltas])}
          >
            Reset
          </Button>
        </div>
      </div>

      <div
        className="mt-3"
        style={{ width: "100%", maxWidth: `${previewPoints.width}px`, margin: "0 auto" }}
      >
        <div
          className="relative rounded-md bg-slate-950/40"
          style={{
            height: previewPoints.height,
            padding: previewPoints.padding,
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
              backgroundSize: "20px 20px, 20px 20px",
            }}
          />
          <span
            className="absolute left-2 origin-center text-slate-300"
            style={{
              top: "50%",
              transform: "translateY(-50%) rotate(-90deg)",
              fontSize: `${9 * LOOKAHEAD_PREVIEW_LABEL_SCALE}px`,
            }}
          >
            Lookahead (m)
          </span>
          <div
            className="absolute"
            style={{
              inset: previewPoints.padding,
              width: previewPoints.chartWidth,
              height: previewPoints.chartHeight,
            }}
          >
            {previewPoints.pts.slice(0, -1).map((p, idx) => {
              const q = previewPoints.pts[idx + 1]
              const dx = q.x - p.x
              const dy = q.y - p.y
              const len = Math.hypot(dx, dy)
              const angle = (Math.atan2(dy, dx) * 180) / Math.PI
              return (
                <motion.div
                  key={`seg-${idx}`}
                  className="absolute origin-left rounded-full"
                  style={{
                    left: p.x,
                    top: p.y,
                    width: len,
                    height: 3,
                    backgroundColor: color,
                    rotate: angle,
                  }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                />
              )
            })}
            {previewPoints.pts.map((p, idx) => (
              <motion.div
                key={`pt-${idx}`}
                className="absolute rounded-full border border-black/40"
                style={{
                  left: p.x - 5,
                  top: p.y - 5,
                  width: 10,
                  height: 10,
                  backgroundColor: color,
                  boxShadow: "0 0 0 3px rgba(0,0,0,0.25)",
                }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {knots.map((knot, idx) => {
          const updateKnot = (val: number) => handleKnotChange(idx, val)
          const updateMeters = (val: number) => handleValueChange(idx, val)
          return (
            <div
              key={`${idx}-${knot}`}
              className="grid grid-cols-[repeat(2,minmax(0,1fr))_auto] items-center gap-4 rounded-lg border border-white/5 bg-slate-950/50 p-4"
            >
              <label className="flex flex-col text-[11px] text-slate-300">
                <span className="uppercase tracking-[0.15em] text-slate-500">Speed fraction</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    disabled={idx === 0 || idx === knots.length - 1}
                    value={knot}
                    className="h-2 flex-1 accent-emerald-400"
                    onChange={(event) => updateKnot(Number(event.target.value))}
                    onInput={(event) => updateKnot(Number(event.currentTarget.value))}
                  />
                  <span className="w-12 text-right text-xs tabular-nums text-slate-200">{knot.toFixed(2)}</span>
                </div>
              </label>
              <label className="flex flex-col text-[11px] text-slate-300">
                <span className="uppercase tracking-[0.15em] text-slate-500">Lookahead (m)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={renderMax}
                    step={0.05}
                    value={cumulativeMeters[idx] ?? 0}
                    className="h-2 flex-1 accent-sky-400"
                    onChange={(event) => updateMeters(Number(event.target.value))}
                    onInput={(event) => updateMeters(Number(event.currentTarget.value))}
                  />
                  <span className="w-14 text-right text-xs tabular-nums text-slate-200">
                    {(cumulativeMeters[idx] ?? 0).toFixed(2)} m
                  </span>
                </div>
              </label>
              {idx !== 0 && idx !== knots.length - 1 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-rose-200"
                  onClick={() => handleRemove(idx)}
                >
                  Remove
                </Button>
              ) : (
                <span className="text-[11px] uppercase tracking-[0.15em] text-slate-500">Fixed</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function buildStylePath(track: TrackDefinition): StyleControllerPath | null {
  const forceLoop = LOOP_TRACK_IDS.has(track.id)
  const normalizedTrack =
    track.metadata.isLoop === forceLoop
      ? track
      : { ...track, metadata: { ...track.metadata, isLoop: forceLoop } }
  const path = buildPath(normalizedTrack)
  return path.points.length ? path : null
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

function segmentDistance(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2) {
  if (segmentsIntersect(p1, p2, q1, q2)) return 0
  const d1 = distanceToSegment(p1, { a: q1, b: q2 })
  const d2 = distanceToSegment(p2, { a: q1, b: q2 })
  const d3 = distanceToSegment(q1, { a: p1, b: p2 })
  const d4 = distanceToSegment(q2, { a: p1, b: p2 })
  return Math.min(d1, d2, d3, d4)
}

function lineCrossed(prev: Vec2 | null, next: Vec2, line?: { a: Vec2; b: Vec2 }) {
  if (!line || !prev) return false
  return segmentsIntersect(prev, next, line.a, line.b)
}

function pointToLineDistance(point: Vec2, line?: { a: Vec2; b: Vec2 }) {
  if (!line) return Number.POSITIVE_INFINITY
  return distanceToSegment(point, line)
}

type TrackSegment = {
  a: Vec2
  b: Vec2
  halfWidth: number
}

function distanceToSegment(point: Vec2, seg: { a: Vec2; b: Vec2 }) {
  const vx = seg.b.x - seg.a.x
  const vy = seg.b.y - seg.a.y
  const wx = point.x - seg.a.x
  const wy = point.y - seg.a.y
  const lenSq = vx * vx + vy * vy
  if (lenSq <= 1e-8) return Math.hypot(wx, wy)
  let t = (wx * vx + wy * vy) / lenSq
  t = clampValue(t, 0, 1)
  const projX = seg.a.x + t * vx
  const projY = seg.a.y + t * vy
  return Math.hypot(point.x - projX, point.y - projY)
}

function computeSegmentHalfWidth(a?: TrackCheckpoint, b?: TrackCheckpoint) {
  const widthA = a ? a.width ?? a.radius * 2 : 2
  const widthB = b ? b.width ?? b.radius * 2 : widthA
  const base = Math.max(widthA, widthB) * 0.5
  return Math.max(base, 1.4)
}

function buildTrackSegments(track?: TrackDefinition): TrackSegment[] {
  if (!track) return []
  const checkpoints = track.metadata.checkpoints ?? []
  if (checkpoints.length === 0) return []
  const segments: TrackSegment[] = []
  const midpoint = (p: Vec2, q: Vec2) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })
  const pushSegment = (a: Vec2, b: Vec2, widthA?: TrackCheckpoint, widthB?: TrackCheckpoint) => {
    if (!Number.isFinite(a.x + b.x + a.y + b.y)) return
    segments.push({
      a,
      b,
      halfWidth: computeSegmentHalfWidth(widthA, widthB),
    })
  }

  const startMid = track.metadata.startLine
    ? midpoint(track.metadata.startLine.a, track.metadata.startLine.b)
    : undefined
  const finishMid = track.metadata.finishLine
    ? midpoint(track.metadata.finishLine.a, track.metadata.finishLine.b)
    : undefined

  if (startMid) {
    pushSegment(startMid, checkpoints[0].position, checkpoints[0], checkpoints[1])
  }

  for (let i = 0; i < checkpoints.length - 1; i += 1) {
    pushSegment(checkpoints[i].position, checkpoints[i + 1].position, checkpoints[i], checkpoints[i + 1])
  }
  if (track.metadata.isLoop && checkpoints.length > 2) {
    pushSegment(checkpoints[checkpoints.length - 1].position, checkpoints[0].position, checkpoints[checkpoints.length - 1], checkpoints[0])
  } else if (finishMid) {
    const lastCp = checkpoints[checkpoints.length - 1]
    const prev = checkpoints.length > 1 ? checkpoints[checkpoints.length - 2] : undefined
    const dirRaw = { x: finishMid.x - lastCp.position.x, y: finishMid.y - lastCp.position.y }
    const fallbackDir =
      prev !== undefined
        ? { x: lastCp.position.x - prev.position.x, y: lastCp.position.y - prev.position.y }
        : startMid
          ? { x: finishMid.x - startMid.x, y: finishMid.y - startMid.y }
          : { x: 1, y: 0 }
    const dir =
      Math.hypot(dirRaw.x, dirRaw.y) > 1e-3
        ? dirRaw
        : Math.hypot(fallbackDir.x, fallbackDir.y) > 1e-3
          ? fallbackDir
          : { x: 1, y: 0 }
    const dirNormMag = Math.hypot(dir.x, dir.y) || 1
    const dirNorm = { x: dir.x / dirNormMag, y: dir.y / dirNormMag }
    const extension = Math.max(track.metadata.bounds.span * 0.2, 6)
    const beyondFinish = {
      x: finishMid.x + dirNorm.x * extension,
      y: finishMid.y + dirNorm.y * extension,
    }
    pushSegment(lastCp.position, finishMid, lastCp, prev)
    pushSegment(finishMid, beyondFinish, lastCp, prev)
  }

  return segments
}

function detectOffTrack(
  pose: Vec2,
  segments: TrackSegment[],
  bounds: TrackDefinition["metadata"]["bounds"],
  vehicleWidth: number
) {
  const padding = Math.max(vehicleWidth * 0.6, OFF_TRACK_MARGIN)
  let bestGap = Number.POSITIVE_INFINITY
  let bestLimit = 0
  let bestDist = Number.POSITIVE_INFINITY

  segments.forEach((seg) => {
    const dist = distanceToSegment(pose, seg)
    const limit = seg.halfWidth + padding
    const gap = dist - limit
    if (gap < bestGap) {
      bestGap = gap
      bestLimit = limit
      bestDist = dist
    }
  })

  const outsideBounds =
    pose.x < bounds.minX - BOUNDS_SAFETY_MARGIN ||
    pose.x > bounds.maxX + BOUNDS_SAFETY_MARGIN ||
    pose.y < bounds.minY - BOUNDS_SAFETY_MARGIN ||
    pose.y > bounds.maxY + BOUNDS_SAFETY_MARGIN

  const offTrackBySegments = segments.length > 0 ? bestGap > 0 : false
  return {
    offTrack: offTrackBySegments || outsideBounds,
    gap: bestGap,
    limit: bestLimit,
    distance: bestDist,
  }
}

function checkpointGateHit(
  cp: TrackCheckpoint,
  prev: Vec2 | null,
  current: Vec2,
  vehicleWidth: number
): boolean {
  const width = Math.max(cp.width ?? cp.radius * 2, 1.2)
  const capture = width * 0.65 + vehicleWidth * 0.5 + GATE_CAPTURE_MARGIN
  if (cp.gate) {
    const crossed = lineCrossed(prev, current, cp.gate)
    const pathNear = prev ? segmentDistance(prev, current, cp.gate.a, cp.gate.b) <= capture : false
    const nearNow = distanceToSegment(current, cp.gate) <= capture
    if (crossed || pathNear || nearNow) return true
  }
  const dx = current.x - cp.position.x
  const dy = current.y - cp.position.y
  return Math.hypot(dx, dy) <= cp.radius + vehicleWidth * 0.5 + GATE_CAPTURE_MARGIN * 0.5
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
    lastLapMs: undefined,
    lastLapValid: undefined,
    invalidLap: false,
    invalidReason: undefined,
    lapJustFinished: false,
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

function formatLapTime(ms?: number) {
  if (!Number.isFinite(ms ?? NaN)) return "--:--.--"
  const totalMs = Math.max(0, Math.round(ms ?? 0))
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  const hundredths = Math.floor((totalMs % 1000) / 10)
  const pad = (value: number, width: number) => value.toString().padStart(width, "0")
  return `${minutes}:${pad(seconds, 2)}.${pad(hundredths, 2)}`
}

function computeGapSeconds(primary: SimulationTelemetry, rival: SimulationTelemetry): number {
  const primaryDistance = primary?.totals?.distance_traveled_m ?? 0
  const rivalDistance = rival?.totals?.distance_traveled_m ?? 0
  const distanceGap = primaryDistance - rivalDistance
  const primarySpeed = primary?.velocity?.speed ?? 0
  const rivalSpeed = rival?.velocity?.speed ?? 0
  const leaderSpeed = distanceGap >= 0 ? primarySpeed : rivalSpeed
  const followerSpeed = distanceGap >= 0 ? rivalSpeed : primarySpeed
  const refSpeed = Math.max(leaderSpeed, followerSpeed, 1)
  return distanceGap / refSpeed
}

function formatGap(seconds: number): string {
  if (!Number.isFinite(seconds)) return "--"
  const sign = seconds >= 0 ? "+" : "-"
  return `${sign}${Math.abs(seconds).toFixed(2)} s`
}

function buildInitialStateFromPose(pose?: { position: Vec2; yaw: number }): number[] {
  if (!pose) return []
  const { position, yaw } = pose
  return [position.x, position.y, yaw, 0, 0]
}

function baselineConfigFromParams(params: BaselineHyperParams) {
  return {
    lookahead: {
      baseLookahead: params.baseLookahead,
      lookaheadGain: params.lookaheadGain,
      minLookahead: params.lookaheadMin,
      maxLookahead: params.lookaheadMax,
    },
    speed: {
      riskScale: params.riskScale,
      maxSpeed: SPEED_CAP_MPS,
      previewDistance: params.previewDistance,
      smoothingTimeConstant: params.speedSmoothing,
    },
    pid: {
      kp: params.pidKp,
      ki: params.pidKi,
      kd: params.pidKd,
      jerkMax: params.jerkMax,
    },
  }
}

function styleConfigFromParams(params: StyleHyperParams, base: StyleParamControllerConfig): StyleParamControllerConfig {
  return {
    ...base,
    Vmax: SPEED_CAP_MPS,
    styleA: params.styleA,
    betaEntry: params.betaEntry,
    betaExit: params.betaExit,
    K0: params.K0,
    KvGain: params.KvGain,
    Kkappa: params.Kkappa,
    D: params.D,
    KvTrack: params.KvTrack,
    steerKnots: params.steerKnots,
    steerDeltas: params.steerDeltas,
    speedKnots: params.speedKnots,
    speedDeltas: params.speedDeltas,
  }
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
  const [baselineParams, setBaselineParams] = useState<BaselineHyperParams>(baselineDefaults)
  const [baselineOutput, setBaselineOutput] = useState<BaselineOutput | null>(null)
  const [styleParams, setStyleParams] = useState<StyleHyperParams>(styleDefaults)
  const [styleOutput, setStyleOutput] = useState<StyleControllerOutput | null>(null)
  const [rivalTelemetry, setRivalTelemetry] = useState<SimulationTelemetry | null>(null)
  const [rivalTrace, setRivalTrace] = useState<Array<{ x: number; y: number }>>([])
  const [gapHistory, setGapHistory] = useState<Array<{ t: number; gap: number }>>([])
  const [rivalInputHistory, setRivalInputHistory] = useState<InputSample[]>([])
  const [paramDescription, setParamDescription] = useState<string>(
    baselineHint
  )
  const tracks = bundle.tracks
  const initialTrack = tracks[0]
  const [selectedTrackId, setSelectedTrackId] = useState<string>(initialTrack?.id ?? "empty")
  const selectedTrack = useMemo(
    () => tracks.find((track) => track.id === selectedTrackId) ?? tracks[0] ?? initialTrack,
    [initialTrack, selectedTrackId, tracks]
  )
  const trackSupportsAuto = useMemo(() => {
    const track = selectedTrack
    if (!track) return false
    const checkpointCount = track.metadata.checkpoints?.length ?? 0
    return !track.isEmpty && checkpointCount > 0
  }, [selectedTrack])
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
  const trackSegments = useMemo(() => buildTrackSegments(selectedTrack), [selectedTrack])
  const simControlMode = ControlMode.Keyboard

  const loopCancelRef = useRef<(() => void) | null>(null)
  const simRef = useRef<SimulationDaemon | null>(null)
  const rivalSimRef = useRef<SimulationDaemon | null>(null)
  const inputRef = useRef<ControlState>({ throttle: 0, brake: 0, steering: 0 })
  const lastFrameRef = useRef<number>(0)
  const resetRef = useRef<(() => void) | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const panOriginRef = useRef<{ start: Vec2; focus: Vec2 } | null>(null)
  const inputHistoryRef = useRef<InputSample[]>([])
  const rivalInputHistoryRef = useRef<InputSample[]>([])
  const gapHistoryRef = useRef<Array<{ t: number; gap: number }>>([])
  const lastPoseRef = useRef<Vec2 | null>(null)
  const rivalLastPoseRef = useRef<Vec2 | null>(null)
  const telemetryRef = useRef<SimulationTelemetry>(telemetry)
  const rivalTelemetryRef = useRef<SimulationTelemetry | null>(null)
  const rivalInputRef = useRef<ControlState>({ throttle: 0, brake: 0, steering: 0 })
  const baselineRef = useRef<BaselineController | null>(null)
  const styleRef = useRef<StyleParamController | null>(null)
  const styleConfigRef = useRef<StyleParamControllerConfig | null>(defaultStyleParamConfig)
  const stylePathRef = useRef<StyleControllerPath | null>(null)
  const progressRef = useRef<TrackProgress>(progress)
  const vehicleParamsRef = useRef<SingleTrackParameters | null>(null)
  const inputHistoryWindowSeconds = 12
  const gapHistoryWindowSeconds = 60

  const fetcher = useMemo(() => createLocalFetcher(bundle), [bundle])

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
    (timestampSec: number, controls: ControlState, extra?: Partial<InputSample>) => {
      const windowStart = timestampSec - inputHistoryWindowSeconds
      const sample: InputSample = { t: timestampSec, mode: "manual", ...controls, ...extra }
      const nextHistory = [...inputHistoryRef.current, sample].filter((point) => point.t >= windowStart)
      inputHistoryRef.current = nextHistory
      setInputHistory(nextHistory)
    },
    [inputHistoryWindowSeconds]
  )
  const recordRivalInputHistory = useCallback(
    (timestampSec: number, controls: ControlState, extra?: Partial<InputSample>) => {
      const windowStart = timestampSec - inputHistoryWindowSeconds
      const sample: InputSample = { t: timestampSec, mode: "baseline", ...controls, ...extra }
      const nextHistory = [...rivalInputHistoryRef.current, sample].filter((point) => point.t >= windowStart)
      rivalInputHistoryRef.current = nextHistory
      setRivalInputHistory(nextHistory)
    },
    [inputHistoryWindowSeconds]
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
        const headToHead = controlModeSelection === "head-to-head"
        const usingStylePrimary = controlModeSelection === "style" || headToHead
        const usingBaselinePrimary = controlModeSelection === "baseline"
        let historyExtra: Partial<InputSample> = { mode: controlModeSelection }
        let userInput: UserInput = {
          control_mode: ControlMode.Keyboard,
          longitudinal: {
            throttle: inputRef.current.throttle,
            brake: inputRef.current.brake,
          },
          steering_nudge: inputRef.current.steering,
          timestamp: timestampSec,
          dt,
        }
        let rivalInput: UserInput | null = null
        let rivalHistoryExtra: Partial<InputSample> | null = null
        let rivalOutput: BaselineOutput | null = null
        const allCheckpointsCollected = () => {
          const total = selectedTrack?.metadata.checkpoints.length ?? 0
          return total > 0 && progressRef.current.checkpointsHit.size >= total
        }
        const lapInvalid = progressRef.current.invalidLap
        const lapJustFinished = progressRef.current.lapJustFinished
        const shouldForceStop = lapInvalid || lapJustFinished

        const autoAllowed = trackSupportsAuto

        if (shouldForceStop) {
          inputRef.current = { throttle: 0, brake: 1, steering: 0 }
          userInput = {
            control_mode: ControlMode.Keyboard,
            longitudinal: { throttle: 0, brake: 1 },
            steering_nudge: 0,
            timestamp: timestampSec,
            dt,
          }
          historyExtra = { mode: controlModeSelection, accel: -1, steeringRate: 0 }
        } else if (usingBaselinePrimary && autoAllowed && baselineRef.current && vehicleParamsRef.current) {
          const baselineState: BaselineState = stateFromTelemetry(telemetryRef.current)
          const output = baselineRef.current.update(baselineState, dt)
          setBaselineOutput(output)
          const mapped = baselineRef.current.buildKeyboardInput(output, dt, timestampSec)
          inputRef.current = {
            throttle: mapped.longitudinal.throttle ?? 0,
            brake: mapped.longitudinal.brake ?? 0,
            steering: mapped.steering_nudge ?? 0,
          }
          userInput = { ...mapped, control_mode: ControlMode.Keyboard }
          historyExtra = {
            mode: "baseline",
            targetSpeed: output.targetSpeed,
            accel: output.acceleration,
            steeringRate: output.steeringRate,
            lookahead: output.lookahead,
          }
        } else if (
          usingStylePrimary &&
          autoAllowed &&
          styleConfigRef.current &&
          selectedTrack &&
          vehicleParamsRef.current
        ) {
          if (!styleRef.current) {
            styleRef.current = new StyleParamController(styleConfigRef.current)
          }
          if (!stylePathRef.current) {
            stylePathRef.current = buildStylePath(selectedTrack)
          }
          const path = stylePathRef.current
          if (path && styleRef.current) {
            const speedValue = telemetryRef.current.velocity.speed ?? 0
            const muPlanning = clampValue(vehicleParamsRef.current.mu ?? 0, 0.5, 1.6)
            const output = styleRef.current.step({
              state: {
                x: telemetryRef.current.pose.x ?? 0,
                y: telemetryRef.current.pose.y ?? 0,
                psi: telemetryRef.current.pose.yaw ?? 0,
                v: speedValue,
              },
              path,
              limits: {
                mu: muPlanning > 0 ? muPlanning : undefined,
                g: 9.81,
              },
              dt,
            })
            setStyleOutput(output)

            const throttleNorm = clampValue(output.throttle, -1, 1)
            const steerNorm = clampValue(output.steer, -1, 1)
            const throttleCmd = throttleNorm > 0 ? throttleNorm : 0
            const brakeCmd = throttleNorm < 0 ? -throttleNorm : 0

            inputRef.current = {
              throttle: throttleCmd,
              brake: brakeCmd,
              steering: steerNorm,
            }
            userInput = {
              control_mode: ControlMode.Keyboard,
              longitudinal: { throttle: throttleCmd, brake: brakeCmd },
              steering_nudge: steerNorm,
              timestamp: timestampSec,
              dt,
            }
            historyExtra = {
              mode: usingStylePrimary ? controlModeSelection : "style",
              accel: output.accelCommand ?? output.debug?.axCmd ?? throttleNorm,
              steeringRate: steerNorm,
              targetSpeed: output.targetSpeed ?? output.debug?.vStyle,
              steerLookahead: output.lookahead.steerOffset,
              speedLookahead: output.lookahead.speedOffset,
            }
          } else {
            setStyleOutput(null)
          }
        } else {
          if (controlModeSelection !== "manual") {
            setBaselineOutput(null)
            setStyleOutput(null)
          }
        }

        if (
          (usingBaselinePrimary || usingStylePrimary) &&
          !shouldForceStop &&
          allCheckpointsCollected()
        ) {
          inputRef.current = { throttle: 0, brake: 1, steering: 0 }
          userInput = {
            control_mode: ControlMode.Keyboard,
            longitudinal: { throttle: 0, brake: 1 },
            steering_nudge: 0,
            timestamp: timestampSec,
            dt,
          }
          historyExtra = { mode: controlModeSelection, accel: -1, steeringRate: 0 }
        }

        if (headToHead && !rivalInput) {
          if (autoAllowed && baselineRef.current && vehicleParamsRef.current && rivalSimRef.current) {
            const sourceTelemetry = rivalTelemetryRef.current ?? telemetryRef.current
            const baselineState: BaselineState = stateFromTelemetry(sourceTelemetry)
            rivalOutput = baselineRef.current.update(baselineState, dt)
            const rivalMapped = baselineRef.current.buildKeyboardInput(rivalOutput, dt, timestampSec)
            rivalInput = { ...rivalMapped, control_mode: ControlMode.Keyboard }
            rivalHistoryExtra = {
              mode: "baseline",
              targetSpeed: rivalOutput.targetSpeed,
              accel: rivalOutput.acceleration,
              steeringRate: rivalOutput.steeringRate,
              lookahead: rivalOutput.lookahead,
            }
          }

          if (!rivalInput) {
            rivalInput = {
              control_mode: ControlMode.Keyboard,
              longitudinal: { throttle: 0, brake: 0 },
              steering_nudge: 0,
              timestamp: timestampSec,
              dt,
            }
          }
        }
        if (headToHead && rivalInput) {
          rivalInputRef.current = {
            throttle: rivalInput.longitudinal.throttle ?? 0,
            brake: rivalInput.longitudinal.brake ?? 0,
            steering: rivalInput.steering_nudge ?? 0,
          }
        }

        const next = await simRef.current.step(userInput)
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
        recordInputHistory(timestampSec, inputRef.current, { ...historyExtra, speed: next.velocity.speed ?? 0 })
        const lapStopping = progressRef.current.lapJustFinished
        const offTrackState =
          selectedTrack && selectedTrack.metadata
            ? detectOffTrack(currentPose, trackSegments, selectedTrack.metadata.bounds, vehicleFootprint.width)
            : { offTrack: false, gap: 0, limit: 0, distance: 0 }
        if (lapStopping) {
          offTrackState.offTrack = false
        }
        setProgress((prev) => {
          const checkpoints = selectedTrack?.metadata.checkpoints ?? []
          const startLine = selectedTrack?.metadata.startLine
          const finishLine = selectedTrack?.metadata.finishLine
          const isLoop = selectedTrack?.metadata.isLoop ?? false
          const sameLine = Boolean(isLoop && startLine && finishLine && startLine.id === finishLine.id)
          const now = next.totals.simulation_time_s
          const startCrossed = lineCrossed(lastPoseRef.current, currentPose, startLine)
          const finishCrossed = lineCrossed(lastPoseRef.current, currentPose, finishLine)
          const startNear = pointToLineDistance(currentPose, startLine) <= LINE_CAPTURE_MARGIN
          const finishNear = pointToLineDistance(currentPose, finishLine) <= LINE_CAPTURE_MARGIN
          const allHitSoFar =
            (selectedTrack?.metadata.checkpoints?.length ?? 0) === 0 ||
            prev.checkpointsHit.size >= (selectedTrack?.metadata.checkpoints?.length ?? 0)
          const nextState: TrackProgress = {
            laps: prev.laps,
            checkpointsHit: new Set(prev.checkpointsHit),
            lastStartAt: prev.lastStartAt,
            lastFinishAt: prev.lastFinishAt,
            lastLapMs: prev.lastLapMs,
            lastLapValid: prev.lastLapValid,
            invalidLap: prev.invalidLap,
            invalidReason: prev.invalidReason,
            lapJustFinished: prev.lapJustFinished,
          }
          let changed = false
          const lapAlreadyRunning = nextState.lastStartAt !== undefined || selectedTrack?.isEmpty

          const finishCooldownActive =
            nextState.lapJustFinished &&
            nextState.lastFinishAt !== undefined &&
            now - nextState.lastFinishAt < 1.2

          if ((finishCrossed || finishNear) && lapAlreadyRunning) {
            offTrackState.offTrack = false
          }

          if (allHitSoFar) {
            offTrackState.offTrack = false
          }

          if (finishCooldownActive) {
            offTrackState.offTrack = false
          }

          if (offTrackState.offTrack && !nextState.invalidLap) {
            nextState.invalidLap = true
            nextState.invalidReason = "Off track"
            nextState.lastLapValid = false
            nextState.checkpointsHit.clear()
            nextState.lapJustFinished = false
            changed = true
          }

          let lapStarted = Boolean(nextState.lastStartAt !== undefined || selectedTrack?.isEmpty)

          const canArm = (!nextState.invalidLap && !lapStarted) || startCrossed || startNear
          const shouldArm =
            !lapStarted &&
            canArm &&
            (startCrossed || startNear)

          if (shouldArm) {
            nextState.checkpointsHit.clear()
            nextState.lastStartAt = now
            nextState.lastFinishAt = undefined
            nextState.invalidLap = false
            nextState.invalidReason = undefined
            nextState.lapJustFinished = false
            changed = true
          }

          for (const cp of checkpoints) {
            if (nextState.checkpointsHit.has(cp.id)) continue
            const gateHit = checkpointGateHit(cp, lastPoseRef.current, currentPose, vehicleFootprint.width)
            if (gateHit) {
              nextState.checkpointsHit.add(cp.id)
              changed = true
              if (!lapStarted) {
                nextState.lastStartAt = now
                lapStarted = true
              }
            }
          }

          const allHit = checkpoints.length === 0 || nextState.checkpointsHit.size >= checkpoints.length
          const elapsed = nextState.lastStartAt !== undefined ? now - nextState.lastStartAt : undefined
          const finishEligible =
            !finishCooldownActive &&
            (finishCrossed || finishNear) &&
            lapStarted &&
            (!sameLine || (elapsed !== undefined && elapsed > MIN_LAP_TIME_S))

          if (finishEligible) {
            if (nextState.invalidLap || !allHit) {
              nextState.lastLapValid = false
              if (!nextState.invalidLap) {
                nextState.invalidLap = true
                nextState.invalidReason = allHit ? "Off track" : "Missed checkpoint gate"
                changed = true
              }
              nextState.checkpointsHit.clear()
              nextState.lapJustFinished = false
            } else {
              const lapStart = nextState.lastStartAt ?? now
              const lapMs = Math.max(0, (now - lapStart) * 1000)
              nextState.laps += 1
              nextState.lastFinishAt = now
              nextState.lastLapMs = lapMs
              nextState.lastLapValid = true
              nextState.invalidLap = false
              nextState.invalidReason = undefined
              nextState.checkpointsHit.clear()
              nextState.lapJustFinished = true
              changed = true
            }

            nextState.lastStartAt = undefined
          } else if (sameLine && startCrossed && nextState.lastStartAt === prev.lastStartAt && !nextState.invalidLap) {
            nextState.checkpointsHit.clear()
            nextState.lastStartAt = now
            nextState.lastFinishAt = undefined
            nextState.lapJustFinished = false
            changed = true
          }

          if (nextState.lapJustFinished && nextState.lastFinishAt !== undefined) {
            const doneFor = now - nextState.lastFinishAt
            if (doneFor > 1.25) {
              nextState.lapJustFinished = false
              changed = true
            }
          }

          const result = changed ? nextState : prev
          progressRef.current = result
          return result
        })
        lastPoseRef.current = currentPose

        if (headToHead && rivalSimRef.current && rivalInput) {
          const rivalNext = await rivalSimRef.current.step(rivalInput)
          const rivalClone = cloneTelemetry(rivalNext)
          setRivalTelemetry(rivalClone)
          rivalTelemetryRef.current = rivalClone
          const rivalPose = { x: rivalClone.pose.x, y: rivalClone.pose.y }
          rivalLastPoseRef.current = rivalPose
          setRivalTrace((prev) => {
            const nextTrace = [...prev, rivalPose]
            return nextTrace.slice(-MAX_TRACE_POINTS)
          })
          recordRivalInputHistory(timestampSec, rivalInputRef.current, {
            ...(rivalHistoryExtra ?? {}),
            speed: rivalNext.velocity.speed ?? 0,
          })
        }

        if (headToHead && rivalTelemetryRef.current) {
          const gapSeconds = computeGapSeconds(telemetryRef.current, rivalTelemetryRef.current)
          const windowStart = timestampSec - gapHistoryWindowSeconds
          const nextGaps = [...gapHistoryRef.current, { t: timestampSec, gap: gapSeconds }].filter(
            (point) => point.t >= windowStart
          )
          gapHistoryRef.current = nextGaps
          setGapHistory(nextGaps)
        }

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
  }, [controlModeSelection, gapHistoryWindowSeconds, recordInputHistory, selectedTrack, stopLoop, trackSegments, trackSupportsAuto, vehicleFootprint])

  const rebuildDaemon = useCallback(async () => {
    stopLoop()
    setStatus("loading")
    setError(null)
    setTrace([])
    setRivalTrace([])
    inputHistoryRef.current = []
    setInputHistory([])
    rivalInputHistoryRef.current = []
    setRivalInputHistory([])
    gapHistoryRef.current = []
    setGapHistory([])
    setCones(buildConeState(selectedTrack))
    setConeHits(0)
    const resetProgress = emptyProgress()
    setProgress(resetProgress)
    progressRef.current = resetProgress
    lastPoseRef.current = null
    rivalLastPoseRef.current = null
    rivalTelemetryRef.current = null
    setRivalTelemetry(null)
    baselineRef.current = null
    styleRef.current = null
    stylePathRef.current = null
    styleConfigRef.current = defaultStyleParamConfig
    vehicleParamsRef.current = null
    setBaselineOutput(null)
    setStyleOutput(null)
    rivalSimRef.current = null

    const configManager = new ConfigManager(bundle.configRoot, bundle.parameterRoot, fetcher)
    let vehicleParams: SingleTrackParameters | null = null
    try {
      const loaded = await configManager.loadModelParameters(vehicleId, model)
      if (isSingleTrackParameters(loaded)) {
        vehicleParams = loaded
        vehicleParamsRef.current = loaded
        if ((controlModeSelection === "baseline" || controlModeSelection === "head-to-head") && trackSupportsAuto && selectedTrack) {
          const controller = new BaselineController(baselineConfigFromParams(baselineParams))
          controller.reset(selectedTrack, loaded)
          baselineRef.current = controller
        }
      }
    } catch (err) {
      console.warn("Failed to load vehicle parameters for baseline controller", err)
    }

    try {
      const cfg = await configManager.loadStyleParamConfig()
      const mergedCfg = styleConfigFromParams(styleParams, cfg)
      styleConfigRef.current = mergedCfg
      if (selectedTrack && trackSupportsAuto) {
        stylePathRef.current = buildStylePath(selectedTrack)
        if (controlModeSelection === "style" || controlModeSelection === "head-to-head") {
          styleRef.current = new StyleParamController(mergedCfg)
        }
      }
    } catch (err) {
      console.warn("Failed to load style controller config", err)
    }

    const daemon = new SimulationDaemon({
      model,
      vehicle_id: vehicleId,
      control_mode: simControlMode,
      config_manager: configManager,
      limits: defaultLimits,
      initial_state: buildInitialStateFromPose(selectedTrack?.metadata.startPose),
    })
    const rivalDaemon =
      controlModeSelection === "head-to-head"
        ? new SimulationDaemon({
            model,
            vehicle_id: vehicleId,
            control_mode: simControlMode,
            config_manager: configManager,
            limits: defaultLimits,
            initial_state: buildInitialStateFromPose(selectedTrack?.metadata.startPose),
          })
        : null

    try {
      await daemon.ready
      simRef.current = daemon
      const snap = await daemon.snapshot()
      const primaryClone = cloneTelemetry(snap.telemetry)
      setTelemetry(primaryClone)
      telemetryRef.current = primaryClone
      if (rivalDaemon) {
        await rivalDaemon.ready
        rivalSimRef.current = rivalDaemon
        const rivalSnap = await rivalDaemon.snapshot()
        const rivalClone = cloneTelemetry(rivalSnap.telemetry)
        setRivalTelemetry(rivalClone)
        rivalTelemetryRef.current = rivalClone
      }
      setStatus("ready")
      startLoop()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start the simulation daemon"
      setError(message)
      setStatus("error")
    }
  }, [
    baselineParams,
    bundle.configRoot,
    bundle.parameterRoot,
    controlModeSelection,
    fetcher,
    model,
    selectedTrack,
    simControlMode,
    startLoop,
    stopLoop,
    styleParams,
    trackSupportsAuto,
    vehicleId,
  ])

  useEffect(() => {
    rebuildDaemon()
    return () => stopLoop()
  }, [rebuildDaemon, stopLoop])

  useEffect(() => {
    if ((controlModeSelection !== "baseline" && controlModeSelection !== "head-to-head") || !trackSupportsAuto) return
    if (!vehicleParamsRef.current || !selectedTrack) return
    const controller = new BaselineController(baselineConfigFromParams(baselineParams))
    controller.reset(selectedTrack, vehicleParamsRef.current)
    baselineRef.current = controller
    setBaselineOutput(null)
    setParamDescription("Hover a hyper-parameter to see what it does.")
  }, [baselineParams, controlModeSelection, selectedTrack, trackSupportsAuto])

  useEffect(() => {
    if ((controlModeSelection !== "style" && controlModeSelection !== "head-to-head") || !trackSupportsAuto) return
    if (!selectedTrack || !styleConfigRef.current) return
    const cfg = styleConfigFromParams(styleParams, styleConfigRef.current)
    styleConfigRef.current = cfg
    styleRef.current = new StyleParamController(cfg)
    stylePathRef.current = buildStylePath(selectedTrack)
    setStyleOutput(null)
  }, [controlModeSelection, selectedTrack, styleParams, trackSupportsAuto])

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
    if (!trackSupportsAuto && controlModeSelection !== "manual") {
      setControlModeSelection("manual")
    }
  }, [controlModeSelection, trackSupportsAuto])

  useEffect(() => {
    telemetryRef.current = telemetry
  }, [telemetry])

  useEffect(() => {
    rivalTelemetryRef.current = rivalTelemetry
  }, [rivalTelemetry])

  useEffect(() => {
    setParamDescription(
      controlModeSelection === "style" || controlModeSelection === "head-to-head" ? styleHint : baselineHint
    )
  }, [controlModeSelection])

  useEffect(() => {
    if (!selectedTrack) return
    stylePathRef.current = trackSupportsAuto ? buildStylePath(selectedTrack) : null
    styleRef.current = null
  }, [selectedTrack, trackSupportsAuto])

  const headToHeadActive = controlModeSelection === "head-to-head"
  const pose = telemetry.pose
  const rivalPose = rivalTelemetry?.pose
  const carScreen = worldToScreen(transform, pose)
  const yawDeg = toDegrees(pose.yaw)
  const headingDeg = worldToScreenDeg(pose.yaw)
  const speed = telemetry.velocity.speed ?? 0
  const accel = telemetry.acceleration.longitudinal ?? 0
  const rivalSpeed = rivalTelemetry?.velocity.speed ?? 0
  const slipVisualDeg = worldToScreenDeg(telemetry.traction.slip_angle ?? 0) * 0.1
  const renderRotationDeg = headingDeg
  const rivalHeadingDeg = rivalPose ? worldToScreenDeg(rivalPose.yaw ?? 0) : 0
  const carScale = 0.9 + Math.min(Math.abs(speed) / 24, 0.35)
  const rivalCarScale = rivalPose ? 0.9 + Math.min(Math.abs(rivalSpeed) / 24, 0.35) : 0
  const rivalCarScreen = rivalPose ? worldToScreen(transform, { x: rivalPose.x, y: rivalPose.y }) : null
  const carLengthPx = clampValue(vehicleFootprint.length * transform.scale, 34, 240)
  const carWidthPx = clampValue(vehicleFootprint.width * transform.scale, 16, 140)
  const rivalCarLengthPx = rivalPose ? clampValue(vehicleFootprint.length * transform.scale, 34, 240) : 0
  const rivalCarWidthPx = rivalPose ? clampValue(vehicleFootprint.width * transform.scale, 16, 140) : 0
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
  const lapInvalid = progress.invalidLap
  const currentLapMs =
    progress.lastStartAt !== undefined && !lapInvalid
      ? Math.max(0, (telemetry.totals.simulation_time_s - (progress.lastStartAt ?? 0)) * 1000)
      : undefined
  const lastLapMs = progress.lastLapMs
  const lapRunning = currentLapMs !== undefined
  const lapStatusLabel = lapInvalid
    ? progress.invalidReason ?? "Lap invalid"
    : lapRunning
      ? "Lap in progress"
      : progress.lastLapValid && lastLapMs !== undefined
        ? "Lap complete"
        : "Awaiting start"
  const lapStatusTone = lapInvalid
    ? "bg-rose-500/20 text-rose-50 border border-rose-500/40"
    : lapRunning
      ? "bg-sky-500/15 text-sky-50 border border-sky-400/30"
      : progress.lastLapValid && lastLapMs !== undefined
        ? "bg-emerald-500/20 text-emerald-50 border border-emerald-400/40"
        : "bg-slate-500/20 text-slate-50 border border-slate-400/30"
  const trackSpan = selectedTrack?.metadata.bounds.span ?? 0
  const carRect: OrientedRect = {
    x: pose.x,
    y: pose.y,
    yaw: pose.yaw,
    length: vehicleFootprint.length,
    width: vehicleFootprint.width,
  }
  const rivalRect: OrientedRect | null = rivalPose
    ? {
        x: rivalPose.x,
        y: rivalPose.y,
        yaw: rivalPose.yaw,
        length: vehicleFootprint.length,
        width: vehicleFootprint.width,
      }
    : null
  let hoverLabel: string | null = null
  if (hoverWorld) {
    if (pointInOrientedRect(carRect, hoverWorld)) {
      hoverLabel = "Car"
    }
    if (rivalRect && pointInOrientedRect(rivalRect, hoverWorld)) {
      hoverLabel = "Baseline (ghost)"
    }
    let nearestDist = hoverLabel ? 0 : Infinity
    checkpoints.forEach((cp, idx) => {
      const dist = cp.gate
        ? distanceToSegment(hoverWorld, cp.gate)
        : Math.hypot(hoverWorld.x - cp.position.x, hoverWorld.y - cp.position.y)
      const gateRadius = cp.gate ? Math.max(1, (cp.width ?? cp.radius * 2) * 0.5) : cp.radius
      if (dist <= gateRadius && dist < nearestDist) {
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
  const displayedControls = inputRef.current
  const rivalDisplayedControls = rivalInputRef.current
  const steeringMax =
    controlModeSelection === "style" || headToHeadActive ? 1 : defaultLimits.max_steering_nudge
  const steeringMin =
    controlModeSelection === "style" || headToHeadActive ? -1 : defaultLimits.min_steering_nudge
  const steeringRange: [number, number] = [steeringMin, steeringMax]
  const steeringValueNormalized = clampValue(
    (displayedControls.steering - steeringMin) / Math.max(steeringMax - steeringMin, 1e-6),
    0,
    1
  )
  const steeringHint =
    controlModeSelection === "style" || headToHeadActive
      ? `${displayedControls.steering.toFixed(2)} (norm)`
      : `${displayedControls.steering.toFixed(2)} rad/s`

  const handleReset = useCallback(async () => {
    if (!simRef.current) return
    stopLoop()
    inputHistoryRef.current = []
    setInputHistory([])
    rivalInputHistoryRef.current = []
    setRivalInputHistory([])
    gapHistoryRef.current = []
    setGapHistory([])
    setCones(buildConeState(selectedTrack))
    setConeHits(0)
    const resetProgress = emptyProgress()
    setProgress(resetProgress)
    progressRef.current = resetProgress
    lastPoseRef.current = null
    rivalLastPoseRef.current = null
    setRivalTrace([])
    setRivalTelemetry(null)
    rivalInputRef.current = { throttle: 0, brake: 0, steering: 0 }
    if (
      (controlModeSelection === "baseline" || controlModeSelection === "head-to-head") &&
      baselineRef.current &&
      vehicleParamsRef.current &&
      selectedTrack
    ) {
      baselineRef.current.reset(selectedTrack, vehicleParamsRef.current)
      setBaselineOutput(null)
    }
    if ((controlModeSelection === "style" || controlModeSelection === "head-to-head") && styleRef.current) {
      styleRef.current.reset()
    }
    await simRef.current.reset({
      vehicle_id: vehicleId,
      model,
      control_mode: simControlMode,
      initial_state: buildInitialStateFromPose(selectedTrack?.metadata.startPose),
    })
    const snap = await simRef.current.snapshot()
    const primaryClone = cloneTelemetry(snap.telemetry)
    setTelemetry(primaryClone)
    telemetryRef.current = primaryClone
    setTrace([])
    if (controlModeSelection === "head-to-head" && rivalSimRef.current) {
      await rivalSimRef.current.reset({
        vehicle_id: vehicleId,
        model,
        control_mode: simControlMode,
        initial_state: buildInitialStateFromPose(selectedTrack?.metadata.startPose),
      })
      const rivalSnap = await rivalSimRef.current.snapshot()
      const rivalClone = cloneTelemetry(rivalSnap.telemetry)
      setRivalTelemetry(rivalClone)
      rivalTelemetryRef.current = rivalClone
    }
    startLoop()
  }, [controlModeSelection, model, selectedTrack, simControlMode, startLoop, stopLoop, vehicleId])

  useEffect(() => {
    resetRef.current = handleReset
  }, [handleReset])

  useEffect(() => {
    progressRef.current = progress
  }, [progress])

  const stylePath = stylePathRef.current
  const showStylePath = (controlModeSelection === "style" || headToHeadActive) && !!stylePath
  const styleLookaheadSpacing = stylePath?.spacing ?? 0.8
  const styleLookaheadMaxMeters = useMemo(() => {
    const spacing = Math.max(styleLookaheadSpacing, 1e-6)
    const steerCum = deltasToCumulative(styleParams.steerDeltas)
    const speedCum = deltasToCumulative(styleParams.speedDeltas)
    const peakIdx = Math.max(
      steerCum[steerCum.length - 1] ?? 0,
      speedCum[speedCum.length - 1] ?? 0,
      0
    )
    return peakIdx * spacing
  }, [styleLookaheadSpacing, styleParams.steerDeltas, styleParams.speedDeltas])
  const stylePathD =
    showStylePath && stylePath?.points.length
      ? (() => {
          const coords = stylePath.points.map((p) => worldToScreen(transform, p))
          if (coords.length < 2) return null
          const cmd = coords.map((c, idx) => `${idx === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ")
          return stylePath.isLoop ? `${cmd} Z` : cmd
        })()
      : null

  const styleTargetScreen =
    showStylePath && styleOutput && stylePath
      ? worldToScreen(transform, sampleAtS(stylePath, styleOutput.lookahead.steerS).point)
      : null

  const speedGraphMax = SPEED_CAP_MPS
  const styleLookaheadGraphMax = Math.max(styleLookaheadMaxMeters, 1)
  const accelCap = Math.max(styleParams.axMax, Math.abs(defaultLimits.min_accel), defaultLimits.max_accel)
  const accelRange: [number, number] = [-accelCap, accelCap]
  const latestGapSeconds = gapHistory[gapHistory.length - 1]?.gap ?? 0
  const gapRange = useMemo<[number, number]>(() => {
    const maxAbs = gapHistory.reduce((acc, sample) => Math.max(acc, Math.abs(sample.gap)), 0)
    const bound = Math.max(1, maxAbs + 0.25)
    return [-bound, bound]
  }, [gapHistory])
  const baselineHistory = headToHeadActive ? rivalInputHistory : inputHistory
  const styleHistory = inputHistory
  const showStyleGraphs = headToHeadActive || controlModeSelection === "style"
  const showBaselineGraphs = headToHeadActive || controlModeSelection === "baseline"

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
              variant={controlModeSelection === "baseline" ? "default" : "outline"}
              className="border-white/10"
              disabled={!trackSupportsAuto}
              onClick={() => setControlModeSelection("baseline")}
            >
              Baseline (Auto)
            </Button>
            <Button
              size="sm"
              variant={controlModeSelection === "style" ? "default" : "outline"}
              className="border-white/10"
              disabled={!trackSupportsAuto}
              onClick={() => setControlModeSelection("style")}
            >
              Style Param (Auto)
            </Button>
            <Button
              size="sm"
              variant={controlModeSelection === "head-to-head" ? "default" : "outline"}
              className="border-white/10"
              disabled={!trackSupportsAuto}
              onClick={() => setControlModeSelection("head-to-head")}
            >
              Head-to-head (Auto)
            </Button>
          </div>
          {!trackSupportsAuto && (
            <p className="text-xs text-amber-200">
              Auto controllers are disabled on Free Practice (no checkpoints).
            </p>
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
                {showStylePath && stylePathD && (
                  <path
                    d={stylePathD}
                    fill="none"
                    stroke="rgba(56,189,248,0.65)"
                    strokeWidth={3}
                    strokeDasharray="6 6"
                  />
                )}
                {showStylePath && styleTargetScreen && (
                  <circle
                    cx={styleTargetScreen.x}
                    cy={styleTargetScreen.y}
                    r={7}
                    fill="#0ea5e9"
                    stroke="white"
                    strokeWidth={1.5}
                    opacity={0.9}
                  />
                )}
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
              const gate =
                cp.gate && transform
                  ? { a: worldToScreen(transform, cp.gate.a), b: worldToScreen(transform, cp.gate.b) }
                  : null
              return (
                <g key={cp.id}>
                  {gate && (
                    <line
                      x1={gate.a.x}
                      y1={gate.a.y}
                      x2={gate.b.x}
                      y2={gate.b.y}
                      stroke={hit ? "#22c55e" : "rgba(226,232,240,0.8)"}
                      strokeWidth={hit ? 5 : 3}
                      strokeDasharray={hit ? "0" : "10 6"}
                      opacity={0.9}
                    />
                  )}
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
              </svg>

              {headToHeadActive &&
                rivalTrace.map((point, idx) => {
                  const screen = worldToScreen(transform, point)
                  const opacity = (idx + 1) / Math.max(rivalTrace.length, 1)
                  return (
                    <motion.div
                      key={`rival-${point.x}-${point.y}-${idx}`}
                      className="pointer-events-none absolute rounded-full bg-fuchsia-300"
                      style={{
                        x: screen.x,
                        y: screen.y,
                        width: 6,
                        height: 6,
                        opacity: 0.12 + 0.55 * opacity,
                      }}
                      layout
                      transition={{ duration: 0.3, ease: "easeOut" }}
                    />
                  )
                })}

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

              {controlModeSelection === "baseline" && baselineOutput?.targetPoint && (
                <motion.div
                  key="baseline-target"
                  className="pointer-events-none absolute rounded-full border border-emerald-400 bg-emerald-300/70 shadow"
                  style={{
                    width: 12,
                    height: 12,
                    translateX: "-50%",
                    translateY: "-50%",
                    ...worldToScreen(transform, baselineOutput.targetPoint),
                  }}
                  transition={{ type: "spring", stiffness: 180, damping: 16 }}
                />
              )}

              {headToHeadActive && rivalCarScreen && (
                <>
                  <motion.div
                    className="pointer-events-none absolute rounded-full bg-fuchsia-400/15 blur-3xl"
                    style={{
                      x: rivalCarScreen.x,
                      y: rivalCarScreen.y,
                      width: rivalCarLengthPx * 1.2,
                      height: rivalCarWidthPx * 2,
                      translateX: "-50%",
                      translateY: "-50%",
                    }}
                    animate={{ scale: rivalCarScale * 1.1, opacity: 0.16 + Math.min(Math.abs(rivalSpeed) / 28, 0.28) }}
                    transition={{ type: "spring", stiffness: 140, damping: 12, mass: 0.55 }}
                  />
                  <motion.div
                    className="pointer-events-none absolute rounded-md border border-white/60 bg-gradient-to-r from-fuchsia-400 to-purple-500 shadow-xl"
                    style={{
                      x: rivalCarScreen.x,
                      y: rivalCarScreen.y,
                      width: Math.max(32, rivalCarLengthPx),
                      height: Math.max(16, rivalCarWidthPx),
                      translateX: "-50%",
                      translateY: "-50%",
                      originX: "50%",
                      originY: "50%",
                    }}
                    animate={{ rotate: rivalHeadingDeg, scale: rivalCarScale }}
                    transition={{ type: "spring", stiffness: 210, damping: 12, mass: 0.6 }}
                  >
                    <div className="absolute inset-0 rounded-md bg-white/10" />
                    <div
                      className="absolute inset-y-1 left-1 right-1 rounded-sm bg-black/30"
                      style={{ mixBlendMode: "soft-light" }}
                    />
                  </motion.div>
                </>
              )}

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
                transition={{ type: "spring", stiffness: 140, damping: 12, mass: 0.55 }}
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
                transition={{ type: "spring", stiffness: 210, damping: 12, mass: 0.6 }}
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
                  transition={{ type: "spring", stiffness: 170, damping: 12 }}
                />
              </motion.div>

              <div className="pointer-events-none absolute left-4 top-4 flex max-w-xs flex-col gap-2">
                <div className={cn("flex items-center justify-between rounded-lg px-3 py-2 shadow-lg backdrop-blur", lapStatusTone)}>
                  <div className="flex items-center gap-2">
                    {lapInvalid ? (
                      <FiAlertTriangle className="h-5 w-5 text-rose-100" />
                    ) : (
                      <FiFlag className="h-5 w-5 text-emerald-100" />
                    )}
                    <div className="flex flex-col leading-tight">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-white/70">Lap status</span>
                      <span className="text-sm font-semibold text-white">{lapStatusLabel}</span>
                    </div>
                  </div>
                  <span className="rounded-full bg-black/30 px-2 py-1 text-xs font-semibold text-white shadow">
                    {checkpointsHit.size}/{checkpoints.length || 0}
                  </span>
                </div>
                <div className="flex gap-2">
                  <LapTimePill label="Current" value={formatLapTime(currentLapMs)} muted={lapInvalid || !currentLapMs} />
                  <LapTimePill
                    label="Last"
                    value={lastLapMs !== undefined ? formatLapTime(lastLapMs) : "--:--.--"}
                    muted={lastLapMs === undefined}
                    warn={progress.lastLapValid === false}
                    highlight={progress.lastLapValid === true}
                  />
                </div>
                {headToHeadActive && (
                  <div className="flex items-center gap-3 rounded-lg bg-black/40 px-3 py-2 text-xs text-slate-100 shadow-lg">
                    <span className="flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded-full bg-sky-300" />
                      Style
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded-full bg-fuchsia-300" />
                      Baseline
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-1 font-semibold">
                      Gap {formatGap(latestGapSeconds)}
                    </span>
                  </div>
                )}
              </div>

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
            {headToHeadActive && (
              <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/50 p-3">
                <InputHistoryGraph
                  label="Gap (style vs baseline)"
                  samples={gapHistory}
                  accessor={(sample) => sample.gap}
                  range={gapRange}
                  color="#f472b6"
                  formatter={(value) => formatGap(value)}
                />
              </div>
            )}
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {showStyleGraphs && (
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between text-xs text-slate-200">
                    <span className="uppercase tracking-[0.2em] text-slate-400">Style param telemetry</span>
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-100">
                      {headToHeadActive ? "Lead" : "Active"}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <InputHistoryGraph
                      label="Target speed"
                      samples={styleHistory}
                      accessor={(sample) => sample.targetSpeed ?? 0}
                      range={[0, speedGraphMax]}
                      color="#a78bfa"
                      formatter={(value) => `${value.toFixed(1)} m/s`}
                    />
                    <InputHistoryGraph
                      label="Speed (actual)"
                      samples={styleHistory}
                      accessor={(sample) => sample.speed ?? 0}
                      range={[0, speedGraphMax]}
                      color="#22d3ee"
                      formatter={(value) => `${value.toFixed(1)} m/s`}
                    />
                    <InputHistoryGraph
                      label="Accel command"
                      samples={styleHistory}
                      accessor={(sample) => sample.accel ?? 0}
                      range={accelRange}
                      color="#f59e0b"
                      formatter={(value) => `${value.toFixed(2)} m/s²`}
                    />
                    <InputHistoryGraph
                      label="Steer lookahead"
                      samples={styleHistory}
                      accessor={(sample) => sample.steerLookahead ?? 0}
                      range={[0, styleLookaheadGraphMax]}
                      color="#38bdf8"
                      formatter={(value) => `${value.toFixed(2)} m`}
                    />
                    <InputHistoryGraph
                      label="Throttle lookahead"
                      samples={styleHistory}
                      accessor={(sample) => sample.speedLookahead ?? 0}
                      range={[0, styleLookaheadGraphMax]}
                      color="#fbbf24"
                      formatter={(value) => `${value.toFixed(2)} m`}
                    />
                  </div>
                </div>
              )}
              {showBaselineGraphs && (
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between text-xs text-slate-200">
                    <span className="uppercase tracking-[0.2em] text-slate-400">Baseline telemetry</span>
                    <span className="rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-fuchsia-100">
                      {headToHeadActive ? "Ghost" : "Active"}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <InputHistoryGraph
                      label="Target speed"
                      samples={baselineHistory}
                      accessor={(sample) => sample.targetSpeed ?? 0}
                      range={[0, speedGraphMax]}
                      color="#c084fc"
                      formatter={(value) => `${value.toFixed(1)} m/s`}
                    />
                    <InputHistoryGraph
                      label="Speed (actual)"
                      samples={baselineHistory}
                      accessor={(sample) => sample.speed ?? 0}
                      range={[0, speedGraphMax]}
                      color="#60a5fa"
                      formatter={(value) => `${value.toFixed(1)} m/s`}
                    />
                    <InputHistoryGraph
                      label="Accel command"
                      samples={baselineHistory}
                      accessor={(sample) => sample.accel ?? 0}
                      range={accelRange}
                      color="#f59e0b"
                      formatter={(value) => `${value.toFixed(2)} m/s²`}
                    />
                    <InputHistoryGraph
                      label="Lookahead distance"
                      samples={baselineHistory}
                      accessor={(sample) => sample.lookahead ?? 0}
                      range={[0, baselineParams.lookaheadMax]}
                      color="#38bdf8"
                      formatter={(value) => `${value.toFixed(2)} m`}
                    />
                  </div>
                </div>
              )}
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
                    <MetaPill
                      icon={<FiAlertTriangle className="h-3.5 w-3.5" />}
                      label={lapInvalid ? "Lap invalid" : "Lap active"}
                    />
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
                <div className="mt-3 flex items-center justify-between text-xs text-slate-200">
                  <span>Current lap</span>
                  <span className="font-semibold text-white">{formatLapTime(currentLapMs)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Last lap</span>
                  <span
                    className={cn(
                      "font-semibold",
                      progress.lastLapValid === false ? "text-amber-200" : "text-emerald-100"
                    )}
                  >
                    {lastLapMs !== undefined ? formatLapTime(lastLapMs) : "--:--.--"}
                  </span>
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
              <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Hyper-parameter help</p>
              <p className="mt-2 text-sm text-slate-200 leading-relaxed">
                {paramDescription || "Hover a hyper-parameter to see what it does."}
              </p>
            </div>

            {(controlModeSelection === "baseline" || headToHeadActive) && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Baseline hyper-parameters</p>
                  <Button size="sm" variant="outline" onClick={() => setBaselineParams(baselineDefaults)}>
                    Reset
                  </Button>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <NumberField
                    label="Base lookahead (m)"
                    value={baselineParams.baseLookahead}
                    step={0.1}
                    min={0.1}
                    max={30}
                    description="Base lookahead distance L0. Higher L0 points the car further down the road at all speeds, trading crisp turn-in for calmer steering and more straight-line bias."
                    onHover={(text) =>
                      setParamDescription(
                        text ??
                          "Hover a hyper-parameter to learn how it shapes the baseline: lookahead steers responsiveness, risk/preview govern braking, and PID/jerk tune the pedals."
                      )
                    }
                    onChange={(value) => setBaselineParams((prev) => ({ ...prev, baseLookahead: value }))}
                  />
                  <NumberField
                    label="Lookahead gain (s)"
                    value={baselineParams.lookaheadGain}
                    step={0.05}
                    min={0}
                    max={2}
                    description="How lookahead grows with speed (m per m/s). Raising this adds preview as speed rises, smoothing high-speed corners but delaying rotation; lowering sharpens but risks oscillation."
                    onHover={(text) =>
                      setParamDescription(
                        text ??
                          "Hover a hyper-parameter to learn how it shapes the baseline: lookahead steers responsiveness, risk/preview govern braking, and PID/jerk tune the pedals."
                      )
                    }
                    onChange={(value) => setBaselineParams((prev) => ({ ...prev, lookaheadGain: value }))}
                  />
                  <NumberField
                    label="Lookahead min (m)"
                    value={baselineParams.lookaheadMin}
                    step={0.1}
                    min={0.2}
                    max={baselineParams.lookaheadMax}
                    description="Smallest lookahead at low speed. Dropping it tightens low-speed reactions (hairpins, slaloms) but can introduce steering chatter; raising it calms parking-lot speeds."
                    onHover={(text) =>
                      setParamDescription(
                        text ??
                          "Hover a hyper-parameter to learn how it shapes the baseline: lookahead steers responsiveness, risk/preview govern braking, and PID/jerk tune the pedals."
                      )
                    }
                    onChange={(value) => setBaselineParams((prev) => ({ ...prev, lookaheadMin: value }))}
                  />
                  <NumberField
                    label="Lookahead max (m)"
                    value={baselineParams.lookaheadMax}
                    step={0.5}
                    min={baselineParams.lookaheadMin}
                    max={40}
                    description="Upper bound on lookahead. Higher values make high-speed straights very smooth but can push apexes late; tighter caps keep the car willing to rotate in fast bends."
                    onHover={(text) =>
                      setParamDescription(
                        text ??
                          "Hover a hyper-parameter to learn how it shapes the baseline: lookahead steers responsiveness, risk/preview govern braking, and PID/jerk tune the pedals."
                      )
                    }
                    onChange={(value) => setBaselineParams((prev) => ({ ...prev, lookaheadMax: value }))}
                  />
                  <NumberField
                    label="Risk scale"
                    value={baselineParams.riskScale}
                    step={0.05}
                    min={0.5}
                    max={2}
                    description="Scales the friction-based speed band. Values <1 back off from the limit for safety; >1 push deeper into available grip. Think of it as confidence in tire grip."
                    onHover={(text) =>
                      setParamDescription(
                        text ??
                          "Hover a hyper-parameter to learn how it shapes the baseline: lookahead steers responsiveness, risk/preview govern braking, and PID/jerk tune the pedals."
                      )
                    }
                    onChange={(value) => setBaselineParams((prev) => ({ ...prev, riskScale: value }))}
                  />
                  <NumberField
                    label="Curvature preview (m)"
                    value={baselineParams.previewDistance}
                    step={0.5}
                    min={2}
                    max={40}
                    description="Distance window to inspect upcoming curvature. A larger window anticipates tight corners earlier and initiates braking sooner; a shorter window reacts later but can be riskier."
                    onHover={(text) =>
                      setParamDescription(
                        text ??
                          "Hover a hyper-parameter to learn how it shapes the baseline: lookahead steers responsiveness, risk/preview govern braking, and PID/jerk tune the pedals."
                      )
                    }
                    onChange={(value) => setBaselineParams((prev) => ({ ...prev, previewDistance: value }))}
                  />
                  <NumberField
                    label="Speed smoothing (s)"
                    value={baselineParams.speedSmoothing}
                    step={0.05}
                    min={0.05}
                    max={2}
                    description="Low-pass filter time constant on target speed. Higher values soften acceleration/braking commands and cut jerk; lower values react faster but can feel twitchy."
                    onHover={(text) =>
                      setParamDescription(
                        text ??
                          "Hover a hyper-parameter to learn how it shapes the baseline: lookahead steers responsiveness, risk/preview govern braking, and PID/jerk tune the pedals."
                      )
                    }
                    onChange={(value) => setBaselineParams((prev) => ({ ...prev, speedSmoothing: value }))}
                  />
                  <NumberField
                    label="Jerk limit (m/s³)"
                    value={baselineParams.jerkMax}
                    step={0.5}
                    min={0}
                    max={30}
                    description="Max rate-of-change of acceleration. Reducing this makes throttle/brake ramps smoother and easier on traction; increasing allows snappier pedal moves."
                    onHover={(text) =>
                      setParamDescription(
                        text ??
                          "Hover a hyper-parameter to learn how it shapes the baseline: lookahead steers responsiveness, risk/preview govern braking, and PID/jerk tune the pedals."
                      )
                    }
                    onChange={(value) => setBaselineParams((prev) => ({ ...prev, jerkMax: value }))}
                  />
                  <NumberField
                    label="PID kp"
                    value={baselineParams.pidKp}
                    step={0.05}
                    min={0}
                    max={4}
                    description="Proportional gain on speed error. Larger Kp bites harder on error for brisk braking/accel; too high overshoots or chatters at steady speed."
                    onHover={(text) =>
                      setParamDescription(
                        text ??
                          "Hover a hyper-parameter to learn how it shapes the baseline: lookahead steers responsiveness, risk/preview govern braking, and PID/jerk tune the pedals."
                      )
                    }
                    onChange={(value) => setBaselineParams((prev) => ({ ...prev, pidKp: value }))}
                  />
                  <NumberField
                    label="PID ki"
                    value={baselineParams.pidKi}
                    step={0.02}
                    min={0}
                    max={2}
                    description="Integral gain to eliminate residual speed error (e.g., uphill). Moderate Ki fixes bias; excessive Ki causes surging or slow oscillation."
                    onHover={(text) =>
                      setParamDescription(
                        text ??
                          "Hover a hyper-parameter to learn how it shapes the baseline: lookahead steers responsiveness, risk/preview govern braking, and PID/jerk tune the pedals."
                      )
                    }
                    onChange={(value) => setBaselineParams((prev) => ({ ...prev, pidKi: value }))}
                  />
                  <NumberField
                    label="PID kd"
                    value={baselineParams.pidKd}
                    step={0.02}
                    min={0}
                    max={2}
                    description="Derivative gain to damp speed changes. Higher Kd stabilizes braking/accel transitions and reduces overshoot; too high adds lag or dulls response."
                    onHover={(text) =>
                      setParamDescription(
                        text ??
                          "Hover a hyper-parameter to learn how it shapes the baseline: lookahead steers responsiveness, risk/preview govern braking, and PID/jerk tune the pedals."
                      )
                    }
                    onChange={(value) => setBaselineParams((prev) => ({ ...prev, pidKd: value }))}
                  />
                </div>
              </div>
            )}

            {(controlModeSelection === "style" || headToHeadActive) && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Style hyper-parameters</p>
                  <Button size="sm" variant="outline" onClick={() => setStyleParams(styleDefaults)}>
                    Reset
                  </Button>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <NumberField
                    label="Style depth A"
                    value={styleParams.styleA}
                    step={0.01}
                    min={0}
                    max={0.8}
                    description="Depth of the beta warp dip. Higher = more mid-corner slow down."
                    fallbackDescription={styleHint}
                    onHover={(text) => setParamDescription(text ?? styleHint)}
                    onChange={(value) => setStyleParams((prev) => ({ ...prev, styleA: value }))}
                  />
                  <NumberField
                    label="Beta entry"
                    value={styleParams.betaEntry}
                    step={0.2}
                    min={0.5}
                    max={10}
                    description="Beta warp entry shape. Larger shifts the speed dip earlier for safer entry."
                    fallbackDescription={styleHint}
                    onHover={(text) => setParamDescription(text ?? styleHint)}
                    onChange={(value) => setStyleParams((prev) => ({ ...prev, betaEntry: value }))}
                  />
                  <NumberField
                    label="Beta exit"
                    value={styleParams.betaExit}
                    step={0.2}
                    min={0.5}
                    max={10}
                    description="Beta warp exit shape. Larger lifts speed sooner after apex; smaller delays exit push."
                    fallbackDescription={styleHint}
                    onHover={(text) => setParamDescription(text ?? styleHint)}
                    onChange={(value) => setStyleParams((prev) => ({ ...prev, betaExit: value }))}
                  />
                  <NumberField
                    label="Steer gain K0"
                    value={styleParams.K0}
                    step={0.02}
                    min={0}
                    max={2}
                    description="Base steering gain. Higher = more eager turn-in at low speed."
                    fallbackDescription={styleHint}
                    onHover={(text) => setParamDescription(text ?? styleHint)}
                    onChange={(value) => setStyleParams((prev) => ({ ...prev, K0: value }))}
                  />
                  <NumberField
                    label="Steer gain Kv"
                    value={styleParams.KvGain}
                    step={0.02}
                    min={0}
                    max={2}
                    description="Speed-proportional steering gain. Raises authority as speed rises."
                    fallbackDescription={styleHint}
                    onHover={(text) => setParamDescription(text ?? styleHint)}
                    onChange={(value) => setStyleParams((prev) => ({ ...prev, KvGain: value }))}
                  />
                  <NumberField
                    label="Steer gain Kκ"
                    value={styleParams.Kkappa}
                    step={0.05}
                    min={0}
                    max={4}
                    description="Curvature-proportional steering gain. Higher = stronger response in bends."
                    fallbackDescription={styleHint}
                    onHover={(text) => setParamDescription(text ?? styleHint)}
                    onChange={(value) => setStyleParams((prev) => ({ ...prev, Kkappa: value }))}
                  />
                  <NumberField
                    label="Steer damping D"
                    value={styleParams.D}
                    step={0.002}
                    min={0}
                    max={0.2}
                    description="Derivative damping on steering angle. Adds stability and kills oscillations."
                    fallbackDescription={styleHint}
                    onHover={(text) => setParamDescription(text ?? styleHint)}
                    onChange={(value) => setStyleParams((prev) => ({ ...prev, D: value }))}
                  />
                  <NumberField
                    label="Speed tracking Kv_track"
                    value={styleParams.KvTrack}
                    step={0.1}
                    min={0}
                    max={8}
                    description="Linear speed tracking gain inside throttle allocator. Higher = firmer toward target speed."
                    fallbackDescription={styleHint}
                    onHover={(text) => setParamDescription(text ?? styleHint)}
                    onChange={(value) => setStyleParams((prev) => ({ ...prev, KvTrack: value }))}
                  />
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <LookaheadSplineEditor
                    label="Steer lookahead spline"
                    color="#38bdf8"
                    knots={styleParams.steerKnots}
                    deltas={styleParams.steerDeltas}
                    valueScale={styleLookaheadSpacing}
                    defaultKnots={defaultStyleParamConfig.steerKnots.slice()}
                    defaultDeltas={defaultStyleParamConfig.steerDeltas.slice()}
                    onChange={(knots, deltas) =>
                      setStyleParams((prev) => ({
                        ...prev,
                        steerKnots: knots,
                        steerDeltas: deltas,
                      }))
                    }
                  />
                  <LookaheadSplineEditor
                    label="Speed lookahead spline"
                    color="#fbbf24"
                    knots={styleParams.speedKnots}
                    deltas={styleParams.speedDeltas}
                    valueScale={styleLookaheadSpacing}
                    defaultKnots={defaultStyleParamConfig.speedKnots.slice()}
                    defaultDeltas={defaultStyleParamConfig.speedDeltas.slice()}
                    onChange={(knots, deltas) =>
                      setStyleParams((prev) => ({
                        ...prev,
                        speedKnots: knots,
                        speedDeltas: deltas,
                      }))
                    }
                  />
                </div>
              </div>
            )}

            {headToHeadActive ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Style input state</p>
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
                      samples={styleHistory}
                      accessor={(sample) => sample.throttle}
                      range={[0, 1]}
                      color="#34d399"
                    />
                    <InputHistoryGraph
                      label="Brake"
                      samples={styleHistory}
                      accessor={(sample) => sample.brake}
                      range={[0, 1]}
                      color="#fb7185"
                    />
                    <InputHistoryGraph
                      label="Steering"
                      samples={styleHistory}
                      accessor={(sample) => sample.steering}
                      range={steeringRange}
                      color="#38bdf8"
                      formatter={(value) => `${value.toFixed(2)}`}
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Baseline input state</p>
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <ControlBar
                      label="Throttle"
                      value={rivalDisplayedControls.throttle}
                      color="from-emerald-400 to-emerald-300"
                    />
                    <ControlBar
                      label="Brake"
                      value={rivalDisplayedControls.brake}
                      color="from-rose-400 to-amber-300"
                    />
                    <ControlBar
                      label="Steering"
                      value={clampValue(
                        (rivalDisplayedControls.steering - defaultLimits.min_steering_nudge) /
                          Math.max(defaultLimits.max_steering_nudge - defaultLimits.min_steering_nudge, 1e-6),
                        0,
                        1
                      )}
                      color="from-indigo-400 to-purple-300"
                      hint={`${rivalDisplayedControls.steering.toFixed(2)} rad/s`}
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <InputHistoryGraph
                      label="Throttle"
                      samples={baselineHistory}
                      accessor={(sample) => sample.throttle}
                      range={[0, 1]}
                      color="#34d399"
                    />
                    <InputHistoryGraph
                      label="Brake"
                      samples={baselineHistory}
                      accessor={(sample) => sample.brake}
                      range={[0, 1]}
                      color="#fb7185"
                    />
                    <InputHistoryGraph
                      label="Steering"
                      samples={baselineHistory}
                      accessor={(sample) => sample.steering}
                      range={[defaultLimits.min_steering_nudge, defaultLimits.max_steering_nudge]}
                      color="#38bdf8"
                      formatter={(value) => `${value.toFixed(2)} rad/s`}
                    />
                  </div>
                </div>
              </div>
            ) : (
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
                    formatter={(value) =>
                      controlModeSelection === "style" || headToHeadActive
                        ? `${value.toFixed(2)}`
                        : `${value.toFixed(2)} rad/s`
                    }
                  />
                </div>
              </div>
            )}
            <p className="mt-2 text-xs text-slate-300">
              Tap <kbd className="rounded bg-white/10 px-1">R</kbd> to reset the run. Values reflect the active controller.
            </p>
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

function LapTimePill({
  label,
  value,
  muted,
  highlight,
  warn,
}: {
  label: string
  value: string
  muted?: boolean
  highlight?: boolean
  warn?: boolean
}) {
  const tone = muted
    ? "bg-white/10 text-slate-200 border-white/10"
    : warn
      ? "bg-amber-500/20 text-amber-50 border-amber-300/40"
      : highlight
        ? "bg-emerald-500/20 text-emerald-50 border-emerald-400/30"
        : "bg-sky-500/15 text-sky-50 border-sky-400/25"
  return (
    <div className={cn("flex-1 rounded-lg border px-3 py-2 shadow-md backdrop-blur", tone)}>
      <span className="text-[10px] uppercase tracking-[0.2em]">{label}</span>
      <p className="text-lg font-semibold leading-tight">{value}</p>
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

type TimeSample = { t: number }

function InputHistoryGraph<T extends TimeSample>({
  label,
  samples,
  accessor,
  range,
  color,
  formatter = (value: number) => `${Math.round(value * 100)}%`,
}: {
  label: string
  samples: T[]
  accessor: (sample: T) => number
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

function NumberField({
  label,
  value,
  onChange,
  step = 0.1,
  min,
  max,
  description,
  onHover,
  fallbackDescription = baselineHint,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
  max?: number
  description?: string
  onHover?: (text: string | null) => void
  fallbackDescription?: string
}) {
  const decimals =
    step >= 1 ? 0 : Math.min(6, Math.max(0, Math.ceil(-Math.log10(step || 1e-6)) + 1))
  const displayValue = Number.isFinite(value) ? value.toFixed(decimals) : ""
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-200">
      <span className="uppercase tracking-[0.2em] text-slate-400">{label}</span>
      <Input
        type="number"
        value={displayValue}
        step={step}
        min={min}
        max={max}
        onChange={(event) => {
          const parsed = Number(event.target.value)
          onChange(Number.isFinite(parsed) ? parsed : value)
        }}
        className="bg-slate-900/60 text-white"
        onMouseEnter={() => {
          if (description) onHover?.(description)
        }}
        onMouseLeave={() =>
          onHover?.(fallbackDescription)
        }
      />
    </label>
  )
}
