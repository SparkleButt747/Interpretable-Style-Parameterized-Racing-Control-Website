"use client"

import Note from "@/components/markdown/note"
import { Link } from "lib/transition"

type InteractiveDisclaimerProps = {
  variant?: "demo" | "playground"
  playgroundHref?: string
  learnHref?: string
}

export default function InteractiveDisclaimer({
  variant = "demo",
  playgroundHref = "/playground",
  learnHref = "/learn/core/plant-and-limits",
}: InteractiveDisclaimerProps) {
  const title = variant === "playground" ? "Simulation Model" : "Interactive Demo"

  const message =
    variant === "playground"
      ? "The Playground uses a simplified vehicle model to build intuition. Treat results as illustrative rather than real‑world accurate."
      : "This interactive is a simplified, teaching-first sketch. It is not a physics-accurate simulation—use the Playground to see real controller behaviour."

  const cta =
    variant === "playground" ? (
      <>
        {" "}
        See <Link href={learnHref} className="underline underline-offset-4">Plant &amp; Limits</Link> for the exact assumptions.
      </>
    ) : (
      <>
        {" "}
        Open <Link href={playgroundHref} className="underline underline-offset-4">Playground</Link> to test the behaviours.
      </>
    )

  return (
    <div className="mt-3">
      <Note title={title} type="warning">
        <p className="mt-3 text-sm text-muted-foreground">
          {message}
          {cta}
        </p>
      </Note>
    </div>
  )
}

