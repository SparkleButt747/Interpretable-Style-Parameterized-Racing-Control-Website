'use client'

import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

const controls = [
  { label: "Grip μ", value: "0.80", hint: "Dry → wet surface", accent: "bg-emerald-500" },
  { label: "Lookahead L", value: "12.0 m", hint: "Preview distance", accent: "bg-sky-500" },
  { label: "Apex offset", value: "54%", hint: "Shift clipping point", accent: "bg-amber-500" },
  { label: "Bias entry/exit", value: "46/54", hint: "Entry vs exit weighting", accent: "bg-rose-500" },
  { label: "Risk", value: "0.74", hint: "Scale v_t toward grip", accent: "bg-emerald-500" },
  { label: "Smoothness", value: "0.62", hint: "Rate/jerk limits", accent: "bg-sky-500" },
  { label: "Opponent", value: "Baseline ghost", hint: "Head-to-head", accent: "bg-muted-foreground" },
]

export default function ControlPanelDemo() {
  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-emerald-50 p-6 shadow-sm ring-1 ring-border/70 dark:to-emerald-900/10">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Control panel</div>
          <div className="text-sm text-muted-foreground">Same knobs as the live Velox playground.</div>
        </div>
        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Tooltips baked in</div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {controls.map((control, index) => (
          <div
            key={control.label}
            className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-white/80 via-background to-muted/40 p-3 shadow-sm backdrop-blur dark:from-neutral-900/60 dark:via-background dark:to-neutral-900/60"
          >
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>{control.label}</span>
              <span className={cn("h-2 w-2 rounded-full", control.accent)} />
            </div>
            <div className="mt-2 text-lg font-semibold text-foreground">{control.value}</div>
            <div className="text-[11px] text-muted-foreground">{control.hint}</div>
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-sky-500/5"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.14, 0] }}
              transition={{ delay: index * 0.08, repeat: Infinity, duration: 3 }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
