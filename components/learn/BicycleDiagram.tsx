'use client'

import { useMemo } from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

type Wheel = { cx: number; cy: number; width: number; height: number }

export default function BicycleDiagram() {
  const wheelBase = 2.8
  const lf = 1.1
  const lr = wheelBase - lf

  const scale = 42 // px per meter for the svg sketch
  const bodyLength = wheelBase * scale
  const bodyWidth = 1.4 * scale

  const frontWheel = useMemo<Wheel>(
    () => ({
      cx: 60 + lf * scale,
      cy: 80,
      width: 0.32 * scale,
      height: 0.14 * scale,
    }),
    [lf, scale]
  )
  const rearWheel = useMemo<Wheel>(
    () => ({
      cx: 60 - lr * scale,
      cy: 80,
      width: 0.32 * scale,
      height: 0.14 * scale,
    }),
    [lr, scale]
  )

  const body = useMemo(
    () => ({
      x: 60 - lr * scale - (0.2 * scale) / 2,
      y: 80 - bodyWidth / 2,
      width: bodyLength + 0.2 * scale,
      height: bodyWidth,
    }),
    [bodyLength, bodyWidth, lr, scale]
  )

  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-primary/5 p-6 shadow-sm ring-1 ring-border/70 dark:to-sky-950/10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Kinematic bicycle geometry
          </div>
          <div className="text-sm text-muted-foreground">Wheelbase L, front/rear splits, steering δ, heading ψ.</div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <LegendDot color="bg-sky-500" label="Heading ψ" />
          <LegendDot color="bg-emerald-500" label="Steering δ" />
          <LegendDot color="bg-amber-500" label="Wheelbase L" />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/30 p-3 shadow-inner backdrop-blur dark:from-neutral-900/50 dark:via-background dark:to-neutral-900/30">
        <svg viewBox="0 0 210 150" className="relative h-[230px] w-full" role="presentation">
          <defs>
            <linearGradient id="bodyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(59,130,246,0.85)" />
              <stop offset="100%" stopColor="rgba(16,185,129,0.85)" />
            </linearGradient>
          </defs>
          <rect
            x={body.x}
            y={body.y}
            width={body.width}
            height={body.height}
            rx={8}
            fill="url(#bodyGradient)"
            opacity={0.9}
          />
          <rect
            x={body.x + body.width * 0.2}
            y={body.y + 6}
            width={body.width * 0.6}
            height={body.height - 12}
            rx={6}
            fill="rgba(255,255,255,0.12)"
          />

          <WheelRect wheel={rearWheel} angle={0} color="#0ea5e9" />
          <WheelRect wheel={frontWheel} angle={18} color="#22c55e" animate />

          <motion.line
            x1={body.x}
            y1={80}
            x2={body.x + body.width}
            y2={80}
            stroke="rgba(245,158,11,0.9)"
            strokeWidth={3}
            strokeDasharray="6 6"
            animate={{ pathLength: [0.4, 1, 0.4] }}
            transition={{ repeat: Infinity, duration: 2.8, ease: "easeInOut" }}
          />

          <line
            x1={body.x + body.width * (lr / wheelBase)}
            y1={body.y - 6}
            x2={body.x + body.width * (lr / wheelBase)}
            y2={body.y + body.height + 6}
            stroke="rgba(245,158,11,0.7)"
            strokeWidth={2}
            strokeDasharray="4 6"
          />
          <line
            x1={body.x + body.width * (lr / wheelBase) + lf * scale}
            y1={body.y - 6}
            x2={body.x + body.width * (lr / wheelBase) + lf * scale}
            y2={body.y + body.height + 6}
            stroke="rgba(245,158,11,0.7)"
            strokeWidth={2}
            strokeDasharray="4 6"
          />

          <motion.line
            x1={frontWheel.cx}
            y1={frontWheel.cy}
            x2={frontWheel.cx + 30}
            y2={frontWheel.cy}
            stroke="rgba(16,185,129,0.9)"
            strokeWidth={3}
            strokeLinecap="round"
            animate={{ rotate: [-18, 18, -18], originX: frontWheel.cx, originY: frontWheel.cy }}
            transition={{ repeat: Infinity, duration: 4.4, ease: "easeInOut" }}
          />
          <line
            x1={rearWheel.cx}
            y1={rearWheel.cy}
            x2={rearWheel.cx - 30}
            y2={rearWheel.cy}
            stroke="rgba(59,130,246,0.9)"
            strokeWidth={3}
            strokeLinecap="round"
          />

          <motion.text
            x={frontWheel.cx + 32}
            y={frontWheel.cy - 10}
            className="fill-emerald-700 text-[10px]"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            δ
          </motion.text>
          <text x={rearWheel.cx - 36} y={rearWheel.cy - 10} className="fill-sky-700 text-[10px]">
            ψ
          </text>

          <text x={body.x + body.width * 0.48} y={body.y - 10} className="fill-amber-700 text-[10px]">
            L
          </text>
          <text x={body.x + body.width * (0.14)} y={body.y + body.height + 18} className="fill-amber-700 text-[10px]">
            l_r
          </text>
          <text
            x={body.x + body.width * (0.68)}
            y={body.y + body.height + 18}
            className="fill-amber-700 text-[10px]"
          >
            l_f
          </text>
        </svg>

        <div className="pointer-events-none absolute left-3 bottom-3 rounded-xl border border-white/30 bg-white/85 px-3 py-2 text-[11px] shadow-sm backdrop-blur dark:border-white/10 dark:bg-neutral-900/85">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Dynamics (teaching)</div>
          <div className="text-sm font-semibold text-foreground">ẋ, ẏ, ψ̇, v̇ tied to δ and a_x</div>
        </div>
      </div>
    </div>
  )
}

function WheelRect({ wheel, angle, color, animate }: { wheel: Wheel; angle: number; color: string; animate?: boolean }) {
  const rect = (
    <motion.rect
      x={wheel.cx - wheel.width / 2}
      y={wheel.cy - wheel.height / 2}
      width={wheel.width}
      height={wheel.height}
      rx={4}
      fill={color}
      stroke="white"
      strokeWidth={1.4}
      animate={
        animate
          ? { rotate: [-angle, angle, -angle], originX: wheel.cx, originY: wheel.cy }
          : undefined
      }
      transition={animate ? { repeat: Infinity, duration: 4.4, ease: "easeInOut" } : undefined}
    />
  )
  return rect
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/70 px-2 py-1 shadow-sm backdrop-blur dark:bg-neutral-900/70">
      <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
      <span>{label}</span>
    </div>
  )
}
