'use client'

import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

const modes = [
  {
    title: "Small L → oscillation",
    detail: "Reactive steering chatters left/right.",
    accent: "bg-amber-500",
    animation: "oscillate",
  },
  {
    title: "Large L → lazy apex",
    detail: "Turns late and misses the clipping point.",
    accent: "bg-sky-500",
    animation: "lazy",
  },
  {
    title: "Ignores curvature",
    detail: "Too-fast entries blow past grip limits.",
    accent: "bg-rose-500",
    animation: "overspeed",
  },
  {
    title: "No rate limits",
    detail: "Pedal/steer spikes feel rough and unstable.",
    accent: "bg-neutral-500",
    animation: "jerk",
  },
]

export default function FailureModesShowcase() {
  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-rose-50 p-6 shadow-sm ring-1 ring-border/70 dark:to-rose-900/10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Typical failure modes
          </div>
          <div className="text-sm text-muted-foreground">
            Why the naive rules break before we add better control.
          </div>
        </div>
        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          Watch for these
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {modes.map((mode) => (
          <div
            key={mode.title}
            className="relative overflow-hidden rounded-2xl border bg-white/80 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent dark:via-white/5" />
            <div className="flex items-start gap-3">
              <span className={cn("mt-1 h-2 w-2 rounded-full", mode.accent)} />
              <div>
                <div className="text-sm font-semibold text-foreground">{mode.title}</div>
                <div className="text-[12px] text-muted-foreground">{mode.detail}</div>
              </div>
            </div>
            <div className="mt-3 h-24 rounded-xl border bg-muted/60 p-3 dark:border-neutral-800 dark:bg-neutral-950/60">
              <FailureAnimation type={mode.animation} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FailureAnimation({ type }: { type: string }) {
  if (type === "oscillate") {
    return (
      <svg viewBox="0 0 160 60" className="h-full w-full">
        <motion.path
          d="M10 30 Q 30 10 50 30 Q 70 50 90 30 Q 110 10 130 30"
          fill="none"
          stroke="rgba(234,179,8,0.9)"
          strokeWidth={4}
          strokeLinecap="round"
          animate={{ pathLength: [0.4, 1, 0.4] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
        />
        <motion.circle
          r={5}
          fill="rgba(59,130,246,0.95)"
          stroke="white"
          strokeWidth={1.4}
          animate={{ cx: [20, 140], cy: [20, 40, 20] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
        />
      </svg>
    )
  }

  if (type === "lazy") {
    return (
      <svg viewBox="0 0 160 60" className="h-full w-full">
        <path
          d="M10 45 Q 60 15 120 20 Q 150 22 150 40"
          fill="none"
          stroke="rgba(99,102,241,0.35)"
          strokeWidth={8}
          strokeLinecap="round"
        />
        <motion.path
          d="M10 45 Q 60 15 120 20 Q 150 22 150 40"
          fill="none"
          stroke="rgba(59,130,246,0.95)"
          strokeWidth={4}
          strokeLinecap="round"
          animate={{ pathOffset: [0.2, 0.8, 0.2] }}
          transition={{ repeat: Infinity, duration: 2.8, ease: "easeInOut" }}
        />
        <motion.circle
          r={6}
          fill="rgba(59,130,246,0.95)"
          stroke="white"
          strokeWidth={1.4}
          animate={{ cx: [20, 70, 130, 150], cy: [45, 22, 26, 40] }}
          transition={{ repeat: Infinity, duration: 2.8, ease: "easeInOut" }}
        />
        <motion.circle
          r={3}
          fill="rgba(248,113,113,0.9)"
          stroke="white"
          strokeWidth={1}
          animate={{ cx: [40, 90, 140], cy: [25, 18, 22] }}
          transition={{ repeat: Infinity, duration: 2.8, ease: "easeInOut" }}
        />
      </svg>
    )
  }

  if (type === "overspeed") {
    return (
      <svg viewBox="0 0 160 60" className="h-full w-full">
        <path
          d="M12 40 Q 60 20 110 22 Q 148 25 150 32"
          fill="none"
          stroke="rgba(248,113,113,0.25)"
          strokeWidth={10}
          strokeLinecap="round"
        />
        <motion.circle
          r={6}
          fill="rgba(248,113,113,0.9)"
          stroke="white"
          strokeWidth={1.2}
          animate={{ cx: [18, 70, 120, 150], cy: [40, 22, 24, 32] }}
          transition={{ repeat: Infinity, duration: 2.1, ease: "easeInOut" }}
        />
        <motion.rect
          x={118}
          y={8}
          width={34}
          height={14}
          rx={4}
          fill="rgba(248,113,113,0.18)"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
        />
        <motion.text
          x={135}
          y={18}
          textAnchor="middle"
          className="fill-rose-700 text-[10px]"
          animate={{ opacity: [0.9, 0.6, 0.9] }}
          transition={{ repeat: Infinity, duration: 1.4 }}
        >
          too fast
        </motion.text>
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 160 60" className="h-full w-full">
      <motion.line
        x1={20}
        y1={40}
        x2={140}
        y2={20}
        stroke="rgba(107,114,128,0.9)"
        strokeWidth={4}
        strokeLinecap="round"
        animate={{ strokeDasharray: ["6 10", "2 4", "6 10"] }}
        transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
      />
      <motion.rect
        x={70}
        y={16}
        width={22}
        height={28}
        rx={6}
        fill="rgba(107,114,128,0.18)"
        stroke="rgba(107,114,128,0.5)"
        animate={{ x: [60, 80, 60] }}
        transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
      />
      <motion.circle
        r={6}
        fill="rgba(59,130,246,0.95)"
        stroke="white"
        strokeWidth={1.4}
        animate={{ cx: [30, 90, 140], cy: [42, 24, 18] }}
        transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
      />
    </svg>
  )
}
