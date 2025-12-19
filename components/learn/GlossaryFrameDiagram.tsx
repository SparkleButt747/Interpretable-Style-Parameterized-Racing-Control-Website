'use client'

import { useMemo } from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"
import { makeLoop, type TrackPoint } from "@/components/learn/track"

const frameTrack: TrackPoint[] = [
  { x: 32, y: 96 },
  { x: 62, y: 48 },
  { x: 118, y: 32 },
  { x: 168, y: 70 },
  { x: 144, y: 118 },
  { x: 92, y: 130 },
  { x: 54, y: 110 },
]

const linearEase = (t: number) => t

type Vector = { x: number; y: number }

export default function GlossaryFrameDiagram() {
  const { closedPoints, times, pathD } = useMemo(() => makeLoop(frameTrack), [])

  const normals = useMemo(() => computeNormals(closedPoints, 12), [closedPoints])
  const tangents = useMemo(() => computeTangents(closedPoints, 16), [closedPoints])
  const angles = useMemo(() => computeAngles(tangents), [tangents])

  const carPoints = useMemo(
    () => closedPoints.map((point, index) => add(point, normals[index])),
    [closedPoints, normals]
  )

  const carX = carPoints.map((point) => point.x)
  const carY = carPoints.map((point) => point.y)
  const pathX = closedPoints.map((point) => point.x)
  const pathY = closedPoints.map((point) => point.y)
  const eyX = closedPoints.map((point, index) => point.x + normals[index].x)
  const eyY = closedPoints.map((point, index) => point.y + normals[index].y)

  const tangentEndX = carPoints.map((point, index) => point.x + tangents[index].x)
  const tangentEndY = carPoints.map((point, index) => point.y + tangents[index].y)

  const headingOffset = 14 * (Math.PI / 180)
  const headingVectors = tangents.map((vec) => rotate(vec, headingOffset))
  const headingEndX = carPoints.map((point, index) => point.x + headingVectors[index].x)
  const headingEndY = carPoints.map((point, index) => point.y + headingVectors[index].y)
  const headingAnglesDeg = angles.map((angle) => radToDeg(angle + headingOffset))

  const frictionAngles = [0.35, -0.3, 0.1, -0.45, -0.1]
  const frictionRadius = 28
  const frictionX = frictionAngles.map(
    (angle) => 42 + Math.cos(angle) * frictionRadius
  )
  const frictionY = frictionAngles.map(
    (angle) => 42 + Math.sin(angle) * frictionRadius
  )

  const sharedMotion = {
    transition: { repeat: Infinity, ease: linearEase, duration: 11.5, times },
  }

  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-emerald-50 p-6 shadow-sm ring-1 ring-border/70 dark:to-sky-900/10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tangent / normal frame
          </div>
          <div className="text-sm text-muted-foreground">
            Shows $e_y$ (cross-track) and $e_\\psi$ (heading) relative to the path.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <LegendDot color="bg-sky-500" label="Path tangent" />
          <LegendDot color="bg-emerald-500" label="Heading" />
          <LegendDot color="bg-amber-500" label="Cross-track $e_y$" />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/30 p-3 shadow-inner backdrop-blur dark:from-neutral-900/50 dark:via-background dark:to-neutral-900/30">
        <svg viewBox="0 0 210 150" className="relative h-[230px] w-full" role="presentation">
          <defs>
            <linearGradient id="frameTrackGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(59,130,246,0.85)" />
              <stop offset="100%" stopColor="rgba(16,185,129,0.85)" />
            </linearGradient>
          </defs>
          <motion.path
            d={pathD}
            fill="none"
            stroke="url(#frameTrackGradient)"
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1 }}
            className="drop-shadow-[0_4px_12px_rgba(59,130,246,0.2)]"
          />
          <motion.path
            d={pathD}
            fill="none"
            stroke="rgba(99,102,241,0.3)"
            strokeWidth={8}
            strokeDasharray="14 18"
            strokeLinecap="round"
            animate={{ pathOffset: [0, 1] }}
            transition={{ repeat: Infinity, duration: 10, ease: linearEase }}
          />

          <motion.line
            animate={{ x1: pathX, y1: pathY, x2: eyX, y2: eyY }}
            stroke="rgba(245,158,11,0.9)"
            strokeWidth={2.2}
            strokeDasharray="4 6"
            {...sharedMotion}
          />

          <motion.line
            animate={{ x1: carX, y1: carY, x2: tangentEndX, y2: tangentEndY }}
            stroke="rgba(59,130,246,0.95)"
            strokeWidth={3}
            strokeLinecap="round"
            {...sharedMotion}
          />
          <motion.line
            animate={{ x1: carX, y1: carY, x2: headingEndX, y2: headingEndY }}
            stroke="rgba(16,185,129,0.95)"
            strokeWidth={3}
            strokeLinecap="round"
            {...sharedMotion}
          />

          <motion.circle
            r={6.2}
            fill="rgba(16,185,129,0.95)"
            stroke="white"
            strokeWidth={1.6}
            animate={{ cx: carX, cy: carY, rotate: headingAnglesDeg }}
            {...sharedMotion}
          />
          <motion.circle
            r={3.2}
            fill="rgba(248,113,113,0.9)"
            stroke="white"
            strokeWidth={1.2}
            animate={{ cx: pathX, cy: pathY }}
            {...sharedMotion}
          />
        </svg>

        <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-2 rounded-xl border border-white/30 bg-white/85 px-3 py-2 text-[11px] shadow-sm backdrop-blur dark:border-white/10 dark:bg-neutral-900/85">
          <Metric label="Cross-track $e_y$" value="~1.2 m" color="bg-amber-500" />
          <Metric label="Heading $e_\\psi$" value="~14°" color="bg-emerald-500" />
        </div>

        <div className="pointer-events-none absolute right-3 top-3 flex flex-col gap-2 rounded-xl border border-white/30 bg-white/85 px-3 py-2 text-[11px] shadow-sm backdrop-blur dark:border-white/10 dark:bg-neutral-900/85">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Frames</div>
          <div className="text-[12px] text-muted-foreground">
            Tangent aligns with path; normal points left of travel.
          </div>
        </div>

        <div className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-3 rounded-xl border border-white/30 bg-white/90 px-3 py-2 text-[11px] shadow-sm backdrop-blur dark:border-white/10 dark:bg-neutral-900/85">
          <svg viewBox="0 0 90 90" className="h-16 w-16" role="presentation">
            <circle
              cx={42}
              cy={42}
              r={frictionRadius}
              fill="rgba(16,185,129,0.08)"
              stroke="rgba(16,185,129,0.6)"
              strokeWidth={2}
            />
            <motion.line
              x1={42}
              y1={42}
              animate={{ x2: frictionX, y2: frictionY }}
              stroke="rgba(59,130,246,0.95)"
              strokeWidth={3}
              strokeLinecap="round"
              transition={{ repeat: Infinity, ease: "easeInOut", duration: 3.2 }}
            />
            <motion.circle
              r={4}
              fill="rgba(59,130,246,0.95)"
              stroke="white"
              strokeWidth={1.2}
              animate={{ cx: frictionX, cy: frictionY }}
              transition={{ repeat: Infinity, ease: "easeInOut", duration: 3.2 }}
            />
          </svg>
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Friction budget</div>
            <div className="text-sm font-semibold text-foreground">a_x + a_y within μg</div>
            <div className="text-[11px] text-muted-foreground">
              Vector tip moves inside the friction circle.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function computeNormals(points: TrackPoint[], magnitude: number): Vector[] {
  const normals: Vector[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x
    const dy = points[i + 1].y - points[i].y
    const len = Math.hypot(dx, dy) || 1
    normals.push({ x: (-dy / len) * magnitude, y: (dx / len) * magnitude })
  }
  normals.push(normals[normals.length - 1] ?? { x: 0, y: 0 })
  return normals
}

function computeTangents(points: TrackPoint[], magnitude: number): Vector[] {
  const tangents: Vector[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x
    const dy = points[i + 1].y - points[i].y
    const len = Math.hypot(dx, dy) || 1
    tangents.push({ x: (dx / len) * magnitude, y: (dy / len) * magnitude })
  }
  tangents.push(tangents[tangents.length - 1] ?? { x: 0, y: 0 })
  return tangents
}

function computeAngles(vectors: Vector[]) {
  return vectors.map((vec) => Math.atan2(vec.y, vec.x))
}

function rotate(vec: Vector, angle: number): Vector {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { x: vec.x * cos - vec.y * sin, y: vec.x * sin + vec.y * cos }
}

function add(a: Vector, b: Vector): Vector {
  return { x: a.x + b.x, y: a.y + b.y }
}

function radToDeg(rad: number) {
  return (rad * 180) / Math.PI
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/70 px-2 py-1 shadow-sm backdrop-blur dark:bg-neutral-900/70">
      <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
      <span>{label}</span>
    </div>
  )
}
