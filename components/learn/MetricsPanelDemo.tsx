'use client'

import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

const metrics = [
  { label: "Lap time", value: "48.32 s", trend: "down" },
  { label: "RMSE(e⊥)", value: "0.24 m", trend: "down" },
  { label: "Mean jerk", value: "1.8 m/s³", trend: "flat" },
  { label: "Peak μ use", value: "86%", trend: "up" },
  { label: "Overshoots", value: "1", trend: "down" },
  { label: "Apex hits", value: "5/6", trend: "up" },
]

export default function MetricsPanelDemo() {
  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-amber-50 p-6 shadow-sm ring-1 ring-border/70 dark:to-amber-900/10">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Metrics panel</div>
          <div className="text-sm text-muted-foreground">Badges, spark lines, pass/fail cues.</div>
        </div>
        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Why it matters</div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {metrics.map((metric, idx) => (
          <div
            key={metric.label}
            className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-white/80 via-background to-muted/40 p-3 shadow-sm backdrop-blur dark:from-neutral-900/60 dark:via-background dark:to-neutral-900/50"
          >
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{metric.label}</div>
            <div className="text-lg font-semibold text-foreground">{metric.value}</div>
            <Spark trend={metric.trend} delay={idx * 0.05} />
          </div>
        ))}
      </div>
    </div>
  )
}

function Spark({ trend, delay }: { trend: string; delay?: number }) {
  const path =
    trend === "down"
      ? "M2 12 Q 18 6 34 10"
      : trend === "up"
        ? "M2 10 Q 18 14 34 6"
        : "M2 10 Q 18 10 34 10"
  const color =
    trend === "down" ? "rgba(16,185,129,0.9)" : trend === "up" ? "rgba(59,130,246,0.9)" : "rgba(107,114,128,0.9)"
  return (
    <svg viewBox="0 0 40 20" className="mt-2 h-5 w-full">
      <motion.path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, delay }}
      />
    </svg>
  )
}
