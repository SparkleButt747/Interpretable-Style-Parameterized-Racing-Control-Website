'use client'

import { useState } from "react"

import { cn } from "@/lib/utils"

type Question = {
  id: string
  prompt: string
  options: string[]
  answer: number
  explain?: string
}

const questions: Question[] = [
  {
    id: "lookahead",
    prompt: "Lookahead L is shortened. What happens first?",
    options: [
      "Chatter/oscillation risk rises",
      "Turns get lazier and miss apexes",
      "Speed band shrinks with lower μ",
    ],
    answer: 0,
    explain: "Short L reacts aggressively to near-term error → chatter.",
  },
  {
    id: "curvature",
    prompt: "Curvature spikes: κ doubles. Safe target speed v_t does what?",
    options: [
      "Drops by √2",
      "Stays the same (only lookahead matters)",
      "Increases because steering gain is higher",
    ],
    answer: 0,
    explain: "v_t ≈ sqrt(μg/|κ|); doubling κ halves inside the root.",
  },
  {
    id: "friction",
    prompt: "Combined accel vector tip crosses the friction circle.",
    options: [
      "Expect oscillation at low speed",
      "Expect understeer/oversteer or ABS/TC intervention",
      "It only affects throttle smoothness",
    ],
    answer: 1,
    explain: "Leaving the budget means slip; stability systems may cut in.",
  },
  {
    id: "scheduling",
    prompt: "Gain scheduling lowers kδ at high v. Why?",
    options: [
      "To reduce chatter as dynamics stiffen",
      "To speed up the lap on straights",
      "To increase jerk limits automatically",
    ],
    answer: 0,
    explain: "Lower authority at speed damps oscillation and overshoot.",
  },
]

export default function QuizCoreConcepts() {
  const [answers, setAnswers] = useState<Record<string, number | null>>(
    Object.fromEntries(questions.map((q) => [q.id, null]))
  )
  const [checked, setChecked] = useState(false)

  const score = questions.reduce((acc, q) => (answers[q.id] === q.answer ? acc + 1 : acc), 0)

  return (
    <div className="my-6 overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/40 via-background to-primary/5 p-6 shadow-sm ring-1 ring-border/70 dark:to-sky-900/10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quiz 1 — Core concepts
          </div>
          <div className="text-sm text-muted-foreground">Multiple choice, with short rationales.</div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Badge color="bg-emerald-500" label="Check answers" onClick={() => setChecked(true)} />
          <Badge
            color="bg-muted"
            label="Try again"
            onClick={() => {
              setChecked(false)
              setAnswers(Object.fromEntries(questions.map((q) => [q.id, null])))
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {questions.map((q) => (
          <div
            key={q.id}
            className="rounded-2xl border bg-gradient-to-br from-white/70 via-background to-muted/40 p-4 shadow-sm backdrop-blur dark:from-neutral-900/60 dark:via-background dark:to-neutral-900/60"
          >
            <div className="text-sm font-semibold text-foreground">{q.prompt}</div>
            <div className="mt-3 space-y-2">
              {q.options.map((opt, idx) => {
                const selected = answers[q.id] === idx
                const correct = checked && q.answer === idx
                const wrong = checked && selected && q.answer !== idx
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() =>
                      setAnswers((prev) => ({
                        ...prev,
                        [q.id]: idx,
                      }))
                    }
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                      selected ? "border-primary/70 bg-primary/10" : "border-border bg-background/60",
                      correct && "border-emerald-500/80 bg-emerald-50 dark:bg-emerald-900/30",
                      wrong && "border-rose-500/80 bg-rose-50 dark:bg-rose-900/30"
                    )}
                  >
                    <span>{opt}</span>
                    {checked && correct && <span className="text-[11px] font-semibold text-emerald-600">✓</span>}
                    {checked && wrong && <span className="text-[11px] font-semibold text-rose-600">✕</span>}
                  </button>
                )
              })}
            </div>
            {checked && (
              <div className="mt-2 text-[12px] text-muted-foreground">
                {q.explain ?? "Choose the option that aligns with the controller behaviour."}
              </div>
            )}
          </div>
        ))}
      </div>

      {checked && (
        <div className="mt-4 rounded-xl border bg-white/80 px-3 py-2 text-sm font-semibold shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/70">
          Score: {score}/{questions.length}
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
