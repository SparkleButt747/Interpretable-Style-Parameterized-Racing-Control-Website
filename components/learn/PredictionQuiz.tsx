'use client'

import { useMemo, useState } from "react"

import { cn } from "@/lib/utils"

type Item = {
  id: string
  scenario: string
  options: string[]
  answer: number
}

const items: Item[] = [
  {
    id: "s_bend",
    scenario: "S-bend, lookahead L = 6 m, high steering gain.",
    options: ["Oscillation around centerline", "Wide lazy apex", "Late braking overshoot"],
    answer: 0,
  },
  {
    id: "hairpin",
    scenario: "Hairpin, risk = high, μ = wet, smoothing low.",
    options: ["Slip/ABS/TC trigger from overspeed", "Lazy turn-in", "Perfectly smooth turn"],
    answer: 0,
  },
  {
    id: "chicane",
    scenario: "Chicane, scheduled gain, longer L, jerk limit tight.",
    options: ["Reduced oscillation, calmer inputs", "Sharper jerk spikes", "Higher target speed band"],
    answer: 0,
  },
]

export default function PredictionQuiz() {
  const [answers, setAnswers] = useState<Record<string, number | null>>(
    Object.fromEntries(items.map((q) => [q.id, null]))
  )
  const [checked, setChecked] = useState(false)

  const score = useMemo(
    () => items.reduce((acc, item) => (answers[item.id] === item.answer ? acc + 1 : acc), 0),
    [answers]
  )

  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-amber-50 p-6 shadow-sm ring-1 ring-border/70 dark:to-amber-900/10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quiz 2 — Prediction
          </div>
          <div className="text-sm text-muted-foreground">Pick the outcome trace that matches the knob setting.</div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Badge color="bg-emerald-500" label="Check answers" onClick={() => setChecked(true)} />
          <Badge
            color="bg-muted"
            label="Try again"
            onClick={() => {
              setChecked(false)
              setAnswers(Object.fromEntries(items.map((q) => [q.id, null])))
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl border bg-gradient-to-br from-white/80 via-background to-muted/40 p-4 shadow-sm dark:from-neutral-900/60 dark:via-background dark:to-neutral-900/60"
          >
            <div className="text-sm font-semibold text-foreground">{item.scenario}</div>
            <div className="mt-3 space-y-2">
              {item.options.map((opt, idx) => {
                const selected = answers[item.id] === idx
                const correct = checked && item.answer === idx
                const wrong = checked && selected && item.answer !== idx
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() =>
                      setAnswers((prev) => ({
                        ...prev,
                        [item.id]: idx,
                      }))
                    }
                    className={cn(
                      "w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                      selected ? "border-primary/70 bg-primary/10" : "border-border bg-background/60",
                      correct && "border-emerald-500/80 bg-emerald-50 dark:bg-emerald-900/30",
                      wrong && "border-rose-500/80 bg-rose-50 dark:bg-rose-900/30"
                    )}
                  >
                    {opt}
                    {checked && correct && <span className="ml-2 text-[11px] font-semibold text-emerald-600">✓</span>}
                    {checked && wrong && <span className="ml-2 text-[11px] font-semibold text-rose-600">✕</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {checked && (
        <div className="mt-4 rounded-xl border bg-white/80 px-3 py-2 text-sm font-semibold shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/70">
          Score: {score}/{items.length}
        </div>
      )}
    </div>
  )
}

function Badge({ color, label, onClick }: { color: string; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground shadow-sm",
        color
      )}
    >
      {label}
    </button>
  )
}
