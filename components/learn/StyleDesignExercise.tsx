'use client'

import { useMemo, useState } from "react"

import { cn } from "@/lib/utils"

type Goal = "fastest" | "smooth" | "robust"

export default function StyleDesignExercise() {
  const [goal, setGoal] = useState<Goal>("fastest")
  const [apex, setApex] = useState(0.5)
  const [bias, setBias] = useState(0.5)
  const [risk, setRisk] = useState(0.8)
  const [smooth, setSmooth] = useState(0.6)
  const [submitted, setSubmitted] = useState(false)

  const lapEstimate = useMemo(() => {
    const base = goal === "fastest" ? 47.5 : goal === "smooth" ? 48.8 : 49.6
    const riskAdj = (risk - 0.6) * (goal === "fastest" ? -1.6 : goal === "robust" ? -0.6 : -1.0)
    const smoothAdj = (0.8 - smooth) * 1.0
    return (base + riskAdj + smoothAdj).toFixed(2)
  }, [goal, risk, smooth])

  const jerkScore = useMemo(() => Math.max(0.1, 1 - smooth * 0.7).toFixed(2), [smooth])

  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-emerald-50 p-6 shadow-sm ring-1 ring-border/70 dark:to-emerald-900/10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Design task — pick a style for Track X
          </div>
          <div className="text-sm text-muted-foreground">
            Choose knobs, justify with a prediction, a run, and a metric preview.
          </div>
        </div>
        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          Submit & check
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="w-full space-y-4 lg:w-72">
          <div className="rounded-2xl border bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Goal</div>
            <div className="flex flex-wrap gap-2">
              {goalOptions.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setGoal(g.value)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                    goal === g.value ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-muted/40 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Style knobs</div>
            <StyleSlider label="Apex offset" value={apex} onChange={setApex} />
            <StyleSlider label="Entry/exit bias" value={bias} onChange={setBias} />
            <StyleSlider label="Risk" value={risk} onChange={setRisk} />
            <StyleSlider label="Smoothness" value={smooth} onChange={setSmooth} />
          </div>
        </div>

        <div className="flex-1 rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/40 p-4 shadow-inner backdrop-blur dark:from-neutral-900/50 dark:via-background dark:to-neutral-900/40">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Report preview</div>
          <div className="mt-3 grid gap-3 text-sm">
            <Metric label="Prediction" value={buildPrediction(goal, risk, smooth)} />
            <Metric label="Run result (est)" value={`${lapEstimate} s lap`} />
            <Metric label="Mean jerk (est)" value={jerkScore} />
            <Metric label="Justification" value="Explain why your knobs fit this track: apex location, μ, and pacing." />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSubmitted(true)}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
            >
              Generate report
            </button>
            {submitted && (
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-300">
                Saved. You can tweak and re-check.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function buildPrediction(goal: Goal, risk: number, smooth: number) {
  if (goal === "fastest") {
    return risk >= 0.9 ? "Expect high v_t, thin friction margin" : "Balanced pace, safer margin"
  }
  if (goal === "smooth") {
    return smooth >= 0.7 ? "Lower jerk, slight lap time cost" : "Medium smoothness, moderate jerk"
  }
  return "Lower risk + higher smoothness → robust under low μ"
}

function StyleSlider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        <span className="text-foreground">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-emerald-500"
      />
    </div>
  )
}

const goalOptions: Array<{ value: Goal; label: string }> = [
  { value: "fastest", label: "Fastest lap" },
  { value: "smooth", label: "Smooth within 0.5s" },
  { value: "robust", label: "Robust in low μ" },
]

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background/70 p-3 shadow-sm dark:border-neutral-800">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  )
}
