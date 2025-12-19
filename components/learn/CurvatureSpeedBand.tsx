'use client'

import { useMemo, useState } from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

const sections = [
  { s: 0, kappa: 0.02 },
  { s: 0.15, kappa: 0.08 },
  { s: 0.3, kappa: 0.14 },
  { s: 0.45, kappa: 0.05 },
  { s: 0.6, kappa: 0.12 },
  { s: 0.75, kappa: 0.04 },
  { s: 0.9, kappa: 0.02 },
]

const muOptions = [
  { label: "Dry (μ=1.1)", mu: 1.1 },
  { label: "Damp (μ=0.8)", mu: 0.8 },
  { label: "Wet (μ=0.55)", mu: 0.55 },
]

const linearEase = (t: number) => t

export default function CurvatureSpeedBand() {
  const [muIndex, setMuIndex] = useState(0)
  const mu = muOptions[muIndex].mu

  const targetSpeeds = useMemo(() => {
    const g = 9.81
    return sections.map((section) => {
      const vt = Math.sqrt((mu * g) / (Math.abs(section.kappa) + 0.015))
      return { ...section, vt }
    })
  }, [mu])

  const maxV = Math.max(...targetSpeeds.map((s) => s.vt))
  const minV = Math.min(...targetSpeeds.map((s) => s.vt))

  const heatStops = targetSpeeds.map((s) => ({
    offset: s.s * 100,
    color: curvatureColor(s.kappa),
  }))

  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-sky-50 p-6 shadow-sm ring-1 ring-border/70 dark:to-sky-900/10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Curvature → target speed band
          </div>
          <div className="text-sm text-muted-foreground">
            Toggle μ to see how the track’s safe speed envelope shrinks.
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-background/80 p-1 shadow-sm ring-1 ring-border/80">
          {muOptions.map((option, index) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setMuIndex(index)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                muIndex === index
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/40 p-4 shadow-inner backdrop-blur dark:from-neutral-900/50 dark:via-background dark:to-neutral-900/40">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Track progress s</div>
        <div className="relative mt-3 h-40 overflow-hidden rounded-xl border bg-muted/50">
          <HeatBar stops={heatStops} />
          <SpeedBand speeds={targetSpeeds} minV={minV} maxV={maxV} mu={mu} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-muted-foreground">
          <LegendDot color="bg-rose-500" label="Tight radius (high κ)" />
          <LegendDot color="bg-emerald-500" label="Open radius (low κ)" />
          <LegendDot color="bg-sky-500" label="Target speed band v_t(s)" />
        </div>
      </div>
    </div>
  )
}

function HeatBar({ stops }: { stops: Array<{ offset: number; color: string }> }) {
  const gradientId = "curvatureHeat"
  return (
    <svg viewBox="0 0 100 8" className="absolute left-4 right-4 top-3 h-2 w-[calc(100%-2rem)]">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          {stops.map((stop) => (
            <stop key={stop.offset} offset={`${stop.offset}%`} stopColor={stop.color} />
          ))}
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={100} height={8} rx={4} fill={`url(#${gradientId})`} />
    </svg>
  )
}

function SpeedBand({
  speeds,
  minV,
  maxV,
  mu,
}: {
  speeds: Array<{ s: number; vt: number }>
  minV: number
  maxV: number
  mu: number
}) {
  const bandPath = speeds
    .map((point, index) => {
      const x = 8 + point.s * 84
      const y = 32 + (1 - (point.vt - minV) / (maxV - minV + 0.001)) * 90
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(" ")

  const topY = speeds.map((point) => 32 + (1 - (point.vt - minV) / (maxV - minV + 0.001)) * 90)
  const topX = speeds.map((point) => 8 + point.s * 84)
  const bottomY = topY.map((y) => y + 10)
  const areaPath = topX
    .map((x, index) => `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${topY[index].toFixed(1)}`)
    .concat(
      topX
        .map((x, index) => `L ${x.toFixed(1)} ${bottomY[bottomY.length - 1 - index].toFixed(1)}`)
        .reverse()
    )
    .join(" ")

  return (
    <svg viewBox="0 0 100 120" className="absolute inset-x-3 bottom-3 top-6">
      <motion.path
        d={areaPath}
        fill="rgba(59,130,246,0.12)"
        animate={{ opacity: [0.7, 0.9, 0.7] }}
        transition={{ repeat: Infinity, duration: 3 }}
      />
      <motion.path
        d={bandPath}
        fill="none"
        stroke="rgba(59,130,246,0.85)"
        strokeWidth={2.5}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, type: "spring", stiffness: 120, damping: 18 }}
      />
      <motion.circle
        r={4}
        fill="rgba(59,130,246,0.95)"
        stroke="white"
        strokeWidth={1}
        animate={{ cx: topX, cy: topY }}
        transition={{ repeat: Infinity, ease: linearEase, duration: 6 }}
      />
      <motion.text
        x={10}
        y={18}
        className="fill-muted-foreground text-[10px]"
        key={mu}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        μ = {mu.toFixed(2)} → band shrinks as grip drops
      </motion.text>
    </svg>
  )
}

function curvatureColor(kappa: number) {
  const t = Math.min(1, Math.abs(kappa) / 0.15)
  const start = { r: 16, g: 185, b: 129 } // emerald-ish
  const end = { r: 239, g: 68, b: 68 } // red-ish
  const r = Math.round(start.r + (end.r - start.r) * t)
  const g = Math.round(start.g + (end.g - start.g) * t)
  const b = Math.round(start.b + (end.b - start.b) * t)
  return `rgba(${r},${g},${b},0.9)`
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/70 px-2 py-1 shadow-sm backdrop-blur dark:bg-neutral-900/70">
      <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
      <span>{label}</span>
    </div>
  )
}
