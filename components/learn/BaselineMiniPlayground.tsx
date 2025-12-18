'use client'

import { useMemo, useState } from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"
import { makeLoop, offsetLoop, type TrackPoint } from "@/components/learn/track"

type ControlKey = "preview" | "lookaheadGain" | "risk" | "kp" | "jerk"

type Control = {
  key: ControlKey
  label: string
  min: number
  max: number
  step: number
  defaultValue: number
  suffix: string
  hint: string
}

const controls: Control[] = [
  {
    key: "preview",
    label: "Preview distance",
    min: 8,
    max: 26,
    step: 1,
    defaultValue: 16,
    suffix: " m",
    hint: "Longer preview smooths steering but slows entries.",
  },
  {
    key: "lookaheadGain",
    label: "Lookahead gain",
    min: 0.12,
    max: 0.45,
    step: 0.01,
    defaultValue: 0.22,
    suffix: "",
    hint: "Higher gain snaps to apex quicker.",
  },
  {
    key: "risk",
    label: "Risk scale",
    min: 0.6,
    max: 1.1,
    step: 0.02,
    defaultValue: 0.85,
    suffix: "×",
    hint: "Pushes target speed closer to grip limit.",
  },
  {
    key: "kp",
    label: "Speed PID Kp",
    min: 0.6,
    max: 1.4,
    step: 0.02,
    defaultValue: 1.0,
    suffix: "",
    hint: "Higher = sharper pedal response.",
  },
  {
    key: "jerk",
    label: "Jerk limit",
    min: 6,
    max: 12,
    step: 0.2,
    defaultValue: 8,
    suffix: " m/s³",
    hint: "Caps pedal change rate; lower feels calmer.",
  },
]

const ovalTrack: TrackPoint[] = [
  { x: 24, y: 72 },
  { x: 52, y: 26 },
  { x: 106, y: 14 },
  { x: 162, y: 26 },
  { x: 188, y: 72 },
  { x: 162, y: 116 },
  { x: 106, y: 130 },
  { x: 52, y: 116 },
]

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export default function BaselineMiniPlayground() {
  const { closedPoints, times, pathD } = useMemo(() => makeLoop(ovalTrack), [])
  const [state, setState] = useState<Record<ControlKey, number>>(
    controls.reduce(
      (acc, control) => ({ ...acc, [control.key]: control.defaultValue }),
      {} as Record<ControlKey, number>
    )
  )

  const lookaheadOffset = useMemo(
    () => Math.max(1, Math.round((state.preview - 8) / 3)),
    [state.preview]
  )
  const targetOffset = useMemo(
    () => Math.max(2, lookaheadOffset + 1),
    [lookaheadOffset]
  )

  const lookahead = useMemo(
    () => offsetLoop(ovalTrack, lookaheadOffset),
    [lookaheadOffset]
  )
  const target = useMemo(
    () => offsetLoop(ovalTrack, targetOffset),
    [targetOffset]
  )

  const xKeyframes = closedPoints.map((point) => point.x)
  const yKeyframes = closedPoints.map((point) => point.y)
  const lookaheadX = lookahead.map((point) => point.x)
  const lookaheadY = lookahead.map((point) => point.y)
  const targetX = target.map((point) => point.x)
  const targetY = target.map((point) => point.y)

  const lapSeconds = useMemo(() => {
    const riskBoost = 1 - (state.risk - 0.6) * 0.32
    const previewPenalty = 1 + (state.preview - 16) * 0.01
    const gainBoost = 1 - (state.lookaheadGain - 0.22) * 0.5
    const kpBoost = 1 - (state.kp - 1.0) * 0.18
    const jerkPenalty = 1 + (8 - state.jerk) * 0.04

    return clamp(11 * riskBoost * previewPenalty * gainBoost * kpBoost * jerkPenalty, 9.2, 13.2)
  }, [state])

  const stabilityScore = useMemo(() => {
    const previewHelp = (state.preview - 8) / 18
    const riskHit = (state.risk - 0.6) * 0.6
    const kpSwing = Math.abs(state.kp - 1.0) * 0.6
    return clamp(0.62 + previewHelp - riskHit - kpSwing, 0, 1)
  }, [state])

  const entrySpeed = useMemo(() => {
    const base = 20
    const riskAdd = (state.risk - 0.6) * 12
    const previewCut = (state.preview - 16) * 0.6
    const gainAdd = (state.lookaheadGain - 0.22) * 30
    return clamp(base + riskAdd - previewCut + gainAdd, 16, 36)
  }, [state])

  const brakeLoad = useMemo(() => {
    const risk = (state.risk - 0.6) * 0.4
    const jerk = (12 - state.jerk) * 0.06
    const kp = (state.kp - 1.0) * 0.2
    return clamp(0.4 + risk + jerk + kp, 0, 1)
  }, [state])

  const sharedMotion = {
    transition: { repeat: Infinity, ease: "linear", duration: lapSeconds, times },
  }

  return (
    <div className="mb-10 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/50 via-background to-emerald-50 p-6 shadow-sm ring-1 ring-border/60 dark:to-sky-950/20">
      <div className="mb-4 flex items-center justify-between text-sm font-semibold text-muted-foreground">
        <div>
          <div className="text-xs uppercase tracking-wide">Challenge: tame the oval</div>
          <div className="text-sm text-muted-foreground">
            Tune just the core baseline hyper-parameters on the oval track.
          </div>
        </div>
        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          Baseline only
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="relative flex-1 overflow-hidden rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/40 p-3 shadow-inner backdrop-blur dark:from-neutral-900/50 dark:via-background dark:to-neutral-900/40">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.08),transparent_30%),radial-gradient(circle_at_75%_70%,rgba(59,130,246,0.08),transparent_30%)]" />
          <svg viewBox="0 0 210 150" className="relative h-[230px] w-full" role="presentation">
            <defs>
              <linearGradient id="baselineTrackGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(34,197,94,0.85)" />
                <stop offset="100%" stopColor="rgba(59,130,246,0.85)" />
              </linearGradient>
            </defs>
            <motion.path
              d={pathD}
              fill="none"
              stroke="url(#baselineTrackGradient)"
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1 }}
              className="drop-shadow-[0_4px_12px_rgba(16,185,129,0.2)]"
            />
            <motion.path
              d={pathD}
              fill="none"
              stroke="rgba(99,102,241,0.35)"
              strokeWidth={8}
              strokeDasharray="14 18"
              strokeLinecap="round"
              animate={{ pathOffset: [0, 1] }}
              transition={{ repeat: Infinity, duration: lapSeconds * 1.1, ease: "linear" }}
            />

            <motion.line
              animate={{ x1: xKeyframes, y1: yKeyframes, x2: lookaheadX, y2: lookaheadY }}
              stroke="rgba(16,185,129,0.7)"
              strokeWidth={2}
              strokeDasharray="6 6"
              {...sharedMotion}
            />
            <motion.circle
              r={4.6}
              fill="rgba(16,185,129,0.95)"
              stroke="white"
              strokeWidth={1.4}
              animate={{ cx: lookaheadX, cy: lookaheadY }}
              {...sharedMotion}
            />
            <motion.circle
              r={6.2}
              fill="rgba(59,130,246,0.95)"
              stroke="white"
              strokeWidth={1.6}
              animate={{ cx: xKeyframes, cy: yKeyframes }}
              {...sharedMotion}
            />
            <motion.circle
              r={3.2}
              fill="rgba(248,113,113,0.9)"
              stroke="white"
              strokeWidth={1.2}
              animate={{ cx: targetX, cy: targetY }}
              {...sharedMotion}
            />
          </svg>

          <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-2 rounded-xl border border-white/30 bg-white/80 px-3 py-2 text-[11px] font-semibold text-neutral-800 shadow-sm backdrop-blur dark:border-white/10 dark:bg-neutral-900/80 dark:text-neutral-50">
            <TelemetryRow label="Target speed" value={`${entrySpeed.toFixed(1)} m/s`} color="bg-emerald-500" />
            <TelemetryRow
              label="Steering δ"
              value={`${(state.lookaheadGain * 14 + 2).toFixed(1)}°`}
              color="bg-sky-500"
            />
            <TelemetryRow label="Accel a_x" value={`${(state.kp * 1.8 - 0.5).toFixed(2)} m/s²`} color="bg-amber-500" />
          </div>

          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <LegendDot color="bg-sky-500" label="Vehicle state" />
            <LegendDot color="bg-emerald-500" label="Lookahead target" />
            <LegendDot color="bg-rose-400" label="Preview point" />
          </div>
        </div>

        <div className="w-full space-y-4 lg:w-80">
          <div className="rounded-2xl border bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
              <span>Lap time estimate</span>
              <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                Oval
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <motion.div
                key={lapSeconds}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="text-3xl font-semibold text-foreground"
              >
                {lapSeconds.toFixed(2)}s
              </motion.div>
              <div className="text-sm text-muted-foreground">projected</div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <MetricPill label="Stability" value={stabilityScore} />
              <MetricPill label="Brake load" value={brakeLoad} accent="bg-amber-500" />
            </div>
          </div>

          <div className="rounded-2xl border bg-muted/40 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
              Hyper-parameters that matter
            </div>
            <div className="space-y-3">
              {controls.map((control) => (
                <ControlSlider
                  key={control.key}
                  control={control}
                  value={state[control.key]}
                  onChange={(next) => setState((prev) => ({ ...prev, [control.key]: next }))}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ControlSlider({
  control,
  value,
  onChange,
}: {
  control: Control
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="rounded-xl border border-white/30 bg-white/70 p-3 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/60">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{control.label}</span>
        {(() => {
          const decimals = control.step >= 1 ? 0 : control.step >= 0.1 ? 1 : 2
          return (
            <span className="text-foreground">
              {value.toFixed(decimals)}
              {control.suffix}
            </span>
          )
        })()}
      </div>
      <input
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        onChange={(event) => onChange(parseFloat(event.target.value))}
        className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-emerald-500"
      />
      <div className="mt-1 text-[11px] text-muted-foreground">{control.hint}</div>
    </div>
  )
}

function MetricPill({ label, value, accent = "bg-emerald-500" }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl border bg-background/70 p-3 shadow-sm dark:border-neutral-800">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-center gap-2">
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <motion.div
            className={cn("absolute inset-y-0 left-0 rounded-full", accent)}
            animate={{ width: `${Math.round(value * 100)}%` }}
            transition={{ type: "spring", stiffness: 140, damping: 18 }}
          />
        </div>
        <div className="text-sm font-semibold text-foreground">{Math.round(value * 100)}%</div>
      </div>
    </div>
  )
}

function TelemetryRow({ label, value, color }: { label: string; value: string; color: string }) {
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
