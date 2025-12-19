'use client'

import { useMemo, useState } from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

type Mode = "fixed" | "scheduled"

export default function GainSchedulingMiniDemo() {
  const [mode, setMode] = useState<Mode>("scheduled")

  const oscillation = useMemo(() => (mode === "fixed" ? 0.68 : 0.28), [mode])
  const gainCurve = useMemo(() => buildGainCurve(mode), [mode])

  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-emerald-50 p-6 shadow-sm ring-1 ring-border/70 dark:to-emerald-900/10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Fixed gain vs scheduled gain
          </div>
          <div className="text-sm text-muted-foreground">
            Scheduling reduces chatter at speed by tapering kδ.
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-background/80 p-1 shadow-sm ring-1 ring-border/80">
          {(["fixed", "scheduled"] as Mode[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                mode === option ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"
              )}
            >
              {option === "fixed" ? "Fixed gain" : "Scheduled"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/40 p-4 shadow-inner backdrop-blur dark:from-neutral-900/50 dark:via-background dark:to-neutral-900/40">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">kδ vs speed</div>
          <GainPlot curve={gainCurve} mode={mode} />
          <div className="mt-3 text-[11px] text-muted-foreground">
            Schedule: kδ(v) = k0 / (1 + α v²). Lower gain at speed → less oscillation.
          </div>
        </div>
        <div className="flex-1 rounded-2xl border bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Result</div>
          <div className="mt-2 grid gap-3 text-sm">
            <Metric label="Oscillation risk" value={`${Math.round(oscillation * 100)}%`} />
            <Metric
              label="Apex accuracy"
              value={mode === "fixed" ? "Medium (late turn-in)" : "High (settled)"}
            />
            <Metric label="Steering smoothness" value={mode === "fixed" ? "Rough" : "Smooth"} />
          </div>
          <div className="mt-3 rounded-xl border bg-muted/50 p-3 text-[11px] text-muted-foreground">
            Scheduled gains trim authority as v rises, dampening chatter without slowing low-speed response.
          </div>
        </div>
      </div>
    </div>
  )
}

function buildGainCurve(mode: Mode) {
  const points = Array.from({ length: 12 }, (_, i) => {
    const v = (i / 11) * 28 // m/s
    const k0 = 1.4
    const alpha = mode === "scheduled" ? 0.02 : 0
    const kd = k0 / (1 + alpha * v * v)
    return { v, kd }
  })
  return points
}

function GainPlot({ curve, mode }: { curve: Array<{ v: number; kd: number }>; mode: Mode }) {
  const maxV = Math.max(...curve.map((p) => p.v))
  const minK = Math.min(...curve.map((p) => p.kd))
  const maxK = Math.max(...curve.map((p) => p.kd))

  const path = curve
    .map((point, index) => {
      const x = 10 + (point.v / maxV) * 80
      const y = 90 - ((point.kd - minK) / (maxK - minK + 0.001)) * 60
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(" ")

  return (
    <svg viewBox="0 0 100 100" className="mt-3 h-28 w-full">
      <rect x={6} y={10} width={88} height={80} rx={10} className="fill-muted" />
      <line x1={6} y1={70} x2={94} y2={70} className="stroke-muted-foreground/30" strokeWidth={0.5} />
      <motion.path
        d={path}
        fill="none"
        stroke={mode === "scheduled" ? "rgba(16,185,129,0.9)" : "rgba(234,88,12,0.9)"}
        strokeWidth={2.5}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8 }}
      />
      <text x={10} y={22} className="fill-muted-foreground text-[9px]">
        kδ(v)
      </text>
      <text x={64} y={92} className="fill-muted-foreground text-[9px]">
        speed →
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
