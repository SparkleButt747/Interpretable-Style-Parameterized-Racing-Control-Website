'use client'

import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

const linearEase = (t: number) => t

export default function PurePursuitDiagram() {
  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-primary/5 p-6 shadow-sm ring-1 ring-border/70 dark:to-sky-900/10">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pure Pursuit geometry
          </div>
          <div className="text-sm text-muted-foreground">
            Target point, chord, and angle α that drive curvature.
          </div>
        </div>
        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          Steering baseline
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/30 p-4 shadow-inner backdrop-blur dark:from-neutral-900/50 dark:via-background dark:to-neutral-900/30">
        <svg viewBox="0 0 200 140" className="h-[220px] w-full" role="presentation">
          <defs>
            <linearGradient id="ppTrack" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(59,130,246,0.85)" />
              <stop offset="100%" stopColor="rgba(16,185,129,0.85)" />
            </linearGradient>
          </defs>

          <path
            d="M10 110 Q 60 20 120 60 T 190 110"
            fill="none"
            stroke="url(#ppTrack)"
            strokeWidth={4}
            strokeLinecap="round"
          />

          <motion.circle
            r={6}
            fill="rgba(59,130,246,0.95)"
            stroke="white"
            strokeWidth={1.4}
            animate={{
              cx: [46, 74, 108, 140],
              cy: [88, 60, 86, 104],
            }}
            transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
          />

          <motion.circle
            r={5}
            fill="rgba(16,185,129,0.95)"
            stroke="white"
            strokeWidth={1.2}
            animate={{
              cx: [96, 134, 160, 180],
              cy: [60, 82, 72, 94],
            }}
            transition={{ repeat: Infinity, duration: 6, ease: "easeInOut", delay: 0.2 }}
          />

          <motion.line
            x1={46}
            y1={88}
            animate={{ x2: [96, 134, 160, 180], y2: [60, 82, 72, 94] }}
            stroke="rgba(245,158,11,0.9)"
            strokeWidth={2.6}
            strokeDasharray="6 6"
            transition={{ repeat: Infinity, duration: 6, ease: "easeInOut", delay: 0.2 }}
          />

          <motion.path
            d="M20 116 Q 58 130 100 126"
            fill="none"
            stroke="rgba(107,114,128,0.6)"
            strokeWidth={3}
            strokeDasharray="6 8"
            animate={{ pathOffset: [0, 1] }}
            transition={{ repeat: Infinity, duration: 5, ease: linearEase }}
          />

          <text x={108} y={74} className="fill-emerald-700 text-[10px]">
            target
          </text>
          <text x={70} y={100} className="fill-amber-700 text-[10px]">
            chord
          </text>
          <text x={60} y={76} className="fill-primary text-[10px]">
            α
          </text>
        </svg>

        <div className="pointer-events-none absolute left-3 bottom-3 rounded-xl border border-white/30 bg-white/85 px-3 py-2 text-[11px] shadow-sm backdrop-blur dark:border-white/10 dark:bg-neutral-900/85">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Formula</div>
          <div className="text-sm font-semibold text-foreground">
            δ = atan(2L sin α / L_d)
          </div>
          <div className="text-[11px] text-muted-foreground">α from chord to target; L_d is lookahead.</div>
        </div>
      </div>
    </div>
  )
}
