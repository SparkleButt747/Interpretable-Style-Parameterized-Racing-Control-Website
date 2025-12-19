'use client'

import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

const overlays = [
  { label: "Curvature heatmap", desc: "Color by κ", active: true },
  { label: "Speed band", desc: "v vs v_t", active: true },
  { label: "Friction donut", desc: "μ usage", active: false },
  { label: "Error traces", desc: "e⊥, eψ", active: false },
  { label: "Commands", desc: "δ, a_x", active: false },
]

export default function OverlayToggleGrid() {
  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-sky-50 p-6 shadow-sm ring-1 ring-border/70 dark:to-sky-900/10">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Overlays</div>
          <div className="text-sm text-muted-foreground">Toggle analytical overlays just like the Velox playground.</div>
        </div>
        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Toggle grid</div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {overlays.map((overlay, idx) => (
          <div
            key={overlay.label}
            className={cn(
              "relative rounded-2xl border bg-gradient-to-br p-3 shadow-sm backdrop-blur",
              overlay.active
                ? "from-emerald-50 via-background to-emerald-100/40 dark:from-emerald-900/30 dark:to-emerald-900/10"
                : "from-white/80 via-background to-muted/40 dark:from-neutral-900/60 dark:to-neutral-900/50"
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground">{overlay.label}</div>
                <div className="text-[11px] text-muted-foreground">{overlay.desc}</div>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                  overlay.active
                    ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-200"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {overlay.active ? "on" : "off"}
              </span>
            </div>
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-sky-500/5"
              initial={{ opacity: 0 }}
              animate={{ opacity: overlay.active ? [0, 0.12, 0] : 0 }}
              transition={{ delay: idx * 0.1, repeat: overlay.active ? Infinity : 0, duration: 3 }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
