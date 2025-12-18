'use client'

import { useMemo } from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"
import { makeLoop, offsetLoop, type TrackPoint } from "@/components/learn/track"

const diagramTrack: TrackPoint[] = [
  { x: 34, y: 108 },
  { x: 70, y: 42 },
  { x: 130, y: 30 },
  { x: 178, y: 70 },
  { x: 152, y: 118 },
  { x: 96, y: 126 },
  { x: 54, y: 96 },
]

export default function ProblemControlDiagram() {
  const { closedPoints, times, pathD } = useMemo(() => makeLoop(diagramTrack), [])
  const lookahead = useMemo(() => offsetLoop(diagramTrack, 2), [])
  const target = useMemo(() => offsetLoop(diagramTrack, 4), [])

  const xKeyframes = closedPoints.map((point) => point.x)
  const yKeyframes = closedPoints.map((point) => point.y)
  const lookaheadX = lookahead.map((point) => point.x)
  const lookaheadY = lookahead.map((point) => point.y)
  const targetX = target.map((point) => point.x)
  const targetY = target.map((point) => point.y)

  const sharedMotion = {
    transition: { repeat: Infinity, ease: "linear", duration: 12, times },
  }

  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-primary/5 p-6 shadow-sm ring-1 ring-border/70">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          State + path go in, steering/throttle come out — the interface we control.
        </div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Badge color="bg-emerald-500" label="State" />
          <Badge color="bg-sky-500" label="Path" />
          <Badge color="bg-amber-500" label="Outputs" />
        </div>
      </div>
      <div className="relative flex flex-col gap-4 lg:flex-row">
        <div className="relative flex-1 overflow-hidden rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/30 p-3 shadow-inner backdrop-blur dark:from-neutral-900/50 dark:via-background dark:to-neutral-900/30">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.08),transparent_32%),radial-gradient(circle_at_75%_70%,rgba(59,130,246,0.08),transparent_32%)]" />
          <svg viewBox="0 0 210 150" className="relative h-[230px] w-full" role="presentation">
            <defs>
              <linearGradient id="interfaceTrackGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(34,197,94,0.85)" />
                <stop offset="100%" stopColor="rgba(59,130,246,0.85)" />
              </linearGradient>
            </defs>
            <motion.path
              d={pathD}
              fill="none"
              stroke="url(#interfaceTrackGradient)"
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
              strokeWidth={7}
              strokeDasharray="14 18"
              strokeLinecap="round"
              animate={{ pathOffset: [0, 1] }}
              transition={{ repeat: Infinity, duration: 10, ease: "linear" }}
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

          <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-2 rounded-xl border border-white/30 bg-white/85 px-3 py-2 text-[11px] shadow-sm backdrop-blur dark:border-white/10 dark:bg-neutral-900/85">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">State</div>
            <div className="text-sm font-semibold text-foreground">
              (x, y, ψ, v)
            </div>
            <div className="text-[11px] text-muted-foreground">Pose + speed the controller sees.</div>
          </div>

          <div className="pointer-events-none absolute right-3 top-3 flex flex-col gap-2 rounded-xl border border-white/30 bg-white/85 px-3 py-2 text-[11px] shadow-sm backdrop-blur dark:border-white/10 dark:bg-neutral-900/85">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Outputs</div>
            <div className="text-sm font-semibold text-foreground">δ steering, a_x accel</div>
            <div className="text-[11px] text-muted-foreground">Updated every Δt.</div>
          </div>
        </div>

        <div className="w-full rounded-2xl border bg-muted/40 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60 lg:w-72">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Interface</div>
          <div className="mt-2 space-y-2 text-sm text-foreground">
            <div className="rounded-xl border bg-background/80 p-3 shadow-sm">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Path</div>
              <div className="font-semibold">γ(s) with curvature κ(s)</div>
              <div className="text-[11px] text-muted-foreground">Reference line the car should hug.</div>
            </div>
            <div className="rounded-xl border bg-background/80 p-3 shadow-sm">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Policy</div>
              <div className="font-semibold">π: {`{x,y,ψ,v,γ,κ}`} → {`{δ,a_x}`}</div>
              <div className="text-[11px] text-muted-foreground">Maps sensed state to commands.</div>
            </div>
            <div className="rounded-xl border bg-background/80 p-3 shadow-sm">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Preview</div>
              <div className="font-semibold">Lookahead target pulls the plan forward.</div>
              <div className="text-[11px] text-muted-foreground">
                Short preview = reactive; long preview = smooth but lazy.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full bg-muted px-2 py-1", color ? "" : "")}>
      <span className={cn("h-2 w-2 rounded-full", color)} />
      <span>{label}</span>
    </span>
  )
}
