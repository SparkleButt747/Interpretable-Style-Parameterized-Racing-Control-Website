'use client'

import { useEffect, useState } from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

const muLevels = [
  { label: "Dry", mu: 1.1, color: "from-emerald-400 to-sky-500" },
  { label: "Damp", mu: 0.8, color: "from-amber-400 to-emerald-500" },
  { label: "Wet", mu: 0.55, color: "from-rose-400 to-amber-400" },
]

export default function FrictionDonutWidget() {
  const [muIndex, setMuIndex] = useState(0)
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setPhase((p) => (p + 1) % 4), 1600)
    return () => clearInterval(interval)
  }, [])

  const { label, mu, color } = muLevels[muIndex]
  const usage = Math.max(0.1, 0.6 + Math.sin(phase * Math.PI / 2) * 0.25)
  const lateral = usage * 0.75
  const longitudinal = usage * 0.55

  const radius = 56
  const tipAngle = Math.atan2(lateral, longitudinal)
  const tipRadius = usage * mu * radius * 0.9
  const tipX = 70 + Math.cos(tipAngle) * tipRadius
  const tipY = 70 - Math.sin(tipAngle) * tipRadius

  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-emerald-50 p-6 shadow-sm ring-1 ring-border/70 dark:to-emerald-900/10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Friction donut
          </div>
          <div className="text-sm text-muted-foreground">Longitudinal + lateral combined budget within μg.</div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-background/80 p-1 shadow-sm ring-1 ring-border/80">
          {muLevels.map((level, index) => (
            <button
              key={level.label}
              type="button"
              onClick={() => setMuIndex(index)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                muIndex === index
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {level.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="relative flex items-center justify-center rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/40 p-4 shadow-inner backdrop-blur dark:from-neutral-900/50 dark:via-background dark:to-neutral-900/40">
          <svg viewBox="0 0 140 140" className="h-[200px] w-[200px]" role="presentation">
            <defs>
              <linearGradient id="donutGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(16,185,129,0.8)" />
                <stop offset="100%" stopColor="rgba(59,130,246,0.8)" />
              </linearGradient>
            </defs>
            <circle
              cx={70}
              cy={70}
              r={radius}
              fill="none"
              stroke="rgba(226,232,240,0.6)"
              strokeWidth={10}
            />
            <circle
              cx={70}
              cy={70}
              r={radius * mu}
              fill="none"
              stroke="url(#donutGradient)"
              strokeWidth={5}
              strokeDasharray="10 10"
            />
            <motion.line
              x1={70}
              y1={70}
              animate={{ x2: tipX, y2: tipY }}
              stroke="rgba(59,130,246,0.95)"
              strokeWidth={4}
              strokeLinecap="round"
              transition={{ type: "spring", stiffness: 180, damping: 18 }}
            />
            <motion.circle
              r={6}
              fill="rgba(59,130,246,0.95)"
              stroke="white"
              strokeWidth={1.4}
              animate={{ cx: tipX, cy: tipY }}
              transition={{ type: "spring", stiffness: 180, damping: 18 }}
            />
            <motion.circle
              r={18}
              cx={70}
              cy={70}
              fill="rgba(16,185,129,0.1)"
              stroke="rgba(16,185,129,0.6)"
              strokeWidth={2}
              animate={{ scale: [0.96, 1.05, 0.96] }}
              transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
            />
          </svg>
          <div className="pointer-events-none absolute inset-x-4 bottom-3 rounded-xl border border-white/30 bg-white/85 px-3 py-2 text-[11px] shadow-sm backdrop-blur dark:border-white/10 dark:bg-neutral-900/85">
            <div className="flex items-center justify-between">
              <Metric label="Lateral (v²κ)" value={`${Math.round(lateral * 100)}%`} color="bg-sky-500" />
              <Metric label="Longitudinal (a_x)" value={`${Math.round(longitudinal * 100)}%`} color="bg-emerald-500" />
              <Metric label="μ level" value={mu.toFixed(2)} color="bg-amber-500" />
            </div>
          </div>
        </div>

        <div className="flex-1 rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/40 p-4 shadow-inner backdrop-blur dark:from-neutral-900/50 dark:via-background dark:to-neutral-900/40">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">How to read</div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              Donut radius scales with surface friction μ: dry &gt; damp &gt; wet.
            </li>
            <li>
              The blue vector is the combined acceleration (a_x, v²κ). Keep its tip inside the ring.
            </li>
            <li>
              Swap μ levels to see how much headroom you lose on wet pavement.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-2 w-2 rounded-full", color)} />
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-[11px] text-foreground">{value}</span>
    </div>
  )
}
