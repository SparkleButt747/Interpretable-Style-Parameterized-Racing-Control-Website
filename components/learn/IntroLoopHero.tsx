'use client'

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"
import { makeLoop, offsetLoop, type TrackPoint } from "@/components/learn/track"

type StyleFrame = {
  apex: number
  entry: number
  risk: number
  smooth: number
}

const heroTrack: TrackPoint[] = [
  { x: 30, y: 28 },
  { x: 96, y: 16 },
  { x: 162, y: 30 },
  { x: 186, y: 72 },
  { x: 160, y: 112 },
  { x: 112, y: 130 },
  { x: 68, y: 120 },
  { x: 36, y: 92 },
]

const sliderFrames: StyleFrame[] = [
  { apex: 0.42, entry: 0.62, risk: 0.32, smooth: 0.78 },
  { apex: 0.55, entry: 0.48, risk: 0.52, smooth: 0.64 },
  { apex: 0.47, entry: 0.56, risk: 0.62, smooth: 0.52 },
  { apex: 0.50, entry: 0.66, risk: 0.38, smooth: 0.82 },
]

const loopSteps = [
  { title: "State", detail: "Pose, velocity, curvature error, slip." },
  { title: "Controller", detail: "Preview point + style sliders warp the plan." },
  { title: "Inputs", detail: "δ steering, a_x accel, jerk + rate limits." },
  { title: "Motion", detail: "Integrate + re-sense → back to state." },
]

const knobLabels: Array<{ key: keyof StyleFrame; label: string }> = [
  { key: "apex", label: "Apex offset" },
  { key: "entry", label: "Entry vs exit" },
  { key: "risk", label: "Risk" },
  { key: "smooth", label: "Smoothness" },
]

export default function IntroLoopHero() {
  const { closedPoints, times, pathD } = useMemo(() => makeLoop(heroTrack), [])
  const lookahead = useMemo(() => offsetLoop(heroTrack, 2), [])
  const target = useMemo(() => offsetLoop(heroTrack, 4), [])

  const xKeyframes = closedPoints.map((point) => point.x)
  const yKeyframes = closedPoints.map((point) => point.y)
  const lookaheadX = lookahead.map((point) => point.x)
  const lookaheadY = lookahead.map((point) => point.y)
  const targetX = target.map((point) => point.x)
  const targetY = target.map((point) => point.y)

  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      setFrame((prev) => (prev + 1) % sliderFrames.length)
    }, 1900)

    return () => clearInterval(id)
  }, [])

  const activeStep = frame % loopSteps.length
  const styleFrame = sliderFrames[frame]
  const deltaDeg = (styleFrame.apex * 16 - 6).toFixed(1)
  const accel = (styleFrame.entry * 3.4 - styleFrame.risk * 1.4).toFixed(2)

  const sharedMotion = {
    transition: { repeat: Infinity, ease: "linear", duration: 13, times },
  }

  return (
    <div className="mb-10 overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/5 via-background to-muted/40 p-6 shadow-sm ring-1 ring-border/60">
      <div className="mb-4 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Loop: state → controller → inputs → motion → repeat</span>
        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
          Live
        </span>
      </div>
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="relative flex-1 overflow-hidden rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/30 p-3 shadow-inner backdrop-blur dark:from-neutral-900/50 dark:via-background dark:to-neutral-900/30">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.08),transparent_30%),radial-gradient(circle_at_80%_60%,rgba(59,130,246,0.08),transparent_32%)]" />
          <svg
            viewBox="0 0 210 150"
            className="relative h-[230px] w-full"
            role="presentation"
          >
            <defs>
              <linearGradient id="trackGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(16,185,129,0.8)" />
                <stop offset="100%" stopColor="rgba(59,130,246,0.8)" />
              </linearGradient>
            </defs>
            <motion.path
              d={pathD}
              fill="none"
              stroke="url(#trackGradient)"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2 }}
              className="drop-shadow-[0_4px_12px_rgba(59,130,246,0.18)]"
            />
            <motion.path
              d={pathD}
              fill="none"
              stroke="rgba(99,102,241,0.25)"
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="14 14"
              animate={{ pathOffset: [0, 1] }}
              transition={{ repeat: Infinity, duration: 10, ease: "linear" }}
            />

            <motion.line
              animate={{
                x1: xKeyframes,
                y1: yKeyframes,
                x2: lookaheadX,
                y2: lookaheadY,
              }}
              stroke="rgba(16,185,129,0.7)"
              strokeWidth={2}
              strokeDasharray="6 6"
              {...sharedMotion}
            />
            <motion.circle
              r={4.8}
              fill="rgba(34,197,94,0.9)"
              stroke="white"
              strokeWidth={1.5}
              animate={{ cx: lookaheadX, cy: lookaheadY }}
              {...sharedMotion}
            />
            <motion.circle
              r={6}
              fill="rgba(59,130,246,0.95)"
              stroke="white"
              strokeWidth={1.5}
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

          <div className="pointer-events-none absolute left-4 top-4 space-y-2 rounded-xl border border-white/30 bg-white/80 px-3 py-2 text-[11px] font-semibold text-neutral-800 shadow-sm backdrop-blur dark:border-white/10 dark:bg-neutral-900/80 dark:text-neutral-50">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                δ steering
              </span>
              <motion.span
                key={deltaDeg}
                initial={{ opacity: 0.4, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {deltaDeg}°
              </motion.span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                a_x accel
              </span>
              <motion.span
                key={accel}
                initial={{ opacity: 0.4, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {accel} m/s²
              </motion.span>
            </div>
          </div>

          <div className="pointer-events-none absolute right-3 top-3 flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
            <LegendDot color="bg-sky-500" label="Vehicle state" />
            <LegendDot color="bg-emerald-500" label="Lookahead target" />
            <LegendDot color="bg-rose-400" label="Curvature peek" />
          </div>

          <div className="pointer-events-none absolute inset-x-4 bottom-3 rounded-xl border border-white/30 bg-white/85 px-3 py-3 text-[11px] shadow-sm backdrop-blur dark:border-white/10 dark:bg-neutral-900/85 dark:text-neutral-100">
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-tight text-muted-foreground">
              <span>Style sliders</span>
              <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
                live
              </span>
            </div>
            <div className="grid gap-1.5">
              {knobLabels.map(({ key, label }) => (
                <div key={key}>
                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-tight text-muted-foreground">
                    <span>{label}</span>
                    <span>{Math.round(styleFrame[key] * 100)}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-500"
                      animate={{ width: `${styleFrame[key] * 100}%` }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="w-full space-y-3 lg:w-72">
          <p className="text-sm text-muted-foreground">
            State feeds the controller, style sliders bend the plan, inputs push motion,
            and the loop repeats a few hundred times a second.
          </p>
          <div className="grid gap-3">
            {loopSteps.map((step, index) => (
              <div
                key={step.title}
                className={cn(
                  "relative overflow-hidden rounded-2xl border bg-white/70 p-3 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900/70",
                  activeStep === index && "ring-1 ring-emerald-400/50"
                )}
              >
                {activeStep === index && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-sky-500/10"
                    layoutId="loop-step-highlight"
                    transition={{ type: "spring", stiffness: 150, damping: 18 }}
                  />
                )}
                <div className="relative flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {step.title}
                    </div>
                    <div className="text-sm font-semibold leading-5 text-foreground">
                      {step.detail}
                    </div>
                  </div>
                  <motion.span
                    className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-tight text-muted-foreground"
                    animate={{ opacity: activeStep === index ? 1 : 0.55 }}
                    transition={{ duration: 0.2 }}
                  >
                    step {index + 1}
                  </motion.span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
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
