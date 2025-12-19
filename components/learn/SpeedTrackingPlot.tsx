'use client'

import { useMemo, useState } from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

type Mode = "overshoot" | "stable"

export default function SpeedTrackingPlot() {
  const [mode, setMode] = useState<Mode>("stable")

  const { vt, v, time } = useMemo(() => buildSeries(mode), [mode])

  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-amber-50 p-6 shadow-sm ring-1 ring-border/70 dark:to-amber-900/10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Speed tracking through a hairpin
          </div>
          <div className="text-sm text-muted-foreground">
            Compare overshoot vs stable tuning of the PID speed loop.
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-background/80 p-1 shadow-sm ring-1 ring-border/80">
          {(["overshoot", "stable"] as Mode[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                mode === option ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"
              )}
            >
              {option === "overshoot" ? "Overshoot" : "Stable"}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/40 p-4 shadow-inner backdrop-blur dark:from-neutral-900/50 dark:via-background dark:to-neutral-900/40">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">v(t) vs v_t(t)</div>
        <SpeedPlot vt={vt} v={v} time={time} />
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <Metric label="Peak overshoot" value={mode === "overshoot" ? "22%" : "4%"} />
          <Metric label="Settling time" value={mode === "overshoot" ? "3.2 s" : "1.5 s"} />
        </div>
      </div>
    </div>
  )
}

function buildSeries(mode: Mode) {
  const time = Array.from({ length: 40 }, (_, i) => i / 10)
  const vt = time.map((t) => {
    if (t < 1) return 24
    if (t < 2.4) return 16
    if (t < 3.2) return 14
    if (t < 5) return 22
    return 26
  })

  const v = vt.map((target, index) => {
    const t = time[index]
    if (mode === "overshoot") {
      return target + Math.sin(t * 1.8) * 2.6 + (Math.random() - 0.5) * 0.4
    }
    return target + Math.sin(t * 1.2) * 0.8 + (Math.random() - 0.5) * 0.2
  })

  return { vt, v, time }
}

function SpeedPlot({ vt, v, time }: { vt: number[]; v: number[]; time: number[] }) {
  const maxV = Math.max(...vt, ...v)
  const minV = Math.min(...vt, ...v)
  const scaleX = (t: number) => 8 + (t / Math.max(...time)) * 84
  const scaleY = (val: number) => 100 - ((val - minV) / (maxV - minV + 0.001)) * 70

  const vtPath = vt
    .map((val, i) => `${i === 0 ? "M" : "L"} ${scaleX(time[i]).toFixed(1)} ${scaleY(val).toFixed(1)}`)
    .join(" ")
  const vPath = v
    .map((val, i) => `${i === 0 ? "M" : "L"} ${scaleX(time[i]).toFixed(1)} ${scaleY(val).toFixed(1)}`)
    .join(" ")

  return (
    <svg viewBox="0 0 100 110" className="mt-3 h-32 w-full">
      <rect x={6} y={20} width={88} height={78} rx={10} className="fill-muted" />
      <line x1={6} y1={80} x2={94} y2={80} className="stroke-muted-foreground/30" strokeWidth={0.5} />
      <motion.path
        d={vtPath}
        fill="none"
        stroke="rgba(59,130,246,0.9)"
        strokeWidth={2.5}
        strokeDasharray="6 4"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8 }}
      />
      <motion.path
        d={vPath}
        fill="none"
        stroke="rgba(234,88,12,0.9)"
        strokeWidth={2.5}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8 }}
      />
      <text x={10} y={32} className="fill-sky-700 text-[9px]">
        v_t(t)
      </text>
      <text x={10} y={44} className="fill-amber-700 text-[9px]">
        v(t)
      </text>
      <text x={70} y={96} className="fill-muted-foreground text-[9px]">
        time →
      </text>
    </svg>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background/70 p-3 shadow-sm dark:border-neutral-800">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  )
}
