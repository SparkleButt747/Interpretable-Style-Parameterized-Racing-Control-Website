'use client'

import { useMemo, useState } from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"
import { makeLoop, offsetLoop, type TrackPoint } from "@/components/learn/track"

type ControlKey = "kDelta" | "lookahead" | "slowdown"

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
    key: "kDelta",
    label: "Steering gain kδ",
    min: 0.8,
    max: 2.2,
    step: 0.05,
    defaultValue: 1.3,
    suffix: "",
    hint: "Higher gain snaps to the path but can chatter.",
  },
  {
    key: "lookahead",
    label: "Lookahead L",
    min: 4,
    max: 20,
    step: 0.5,
    defaultValue: 10,
    suffix: " m",
    hint: "Further target smooths steering but misses apexes.",
  },
  {
    key: "slowdown",
    label: "Slowdown strength",
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: 0.35,
    suffix: "×",
    hint: "Cuts throttle as heading error grows.",
  },
]

const naiveTrack: TrackPoint[] = [
  { x: 26, y: 110 },
  { x: 60, y: 46 },
  { x: 112, y: 36 },
  { x: 160, y: 66 },
  { x: 186, y: 110 },
  { x: 150, y: 128 },
  { x: 94, y: 120 },
  { x: 52, y: 134 },
]

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export default function NaiveBaselineDemo() {
  const { closedPoints, times, pathD } = useMemo(() => makeLoop(naiveTrack), [])
  const [state, setState] = useState<Record<ControlKey, number>>(
    controls.reduce(
      (acc, control) => ({ ...acc, [control.key]: control.defaultValue }),
      {} as Record<ControlKey, number>
    )
  )

  const lookaheadOffset = useMemo(
    () => Math.max(1, Math.round((state.lookahead - 4) / 2.5)),
    [state.lookahead]
  )
  const targetOffset = useMemo(
    () => Math.max(2, lookaheadOffset + 1),
    [lookaheadOffset]
  )

  const lookahead = useMemo(
    () => offsetLoop(naiveTrack, lookaheadOffset),
    [lookaheadOffset]
  )
  const target = useMemo(
    () => offsetLoop(naiveTrack, targetOffset),
    [targetOffset]
  )

  const xKeyframes = closedPoints.map((point) => point.x)
  const yKeyframes = closedPoints.map((point) => point.y)
  const lookaheadX = lookahead.map((point) => point.x)
  const lookaheadY = lookahead.map((point) => point.y)
  const targetX = target.map((point) => point.x)
  const targetY = target.map((point) => point.y)

  const oscillationRisk = useMemo(() => {
    const gain = (state.kDelta - 1.2) * 0.7
    const previewHelp = (state.lookahead - 6) * 0.03
    return clamp(0.25 + gain - previewHelp, 0, 1)
  }, [state.kDelta, state.lookahead])

  const apexMiss = useMemo(() => {
    const preview = (state.lookahead - 10) * 0.06
    return clamp(0.3 + preview, 0, 1)
  }, [state.lookahead])

  const slowdownCut = useMemo(() => clamp(state.slowdown * 1, 0, 1), [state.slowdown])

  const entrySpeed = useMemo(() => {
    const base = 24
    const throttleLoss = slowdownCut * 9
    const gainKick = (state.kDelta - 1.2) * 2
    const previewDrag = (state.lookahead - 10) * 0.5
    return clamp(base + gainKick - throttleLoss - previewDrag, 16, 32)
  }, [slowdownCut, state.kDelta, state.lookahead])

  const chatter = oscillationRisk * 6 + 2

  const lapSeconds = useMemo(() => {
    const gainBoost = 1 - (state.kDelta - 1.0) * 0.12
    const previewPenalty = 1 + (state.lookahead - 10) * 0.02
    const slowPenalty = 1 + slowdownCut * 0.4
    return clamp(11 * gainBoost * previewPenalty * slowPenalty, 8.5, 14)
  }, [slowdownCut, state.kDelta, state.lookahead])

  const sharedMotion = {
    transition: { repeat: Infinity, ease: "linear", duration: lapSeconds, times },
  }

  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-amber-50 p-6 shadow-sm ring-1 ring-border/70 dark:to-amber-900/10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Naive controller demo
          </div>
          <div className="text-sm text-muted-foreground">
            Aim at the next checkpoint; watch how the simple rules break.
          </div>
        </div>
        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Baseline (naive)</div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="relative flex-1 overflow-hidden rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/30 p-3 shadow-inner backdrop-blur dark:from-neutral-900/50 dark:via-background dark:to-neutral-900/30">
          <svg viewBox="0 0 210 150" className="relative h-[230px] w-full" role="presentation">
            <defs>
              <linearGradient id="naiveTrackGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(234,179,8,0.85)" />
                <stop offset="100%" stopColor="rgba(59,130,246,0.85)" />
              </linearGradient>
            </defs>
            <motion.path
              d={pathD}
              fill="none"
              stroke="url(#naiveTrackGradient)"
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1 }}
              className="drop-shadow-[0_4px_12px_rgba(234,179,8,0.25)]"
            />
            <motion.path
              d={pathD}
              fill="none"
              stroke="rgba(99,102,241,0.3)"
              strokeWidth={8}
              strokeDasharray="14 18"
              strokeLinecap="round"
              animate={{ pathOffset: [0, 1] }}
              transition={{ repeat: Infinity, duration: lapSeconds * 1.1, ease: "linear" }}
            />

            <motion.line
              animate={{ x1: xKeyframes, y1: yKeyframes, x2: lookaheadX, y2: lookaheadY }}
              stroke="rgba(251,146,60,0.9)"
              strokeWidth={2}
              strokeDasharray="6 6"
              {...sharedMotion}
            />
            <motion.circle
              r={4.6}
              fill="rgba(251,146,60,0.9)"
              stroke="white"
              strokeWidth={1.4}
              animate={{ cx: lookaheadX, cy: lookaheadY }}
              {...sharedMotion}
            />
            <motion.circle
              r={6.4}
              fill="rgba(59,130,246,0.95)"
              stroke="white"
              strokeWidth={1.6}
              animate={{
                cx: xKeyframes,
                cy: yKeyframes,
                scale: [1 - oscillationRisk * 0.08, 1 + oscillationRisk * 0.08, 1 - oscillationRisk * 0.08],
              }}
              transition={{ ...sharedMotion.transition, repeat: Infinity }}
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

          <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-2 rounded-xl border border-white/30 bg-white/85 px-3 py-2 text-[11px] shadow-sm backdrop-blur dark:border-white/10 dark:bg-neutral-900/85">
            <TelemetryRow label="Heading error eψ" value={`${chatter.toFixed(1)}° rms`} color="bg-amber-500" />
            <TelemetryRow label="Target speed" value={`${entrySpeed.toFixed(1)} m/s`} color="bg-emerald-500" />
            <TelemetryRow label="Throttle cut" value={`${Math.round(slowdownCut * 100)}%`} color="bg-rose-400" />
          </div>

          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <LegendDot color="bg-sky-500" label="Vehicle pose" />
            <LegendDot color="bg-amber-500" label="Lookahead target" />
            <LegendDot color="bg-rose-400" label="Preview point" />
          </div>
        </div>

        <div className="w-full space-y-4 lg:w-80">
          <div className="rounded-2xl border bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Rules in play</div>
            <div className="mt-2 text-sm text-foreground">
              <div className="font-semibold">
                δ = clip(kδ ⋅ eψ, −δ<sub>max</sub>, δ<sub>max</sub>)
              </div>
              <div className="text-[12px] text-muted-foreground">
                Turn harder as heading error grows.
              </div>
              <div className="mt-2 font-semibold">
                a<sub>x</sub> = a<sub>max</sub>(1 − |eψ / eψ,max|)
              </div>
              <div className="text-[12px] text-muted-foreground">
                Cut throttle when pointing off-path.
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <MetricPill label="Oscillation" value={oscillationRisk} accent="bg-amber-500" />
              <MetricPill label="Lazy apex" value={apexMiss} accent="bg-sky-500" />
              <MetricPill label="Slowdown" value={slowdownCut} accent="bg-rose-500" />
            </div>
          </div>

          <div className="rounded-2xl border bg-muted/40 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
              Tweak the naive hyper-parameters
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
  const decimals = control.step >= 1 ? 0 : control.step >= 0.1 ? 1 : 2
  return (
    <div className="rounded-xl border border-white/30 bg-white/70 p-3 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/60">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{control.label}</span>
        <span className="text-foreground">
          {value.toFixed(decimals)}
          {control.suffix}
        </span>
      </div>
      <input
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        onChange={(event) => onChange(parseFloat(event.target.value))}
        className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-amber-500"
      />
      <div className="mt-1 text-[11px] text-muted-foreground">{control.hint}</div>
    </div>
  )
}

function MetricPill({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl border bg-background/70 p-3 shadow-sm dark:border-neutral-800">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
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
