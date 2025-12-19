'use client'

import { useMemo, useState } from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"
import { makeLoop, type TrackPoint } from "@/components/learn/track"

type PresetKey = "conservative" | "aggressive"

const raceTrack: TrackPoint[] = [
  { x: 26, y: 26 },
  { x: 96, y: 16 },
  { x: 156, y: 34 },
  { x: 186, y: 66 },
  { x: 174, y: 108 },
  { x: 132, y: 128 },
  { x: 82, y: 122 },
  { x: 48, y: 96 },
  { x: 26, y: 64 },
]

const presets: Record<
  PresetKey,
  { label: string; duration: number; description: string }
> = {
  conservative: {
    label: "Conservative",
    duration: 15.2,
    description: "Longer preview, low jerk limits, low risk.",
  },
  aggressive: {
    label: "Aggressive",
    duration: 10.8,
    description: "Tighter lookahead, late braking, hungry throttle.",
  },
}

const userLapSeconds = 12.6

const linearEase = (t: number) => t

export default function GhostRacePreview() {
  const { closedPoints, times, pathD } = useMemo(() => makeLoop(raceTrack), [])
  const xKeyframes = closedPoints.map((point) => point.x)
  const yKeyframes = closedPoints.map((point) => point.y)

  const [preset, setPreset] = useState<PresetKey>("conservative")
  const ghost = presets[preset]
  const delta = ghost.duration - userLapSeconds
  const deltaLabel = delta > 0 ? "You lead this ghost" : "Ghost is ahead"
  const normalizedDelta = Math.max(Math.min(delta / 6, 1), -1)
  const markerOffset = 50 + normalizedDelta * 42

  return (
    <div className="mb-10 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/50 via-background to-primary/5 p-6 shadow-sm ring-1 ring-border/60">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ghost race
          </div>
          <div className="text-sm text-muted-foreground">
            You vs baseline presets (Conservative / Aggressive)
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
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="relative flex-1 overflow-hidden rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/40 p-3 shadow-inner backdrop-blur dark:from-neutral-900/50 dark:via-background dark:to-neutral-900/40">
          <svg
            viewBox="0 0 210 150"
            className="h-[240px] w-full"
            role="presentation"
          >
            <defs>
              <linearGradient id="ghostTrackGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(59,130,246,0.85)" />
                <stop offset="100%" stopColor="rgba(234,88,12,0.85)" />
              </linearGradient>
            </defs>
            <motion.path
              d={pathD}
              fill="none"
              stroke="url(#ghostTrackGradient)"
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2 }}
              className="drop-shadow-[0_4px_12px_rgba(59,130,246,0.22)]"
            />
            <motion.path
              d={pathD}
              fill="none"
              stroke="rgba(234,88,12,0.5)"
              strokeWidth={7}
              strokeDasharray="12 14"
              strokeLinecap="round"
              animate={{ pathOffset: [0, 1] }}
              transition={{ repeat: Infinity, duration: ghost.duration, ease: linearEase }}
            />

            <motion.circle
              r={6.2}
              fill="rgba(34,197,94,0.95)"
              stroke="white"
              strokeWidth={1.5}
              animate={{ cx: xKeyframes, cy: yKeyframes }}
              transition={{ repeat: Infinity, duration: userLapSeconds, ease: linearEase, times }}
            />
            <motion.circle
              r={6.2}
              fill="rgba(234,88,12,0.95)"
              stroke="white"
              strokeWidth={1.5}
              animate={{ cx: xKeyframes, cy: yKeyframes }}
              transition={{ repeat: Infinity, duration: ghost.duration, ease: linearEase, times }}
            />
            <motion.circle
              r={3.4}
              fill="white"
              stroke="rgba(59,130,246,0.7)"
              strokeWidth={1.4}
              animate={{ cx: xKeyframes, cy: yKeyframes }}
              transition={{ repeat: Infinity, duration: ghost.duration * 0.5, ease: linearEase, times }}
            />
            <motion.rect
              x={6}
              y={6}
              width={22}
              height={22}
              rx={4}
              fill="white"
              stroke="rgba(0,0,0,0.15)"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            />
            <motion.rect
              x={6}
              y={6}
              width={22}
              height={22}
              rx={4}
              fill="url(#ghostTrackGradient)"
              opacity={0.18}
            />
          </svg>

          <div className="pointer-events-none absolute left-3 right-3 bottom-3 rounded-xl border border-white/30 bg-white/85 px-3 py-2 text-[11px] shadow-sm backdrop-blur dark:border-white/10 dark:bg-neutral-900/85">
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-tight text-muted-foreground">
              <span>Legend</span>
              <span>Same track, staggered pace</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <LegendPill color="bg-emerald-500" label="You" />
              <LegendPill color="bg-amber-500" label={`${ghost.label} baseline`} />
              <LegendPill color="bg-sky-500" label="Preview markers" />
            </div>
          </div>
        </div>

        <div className="w-full space-y-4 lg:w-80">
          <div className="rounded-2xl border bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
              <span>Gap to ghost</span>
              <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                {ghost.label}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <motion.div
                key={preset}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className={cn(
                  "text-3xl font-semibold",
                  delta > 0 ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300"
                )}
              >
                {Math.abs(delta).toFixed(1)}s
              </motion.div>
              <div className="text-sm text-muted-foreground">{deltaLabel}</div>
            </div>
            <div className="relative mt-4 h-2 rounded-full bg-muted">
              <div className="absolute left-1/2 top-0 h-2 w-px bg-foreground/30" />
              <motion.div
                className={cn(
                  "absolute -top-1 h-4 w-4 rounded-full border border-white shadow-sm",
                  delta > 0 ? "bg-emerald-500" : "bg-amber-500"
                )}
                animate={{ left: `${markerOffset}%` }}
                transition={{ type: "spring", stiffness: 160, damping: 18 }}
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Your lap
                </div>
                <div className="font-semibold text-foreground">{userLapSeconds.toFixed(1)} s</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Ghost lap
                </div>
                <div className="font-semibold text-foreground">{ghost.duration.toFixed(1)} s</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-muted/50 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/50">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Baseline personality
            </div>
            <div className="mt-2 text-sm font-semibold text-foreground">
              {ghost.description}
            </div>
            <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>Same inputs, different hyper-parameters.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span>Ghost pacing is tied to preset duration above.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                <span>Try to beat both without breaking grip limits.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function LegendPill({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
      <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
      <span>{label}</span>
    </div>
  )
}
