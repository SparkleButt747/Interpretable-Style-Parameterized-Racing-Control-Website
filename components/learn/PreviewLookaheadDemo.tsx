'use client'

import { useMemo, useState } from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"
import { makeLoop, offsetLoop, type TrackPoint } from "@/components/learn/track"

const sBend: TrackPoint[] = [
  { x: 22, y: 76 },
  { x: 56, y: 46 },
  { x: 98, y: 62 },
  { x: 136, y: 40 },
  { x: 172, y: 70 },
  { x: 140, y: 110 },
  { x: 96, y: 92 },
  { x: 52, y: 112 },
]

type ErrorPoint = { t: number; err: number }

const linearEase = (t: number) => t

export default function PreviewLookaheadDemo() {
  const { closedPoints, times, pathD } = useMemo(() => makeLoop(sBend), [])
  const [lookaheadM, setLookaheadM] = useState(10)

  const offset = useMemo(() => Math.max(1, Math.round((lookaheadM - 4) / 2.5)), [lookaheadM])
  const target = useMemo(() => offsetLoop(sBend, offset), [offset])
  const xKeyframes = closedPoints.map((p) => p.x)
  const yKeyframes = closedPoints.map((p) => p.y)
  const targetX = target.map((p) => p.x)
  const targetY = target.map((p) => p.y)

  const headingErrorSeries = useMemo<ErrorPoint[]>(() => {
    const base = 8 / lookaheadM
    return Array.from({ length: 30 }, (_, i) => ({
      t: i / 29,
      err: Math.sin(i / 4) * base + Math.sin(i / 9) * base * 0.4,
    }))
  }, [lookaheadM])

  const maxErr = Math.max(...headingErrorSeries.map((p) => Math.abs(p.err)), 0.01)

  const sharedMotion = {
    transition: { repeat: Infinity, ease: linearEase, duration: 10.5, times },
  }

  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-primary/5 p-6 shadow-sm ring-1 ring-border/70 dark:to-sky-900/10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Lookahead on an S-bend
          </div>
          <div className="text-sm text-muted-foreground">
            Move L to see heading error settle vs oscillate.
          </div>
        </div>
        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          Preview steering
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="relative flex-1 overflow-hidden rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/30 p-3 shadow-inner backdrop-blur dark:from-neutral-900/50 dark:via-background dark:to-neutral-900/30">
          <svg viewBox="0 0 210 150" className="relative h-[230px] w-full" role="presentation">
            <defs>
              <linearGradient id="sBendTrackGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(59,130,246,0.85)" />
                <stop offset="100%" stopColor="rgba(16,185,129,0.85)" />
              </linearGradient>
            </defs>
            <motion.path
              d={pathD}
              fill="none"
              stroke="url(#sBendTrackGradient)"
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
              transition={{ repeat: Infinity, duration: 11, ease: linearEase }}
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

          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <LegendDot color="bg-sky-500" label="Vehicle" />
            <LegendDot color="bg-emerald-500" label="Lookahead target" />
          </div>
        </div>

        <div className="w-full space-y-4 lg:w-80">
          <div className="rounded-2xl border bg-muted/40 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Lookahead L (m)
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={4}
                max={22}
                step={0.5}
                value={lookaheadM}
                onChange={(e) => setLookaheadM(parseFloat(e.target.value))}
                className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-emerald-500"
              />
              <div className="w-12 text-right text-sm font-semibold text-foreground">{lookaheadM.toFixed(1)}</div>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Small L = twitchy, oscillatory. Large L = smooth but lazy.
            </div>
          </div>

          <div className="rounded-2xl border bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Heading error over time</div>
            <HeadingErrorPlot data={headingErrorSeries} maxErr={maxErr} />
          </div>
        </div>
      </div>
    </div>
  )
}

function HeadingErrorPlot({ data, maxErr }: { data: ErrorPoint[]; maxErr: number }) {
  const path = data
    .map((point, index) => {
      const x = 8 + point.t * 84
      const y = 70 + (point.err / (maxErr + 0.001)) * 28
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(" ")

  return (
    <svg viewBox="0 0 100 100" className="mt-3 h-28 w-full">
      <rect x={6} y={10} width={88} height={70} rx={8} className="fill-muted" />
      <line x1={6} y1={45} x2={94} y2={45} className="stroke-muted-foreground/40" strokeWidth={0.5} />
      <motion.path
        d={path}
        fill="none"
        stroke="rgba(59,130,246,0.9)"
        strokeWidth={2.5}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8 }}
      />
      <text x={8} y={20} className="fill-muted-foreground text-[9px]">
        eψ(t)
      </text>
      <text x={74} y={80} className="fill-muted-foreground text-[9px]">
        time →
      </text>
    </svg>
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
