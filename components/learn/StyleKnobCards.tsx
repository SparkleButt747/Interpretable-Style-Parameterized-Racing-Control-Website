'use client'

import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

const knobs = [
  {
    key: "apex",
    title: "Apex offset",
    detail: "Shift the clipping point inside/outside the lane.",
    accent: "from-emerald-400 to-sky-500",
    path: "M8 60 Q 45 20 82 58 Q 118 96 154 54",
  },
  {
    key: "bias",
    title: "Entry/exit bias",
    detail: "Trade entry speed for exit speed (or vice versa).",
    accent: "from-amber-400 to-rose-500",
    path: "M8 70 Q 40 38 70 44 Q 110 64 150 30",
  },
  {
    key: "risk",
    title: "Risk",
    detail: "Scale target speed toward/away from grip limits.",
    accent: "from-rose-400 to-amber-500",
    path: "M8 86 Q 40 60 78 72 Q 120 84 152 62",
  },
  {
    key: "smooth",
    title: "Smoothness",
    detail: "Tighten rate/jerk limits to reduce spikes.",
    accent: "from-sky-400 to-emerald-500",
    path: "M8 76 Q 40 76 78 64 Q 118 52 152 60",
  },
]

export default function StyleKnobCards() {
  return (
    <div className="my-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {knobs.map((knob) => (
          <div
            key={knob.key}
            className="group relative overflow-hidden rounded-2xl border bg-gradient-to-br from-white/80 via-background to-muted/40 p-4 shadow-sm ring-1 ring-border/60 backdrop-blur dark:from-neutral-900/60 dark:via-background dark:to-neutral-900/60"
          >
            <div className={cn("absolute inset-0 opacity-40 blur-2xl bg-gradient-to-br", knob.accent)} />
            <div className="relative flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{knob.title}</div>
                <div className="text-sm text-muted-foreground">{knob.detail}</div>
              </div>
              <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
                knob
              </span>
            </div>
            <MiniCorner pathD={knob.path} accent={knob.accent} />
          </div>
        ))}
      </div>
    </div>
  )
}

function MiniCorner({ pathD, accent }: { pathD: string; accent: string }) {
  return (
    <div className="relative mt-3 h-28 overflow-hidden rounded-xl border bg-muted/50 p-2 dark:border-neutral-800 dark:bg-neutral-950/60">
      <motion.path
        d={pathD}
        fill="none"
        strokeWidth={4}
        strokeLinecap="round"
        className={cn("drop-shadow-sm", accent.includes("emerald") ? "stroke-emerald-500" : "stroke-primary")}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2 }}
      />
      <motion.circle
        r={5}
        fill="white"
        stroke="rgba(59,130,246,0.9)"
        strokeWidth={1.2}
        animate={{ cx: [12, 60, 120, 160], cy: [74, 44, 92, 56] }}
        transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut" }}
      />
      <motion.circle
        r={3.4}
        fill="rgba(16,185,129,0.9)"
        stroke="white"
        strokeWidth={1}
        animate={{ cx: [32, 80, 128, 164], cy: [78, 50, 86, 62] }}
        transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut", delay: 0.2 }}
      />
    </div>
  )
}
