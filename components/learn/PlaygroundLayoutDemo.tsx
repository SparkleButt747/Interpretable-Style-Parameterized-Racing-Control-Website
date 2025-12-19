'use client'

import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

const linearEase = (t: number) => t

export default function PlaygroundLayoutDemo() {
  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-primary/5 p-6 shadow-sm ring-1 ring-border/70 dark:to-sky-900/10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Playground layout
          </div>
          <div className="text-sm text-muted-foreground">
            Controls on the left, live track + overlays center, metrics on the right.
          </div>
        </div>
        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          Inspired by Velox UI
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_2fr_1.1fr]">
        <Panel title="Controls" subtitle="Track / controller / sliders">
          <MiniSlider label="Grip μ" value="0.82" />
          <MiniSlider label="Lookahead L" value="12.0 m" />
          <MiniSlider label="Apex offset" value="56%" />
          <MiniSlider label="Risk" value="74%" />
          <MiniToggle label="Opponent ghost" on />
        </Panel>

        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/30 p-4 shadow-inner backdrop-blur dark:from-neutral-900/60 dark:via-background dark:to-neutral-900/40">
          <TrackPreview />
          <OverlayChips />
        </div>

        <Panel title="Metrics" subtitle="Lap / errors / friction">
          <MetricRow label="Lap time" value="48.32 s" />
          <MetricRow label="RMSE(e⊥)" value="0.24 m" />
          <MetricRow label="Mean jerk" value="1.8 m/s³" />
          <MetricRow label="Peak μ use" value="86%" />
          <MetricRow label="Overshoots" value="1" />
        </Panel>
      </div>
    </div>
  )
}

function TrackPreview() {
  const trackPath = "M12 120 Q 50 18 98 60 T 186 120"
  return (
    <>
      <svg viewBox="0 0 200 150" className="h-[230px] w-full" role="presentation">
        <defs>
          <linearGradient id="layoutTrack" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(16,185,129,0.85)" />
            <stop offset="100%" stopColor="rgba(59,130,246,0.85)" />
          </linearGradient>
        </defs>
        <motion.path
          d={trackPath}
          fill="none"
          stroke="url(#layoutTrack)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1 }}
        />
        <motion.path
          d={trackPath}
          fill="none"
          stroke="rgba(99,102,241,0.3)"
          strokeWidth={8}
          strokeDasharray="14 18"
          strokeLinecap="round"
          animate={{ pathOffset: [0, 1] }}
          transition={{ repeat: Infinity, duration: 12, ease: linearEase }}
        />
        <motion.circle
          r={6}
          fill="rgba(59,130,246,0.95)"
          stroke="white"
          strokeWidth={1.4}
          animate={{ cx: [26, 88, 140, 180], cy: [116, 40, 86, 120] }}
          transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
        />
        <motion.circle
          r={4.4}
          fill="rgba(16,185,129,0.9)"
          stroke="white"
          strokeWidth={1.2}
          animate={{ cx: [54, 110, 152, 186], cy: [100, 58, 74, 116] }}
          transition={{ repeat: Infinity, duration: 6, ease: "easeInOut", delay: 0.15 }}
        />
      </svg>
    </>
  )
}

function OverlayChips() {
  const overlays = ["Curvature", "Speed band", "Friction", "Errors", "Commands"]
  return (
    <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2 text-[11px] font-semibold">
      {overlays.map((o, idx) => (
        <span
          key={o}
          className={cn(
            "rounded-full border border-white/30 bg-white/80 px-3 py-1 shadow-sm backdrop-blur dark:border-white/10 dark:bg-neutral-900/80",
            idx < 3 ? "text-emerald-700 dark:text-emerald-200" : "text-muted-foreground"
          )}
        >
          {o}
        </span>
      ))}
    </div>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-gradient-to-br from-white/80 via-background to-muted/40 p-4 shadow-sm backdrop-blur dark:from-neutral-900/60 dark:via-background dark:to-neutral-900/60">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
      {subtitle && <div className="text-[11px] text-muted-foreground">{subtitle}</div>}
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  )
}

function MiniSlider({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        <span className="text-foreground">{value}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-500"
          initial={{ width: "60%" }}
          animate={{ width: ["45%", "75%", "60%"] }}
          transition={{ repeat: Infinity, duration: 4.2, ease: "easeInOut" }}
        />
      </div>
    </div>
  )
}

function MiniToggle({ label, on }: { label: string; on?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
      <span>{label}</span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
          on ? "bg-emerald-500/20 text-emerald-700" : "bg-muted text-muted-foreground"
        )}
      >
        {on ? "on" : "off"}
      </span>
    </div>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border bg-background/70 px-3 py-2 text-sm shadow-sm dark:border-neutral-800">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  )
}
