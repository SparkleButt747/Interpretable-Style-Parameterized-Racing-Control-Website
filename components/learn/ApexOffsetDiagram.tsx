'use client'

import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

type Profile = "early" | "late"

const profiles: Record<Profile, { label: string; path: string; fill: string }> = {
  early: {
    label: "Early apex",
    path: "M6 80 C 40 30, 120 30, 170 80",
    fill: "rgba(59,130,246,0.18)",
  },
  late: {
    label: "Late apex",
    path: "M6 84 C 60 100, 120 60, 170 76",
    fill: "rgba(16,185,129,0.18)",
  },
}

export default function ApexOffsetDiagram() {
  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-emerald-50 p-6 shadow-sm ring-1 ring-border/70 dark:to-sky-900/10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Path shaping: early vs late apex
          </div>
          <div className="text-sm text-muted-foreground">
            Offset the path along the lane normal to bias entry/exit.
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <LegendDot color="bg-sky-500" label="Early apex" />
          <LegendDot color="bg-emerald-500" label="Late apex" />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/30 p-4 shadow-inner backdrop-blur dark:from-neutral-900/50 dark:via-background dark:to-neutral-900/30">
        <svg viewBox="0 0 180 120" className="h-[220px] w-full" role="presentation">
          <defs>
            <linearGradient id="laneFill" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(226,232,240,0.6)" />
              <stop offset="100%" stopColor="rgba(226,232,240,0.3)" />
            </linearGradient>
          </defs>
          <rect x={8} y={30} width={164} height={60} rx={14} fill="url(#laneFill)" />
          <motion.path
            d={profiles.early.path}
            fill="none"
            stroke="rgba(59,130,246,0.9)"
            strokeWidth={3.5}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1 }}
          />
          <motion.path
            d={profiles.late.path}
            fill="none"
            stroke="rgba(16,185,129,0.9)"
            strokeWidth={3.5}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1 }}
          />
          <motion.circle
            r={5}
            fill="rgba(59,130,246,0.95)"
            stroke="white"
            strokeWidth={1.2}
            animate={{ cx: [20, 70, 120, 160], cy: [80, 42, 86, 62] }}
            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
          />
          <motion.circle
            r={5}
            fill="rgba(16,185,129,0.95)"
            stroke="white"
            strokeWidth={1.2}
            animate={{ cx: [20, 70, 120, 160], cy: [84, 96, 64, 78] }}
            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut", delay: 0.2 }}
          />
        </svg>

        <div className="pointer-events-none absolute left-3 bottom-3 rounded-xl border border-white/30 bg-white/85 px-3 py-2 text-[11px] shadow-sm backdrop-blur dark:border-white/10 dark:bg-neutral-900/85">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Lane-normal offset d(s)</div>
          <div className="text-[11px] text-muted-foreground">Pull apex earlier or later to change how you take the corner.</div>
        </div>
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/70 px-2 py-1 shadow-sm backdrop-blur dark:bg-neutral-900/70">
      <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
      <span>{label}</span>
    </div>
  )
}
