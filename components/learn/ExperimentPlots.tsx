'use client'

import { motion } from "framer-motion"

const lookaheadData = [
  { L: 6, rmse: 0.52, overshoot: 4 },
  { L: 10, rmse: 0.28, overshoot: 2 },
  { L: 14, rmse: 0.22, overshoot: 1 },
  { L: 18, rmse: 0.32, overshoot: 0 },
  { L: 22, rmse: 0.46, overshoot: 0 },
]

const biasRuns = [
  { apex: "Early", bias: "Entry", lap: "48.9", exit: "11.2 m/s", apexHit: "✔" },
  { apex: "Neutral", bias: "Balanced", lap: "48.2", exit: "11.8 m/s", apexHit: "✔" },
  { apex: "Late", bias: "Exit", lap: "47.8", exit: "12.3 m/s", apexHit: "★" },
]

const paretoPoints = [
  { lap: 47.4, jerk: 2.6 },
  { lap: 47.8, jerk: 2.1 },
  { lap: 48.1, jerk: 1.7 },
  { lap: 48.5, jerk: 1.3 },
  { lap: 49.0, jerk: 1.1 },
]

export function LookaheadVsOscillation() {
  const maxL = Math.max(...lookaheadData.map((p) => p.L))
  const minRmse = Math.min(...lookaheadData.map((p) => p.rmse))
  const maxRmse = Math.max(...lookaheadData.map((p) => p.rmse))

  const linePath = lookaheadData
    .map((p, i) => {
      const x = 8 + (p.L / maxL) * 84
      const y = 80 - ((p.rmse - minRmse) / (maxRmse - minRmse)) * 50
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(" ")

  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-sky-50 p-6 shadow-sm ring-1 ring-border/70 dark:to-sky-900/10">
      <div className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
        Experiment 1 — L vs RMSE(e⊥) & overshoot
      </div>
      <svg viewBox="0 0 100 100" className="h-32 w-full">
        <rect x={6} y={10} width={88} height={74} rx={10} className="fill-muted" />
        <motion.path
          d={linePath}
          fill="none"
          stroke="rgba(59,130,246,0.9)"
          strokeWidth={2.4}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1 }}
        />
        {lookaheadData.map((p) => {
          const x = 8 + (p.L / maxL) * 84
          const y = 80 - ((p.rmse - minRmse) / (maxRmse - minRmse)) * 50
          return (
            <g key={p.L}>
              <circle cx={x} cy={y} r={3.2} className="fill-primary stroke-white" strokeWidth={0.8} />
              <text x={x - 4} y={y - 6} className="fill-muted-foreground text-[9px]">
                {p.overshoot}↑
              </text>
            </g>
          )
        })}
        <text x={10} y={24} className="fill-muted-foreground text-[9px]">
          RMSE(e⊥)
        </text>
        <text x={60} y={92} className="fill-muted-foreground text-[9px]">
          Lookahead L →
        </text>
      </svg>
    </div>
  )
}

export function ApexBiasTable() {
  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-emerald-50 p-6 shadow-sm ring-1 ring-border/70 dark:to-emerald-900/10">
      <div className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
        Experiment 2 — Apex offset & bias runs
      </div>
      <div className="overflow-hidden rounded-xl border bg-background/80 text-sm shadow-sm dark:border-neutral-800">
        <div className="grid grid-cols-4 bg-muted px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Run</span>
          <span>Lap time</span>
          <span>Exit speed</span>
          <span>Apex hit</span>
        </div>
        {biasRuns.map((run) => (
          <div key={`${run.apex}-${run.bias}`} className="grid grid-cols-4 px-3 py-2">
            <span className="font-semibold text-foreground">
              {run.apex} / {run.bias}
            </span>
            <span className="text-muted-foreground">{run.lap} s</span>
            <span className="text-muted-foreground">{run.exit}</span>
            <span className="text-emerald-600 dark:text-emerald-300">{run.apexHit}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">
        Later apex (exit bias) tends to bump exit speed; note apex hits for validity.
      </div>
    </div>
  )
}

export function ParetoJerkScatter() {
  const minLap = Math.min(...paretoPoints.map((p) => p.lap))
  const maxLap = Math.max(...paretoPoints.map((p) => p.lap))
  const minJerk = Math.min(...paretoPoints.map((p) => p.jerk))
  const maxJerk = Math.max(...paretoPoints.map((p) => p.jerk))

  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-amber-50 p-6 shadow-sm ring-1 ring-border/70 dark:to-amber-900/10">
      <div className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
        Experiment 3 — Pareto: T_lap vs mean jerk
      </div>
      <svg viewBox="0 0 100 100" className="h-32 w-full">
        <rect x={6} y={10} width={88} height={74} rx={10} className="fill-muted" />
        {paretoPoints.map((p, idx) => {
          const x = 8 + ((p.jerk - minJerk) / (maxJerk - minJerk)) * 84
          const y = 80 - ((p.lap - minLap) / (maxLap - minLap)) * 50
          return (
            <motion.circle
              key={`${p.lap}-${p.jerk}`}
              r={3.4}
              cx={x}
              cy={y}
              fill="rgba(59,130,246,0.95)"
              stroke="white"
              strokeWidth={1}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
            />
          )
        })}
        <motion.path
          d={`M ${8 + ((paretoPoints[0].jerk - minJerk) / (maxJerk - minJerk)) * 84} ${
            80 - ((paretoPoints[0].lap - minLap) / (maxLap - minLap)) * 50
          } L ${8 + ((paretoPoints[paretoPoints.length - 1].jerk - minJerk) / (maxJerk - minJerk)) * 84} ${
            80 - ((paretoPoints[paretoPoints.length - 1].lap - minLap) / (maxLap - minLap)) * 50
          }`}
          stroke="rgba(16,185,129,0.8)"
          strokeWidth={2}
          strokeDasharray="6 4"
          fill="none"
        />
        <text x={10} y={24} className="fill-muted-foreground text-[9px]">
          Lap time (s)
        </text>
        <text x={54} y={92} className="fill-muted-foreground text-[9px]">
          Mean jerk →
        </text>
      </svg>
      <div className="mt-2 text-[11px] text-muted-foreground">
        Each point: risk/smoothness sweep. Frontier = pick your acceptable jerk for a given lap.
      </div>
    </div>
  )
}
