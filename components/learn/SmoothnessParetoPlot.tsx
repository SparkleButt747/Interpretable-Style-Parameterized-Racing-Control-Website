'use client'

import { motion } from "framer-motion"

const points = [
  { smooth: "Low", jerk: 9.4, lap: 48.2 },
  { smooth: "Med", jerk: 6.8, lap: 48.8 },
  { smooth: "High", jerk: 5.0, lap: 49.6 },
  { smooth: "Max", jerk: 3.6, lap: 50.8 },
]

export default function SmoothnessParetoPlot() {
  const minLap = Math.min(...points.map((p) => p.lap))
  const maxLap = Math.max(...points.map((p) => p.lap))
  const minJerk = Math.min(...points.map((p) => p.jerk))
  const maxJerk = Math.max(...points.map((p) => p.jerk))

  const path = points
    .map((p, i) => {
      const x = 12 + ((p.jerk - minJerk) / (maxJerk - minJerk)) * 76
      const y = 90 - ((p.lap - minLap) / (maxLap - minLap)) * 60
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(" ")

  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-sky-50 p-6 shadow-sm ring-1 ring-border/70 dark:to-sky-900/10">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Smoothness knob trade-off
          </div>
          <div className="text-sm text-muted-foreground">
            Higher smoothness slows lap time but lowers mean jerk.
          </div>
        </div>
        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Pareto-ish</div>
      </div>

      <div className="rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/40 p-4 shadow-inner backdrop-blur dark:from-neutral-900/50 dark:via-background dark:to-neutral-900/40">
        <svg viewBox="0 0 100 110" className="h-32 w-full">
          <rect x={6} y={16} width={88} height={80} rx={10} className="fill-muted" />
          <line x1={6} y1={80} x2={94} y2={80} className="stroke-muted-foreground/30" strokeWidth={0.5} />
          <motion.path
            d={path}
            fill="none"
            stroke="rgba(59,130,246,0.9)"
            strokeWidth={2.6}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8 }}
          />
          {points.map((p) => {
            const x = 12 + ((p.jerk - minJerk) / (maxJerk - minJerk)) * 76
            const y = 90 - ((p.lap - minLap) / (maxLap - minLap)) * 60
            return (
              <g key={p.smooth}>
                <motion.circle
                  r={4}
                  fill="rgba(59,130,246,0.95)"
                  stroke="white"
                  strokeWidth={1}
                  cx={x}
                  cy={y}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                />
                <text x={x + 5} y={y - 4} className="fill-muted-foreground text-[9px]">
                  {p.smooth}
                </text>
              </g>
            )
          })}
          <text x={10} y={28} className="fill-amber-700 text-[9px]">
            Lap time (s)
          </text>
          <text x={56} y={100} className="fill-muted-foreground text-[9px]">
            mean jerk →
          </text>
        </svg>
      </div>
    </div>
  )
}
