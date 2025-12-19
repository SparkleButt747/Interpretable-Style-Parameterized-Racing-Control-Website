'use client'

import { useMemo, useState } from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

const sections = [
  { s: 0, kappa: 0.02 },
  { s: 0.12, kappa: 0.08 },
  { s: 0.28, kappa: 0.16 },
  { s: 0.44, kappa: 0.06 },
  { s: 0.6, kappa: 0.14 },
  { s: 0.76, kappa: 0.05 },
  { s: 0.9, kappa: 0.02 },
]

const riskLevels = [
  { label: "Conservative", scale: 0.8 },
  { label: "Balanced", scale: 1.0 },
  { label: "Aggressive", scale: 1.2 },
]

const muLevels = [
  { label: "Dry", mu: 1.1 },
  { label: "Wet", mu: 0.55 },
]

const linearEase = (t: number) => t

export default function RiskSpeedBandWidget() {
  const [risk, setRisk] = useState(1)
  const [mu, setMu] = useState(0)

  const speedProfile = useMemo(() => {
    const g = 9.81
    const muVal = muLevels[mu].mu
    const scale = riskLevels[risk].scale
    return sections.map((section) => {
      const vt = Math.sqrt((muVal * g) / (Math.abs(section.kappa) + 0.015)) * scale
      return { ...section, vt }
    })
  }, [mu, risk])

  const maxV = Math.max(...speedProfile.map((p) => p.vt))
  const minV = Math.min(...speedProfile.map((p) => p.vt))

  const frictionUsage = useMemo(() => {
    const lateral = Math.min(1, 0.4 + risk * 0.3 + (mu === 0 ? 0 : -0.2))
    const longitudinal = Math.min(1, 0.35 + risk * 0.2)
    const combined = Math.min(1, Math.hypot(lateral, longitudinal) / 1.4)
    return { lateral, longitudinal, combined }
  }, [mu, risk])

  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-rose-50 p-6 shadow-sm ring-1 ring-border/70 dark:to-rose-900/10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Risk knob → speed band + friction usage
          </div>
          <div className="text-sm text-muted-foreground">
            Scale v_t(s) up/down and watch friction headroom change.
          </div>
        </div>
        <div className="inline-flex flex-wrap items-center gap-2 rounded-full bg-background/80 p-1 shadow-sm ring-1 ring-border/80">
          {riskLevels.map((level, index) => (
            <button
              key={level.label}
              type="button"
              onClick={() => setRisk(index)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                risk === index ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"
              )}
            >
              {level.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/40 p-4 shadow-inner backdrop-blur dark:from-neutral-900/50 dark:via-background dark:to-neutral-900/40">
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
            <span>Curvature heat + v_t band</span>
            <div className="inline-flex items-center gap-2 rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
              {muLevels.map((level, index) => (
                <button
                  key={level.label}
                  type="button"
                  onClick={() => setMu(index)}
                  className={cn(
                    "rounded-full px-2 py-0.5 transition-colors",
                    mu === index ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
                  )}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </div>
          <SpeedBand profile={speedProfile} minV={minV} maxV={maxV} />
        </div>

        <div className="w-full rounded-2xl border bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70 lg:w-72">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Friction usage</div>
          <div className="mt-3 flex items-center gap-3">
            <FrictionGauge usage={frictionUsage.combined} />
            <div className="space-y-1 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>Lateral ~ {Math.round(frictionUsage.lateral * 100)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                <span>Longitudinal ~ {Math.round(frictionUsage.longitudinal * 100)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span>Combined ~ {Math.round(frictionUsage.combined * 100)}%</span>
              </div>
            </div>
          </div>
          <div className="mt-3 rounded-xl border bg-muted/50 p-3 text-[11px] text-muted-foreground">
            Higher risk stretches the speed band and eats friction headroom. Wet μ shrinks the donut.
          </div>
        </div>
      </div>
    </div>
  )
}

function SpeedBand({
  profile,
  minV,
  maxV,
}: {
  profile: Array<{ s: number; kappa: number; vt: number }>
  minV: number
  maxV: number
}) {
  const stops = profile.map((p) => ({
    offset: p.s * 100,
    color: curvatureColor(p.kappa),
  }))

  const bandPath = profile
    .map((point, index) => {
      const x = 10 + point.s * 80
      const y = 30 + (1 - (point.vt - minV) / (maxV - minV + 0.001)) * 80
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(" ")

  return (
    <div className="relative h-44 overflow-hidden rounded-xl border bg-muted/50">
      <HeatBar stops={stops} />
      <svg viewBox="0 0 100 110" className="absolute inset-0">
        <motion.path
          d={bandPath}
          fill="none"
          stroke="rgba(59,130,246,0.9)"
          strokeWidth={2.5}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8 }}
        />
        <motion.circle
          r={4}
          fill="rgba(59,130,246,0.95)"
          stroke="white"
          strokeWidth={1}
        animate={{
          cx: profile.map((p) => 10 + p.s * 80),
          cy: profile.map(
            (p) => 30 + (1 - (p.vt - minV) / (maxV - minV + 0.001)) * 80
          ),
        }}
        transition={{ repeat: Infinity, ease: linearEase, duration: 6 }}
      />
      </svg>
    </div>
  )
}

function HeatBar({ stops }: { stops: Array<{ offset: number; color: string }> }) {
  const gradientId = "riskCurvatureHeat"
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

function FrictionGauge({ usage }: { usage: number }) {
  const radius = 26
  const tipX = 30 + Math.cos(Math.PI / 4) * radius * usage * 1.1
  const tipY = 30 - Math.sin(Math.PI / 4) * radius * usage * 1.1
  return (
    <svg viewBox="0 0 60 60" className="h-16 w-16">
      <circle cx={30} cy={30} r={radius} fill="none" stroke="rgba(226,232,240,0.6)" strokeWidth={8} />
      <circle cx={30} cy={30} r={radius * 0.6} fill="rgba(16,185,129,0.08)" stroke="rgba(16,185,129,0.5)" strokeWidth={2} />
      <motion.line
        x1={30}
        y1={30}
        x2={tipX}
        y2={tipY}
        stroke="rgba(234,88,12,0.9)"
        strokeWidth={3}
        strokeLinecap="round"
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ repeat: Infinity, duration: 2 }}
      />
      <motion.circle
        r={4}
        fill="rgba(234,88,12,0.95)"
        stroke="white"
        strokeWidth={1.2}
        animate={{ cx: tipX, cy: tipY, opacity: [0.7, 1, 0.7] }}
        transition={{ repeat: Infinity, duration: 2 }}
      />
    </svg>
  )
}

function curvatureColor(kappa: number) {
  const t = Math.min(1, Math.abs(kappa) / 0.16)
  const start = { r: 16, g: 185, b: 129 } // green
  const end = { r: 239, g: 68, b: 68 } // red
  const r = Math.round(start.r + (end.r - start.r) * t)
  const g = Math.round(start.g + (end.g - start.g) * t)
  const b = Math.round(start.b + (end.b - start.b) * t)
  return `rgba(${r},${g},${b},0.9)`
}
