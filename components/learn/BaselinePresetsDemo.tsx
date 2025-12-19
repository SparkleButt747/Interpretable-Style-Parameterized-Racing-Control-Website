'use client'

import { useMemo, useState } from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"
import { makeLoop, offsetLoop, type TrackPoint } from "@/components/learn/track"

type PresetKey = "conservative" | "aggressive"

const presets: Record<
  PresetKey,
  { label: string; lookahead: number; kp: number; kd: number; smooth: number; description: string }
> = {
  conservative: {
    label: "Conservative",
    lookahead: 16,
    kp: 0.9,
    kd: 0.06,
    smooth: 0.8,
    description: "Longer L, softer gains, tighter rate limits.",
  },
  aggressive: {
    label: "Aggressive",
    lookahead: 8,
    kp: 1.3,
    kd: 0.12,
    smooth: 0.45,
    description: "Short L, sharper gains, looser smoothing.",
  },
}

const demoTrack: TrackPoint[] = [
  { x: 18, y: 98 },
  { x: 54, y: 46 },
  { x: 110, y: 40 },
  { x: 160, y: 76 },
  { x: 130, y: 118 },
  { x: 78, y: 110 },
  { x: 40, y: 124 },
]

const linearEase = (t: number) => t

export default function BaselinePresetsDemo() {
  const { closedPoints, times, pathD } = useMemo(() => makeLoop(demoTrack), [])
  const [preset, setPreset] = useState<PresetKey>("conservative")
  const config = presets[preset]

  const lookaheadOffset = useMemo(
    () => Math.max(1, Math.round((config.lookahead - 6) / 3)),
    [config.lookahead]
  )
  const target = useMemo(() => offsetLoop(demoTrack, lookaheadOffset), [lookaheadOffset])

  const xKeyframes = closedPoints.map((p) => p.x)
  const yKeyframes = closedPoints.map((p) => p.y)
  const targetX = target.map((p) => p.x)
  const targetY = target.map((p) => p.y)

  const lapSeconds = useMemo(
    () => (preset === "conservative" ? 12.4 : 10.8),
    [preset]
  )
  const stabilityScore = useMemo(
    () => (preset === "conservative" ? 0.86 : 0.62),
    [preset]
  )

  const sharedMotion = {
    transition: { repeat: Infinity, ease: linearEase, duration: lapSeconds, times },
  }

  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-emerald-50 p-6 shadow-sm ring-1 ring-border/70 dark:to-sky-900/10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Baseline presets: Conservative vs Aggressive
          </div>
          <div className="text-sm text-muted-foreground">
            Different L, gains, and smoothing — see pace vs stability shift.
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-background/80 p-1 shadow-sm ring-1 ring-border/80">
          {(Object.keys(presets) as PresetKey[]).map((key) => {
            const option = presets[key]
            const active = preset === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPreset(key)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  active ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="relative flex-1 overflow-hidden rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/30 p-3 shadow-inner backdrop-blur dark:from-neutral-900/50 dark:via-background dark:to-neutral-900/30">
          <svg viewBox="0 0 200 150" className="relative h-[230px] w-full" role="presentation">
            <defs>
              <linearGradient id="presetTrack" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(16,185,129,0.85)" />
                <stop offset="100%" stopColor="rgba(59,130,246,0.85)" />
              </linearGradient>
            </defs>
            <motion.path
              d={pathD}
              fill="none"
              stroke="url(#presetTrack)"
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1 }}
            />
            <motion.path
              d={pathD}
              fill="none"
              stroke="rgba(99,102,241,0.3)"
              strokeWidth={8}
              strokeDasharray="14 18"
              strokeLinecap="round"
              animate={{ pathOffset: [0, 1] }}
              transition={{ repeat: Infinity, duration: lapSeconds * 1.1, ease: linearEase }}
            />

            <motion.line
              animate={{ x1: xKeyframes, y1: yKeyframes, x2: targetX, y2: targetY }}
              stroke="rgba(16,185,129,0.7)"
              strokeWidth={2}
              strokeDasharray="6 6"
              {...sharedMotion}
            />
            <motion.circle
              r={4.8}
              fill="rgba(16,185,129,0.9)"
              stroke="white"
              strokeWidth={1.4}
              animate={{ cx: targetX, cy: targetY }}
              {...sharedMotion}
            />
            <motion.circle
              r={6.4}
              fill="rgba(59,130,246,0.95)"
              stroke="white"
              strokeWidth={1.6}
              animate={{ cx: xKeyframes, cy: yKeyframes }}
              {...sharedMotion}
            />
          </svg>

          <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-2 rounded-xl border border-white/30 bg-white/85 px-3 py-2 text-[11px] shadow-sm backdrop-blur dark:border-white/10 dark:bg-neutral-900/85">
            <Metric label="Lookahead L" value={`${config.lookahead.toFixed(1)} m`} color="bg-emerald-500" />
            <Metric label="Steer gain Kp" value={`${config.kp.toFixed(2)}`} color="bg-sky-500" />
            <Metric label="Damping Kd" value={`${config.kd.toFixed(2)}`} color="bg-amber-500" />
          </div>

          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <LegendDot color="bg-sky-500" label="Vehicle" />
            <LegendDot color="bg-emerald-500" label="Lookahead target" />
          </div>
        </div>

        <div className="w-full space-y-4 lg:w-72">
          <div className="rounded-2xl border bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Preset profile</div>
            <div className="mt-2 text-sm font-semibold text-foreground">{config.label}</div>
            <div className="text-[11px] text-muted-foreground">{config.description}</div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Metric label="Lap estimate" value={`${lapSeconds.toFixed(2)} s`} />
              <Metric label="Stability" value={`${Math.round(stabilityScore * 100)}%`} />
            </div>
          </div>
          <div className="rounded-2xl border bg-muted/40 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Smoothness</div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-500"
                animate={{ width: `${config.smooth * 100}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Higher smoothing caps rate/jerk; conservative &gt; aggressive.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      {color && <span className={cn("h-2 w-2 rounded-full", color)} />}
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-[11px] text-foreground">{value}</span>
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
