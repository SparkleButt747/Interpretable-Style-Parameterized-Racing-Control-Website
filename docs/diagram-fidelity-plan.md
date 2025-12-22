# Diagram & Demo Accuracy Plan

This repo currently mixes (1) teaching-first visuals with hardcoded/example data and (2) the real in-browser Playground simulator. To avoid misleading readers, each visual should either be **derived from the same source-of-truth model/params as the Playground** or be **explicitly labeled as illustrative/not-to-scale**.

## Goals

- Make every diagram/plot/widget deterministic (no `Math.random()` in “data”).
- Share one set of formulas/constants for: curvature→speed, friction usage, rate/jerk limits.
- Use one set of vehicle/track parameters across Playground + Learn visuals where “accuracy” matters.
- Add visible “illustrative / not to scale” labels on visuals that are conceptual by design.

## Inventory (what exists today)

**Diagrams / visuals**
- `components/learn/ProblemControlDiagram.tsx`: control interface sketch (hardcoded track + offsets).
- `components/learn/BicycleDiagram.tsx`: kinematic bicycle geometry (hardcoded `L`, `l_f`, `l_r`).
- `components/learn/GlossaryFrameDiagram.tsx`: tangent/normal frame sketch + friction circle mini-sketch.
- `components/learn/PurePursuitDiagram.tsx`: pure pursuit geometry sketch.
- `components/learn/ApexOffsetDiagram.tsx`: apex/bias path shaping sketch.

**Interactive/animated widgets & plots (mostly hardcoded data)**
- `components/learn/CurvatureSpeedBand.tsx`: curvature→speed band with synthetic curvature segments.
- `components/learn/FrictionDonutWidget.tsx`: friction “donut” with synthetic usage.
- `components/learn/SpeedTrackingPlot.tsx`: PID “overshoot vs stable” plot uses synthetic series (includes randomness).
- `components/learn/GainSchedulingMiniDemo.tsx`: scheduling sketch (verify mapping vs model).
- `components/learn/RiskSpeedBandWidget.tsx`: risk scaling plot + friction gauge (synthetic).
- `components/learn/SmoothnessParetoPlot.tsx`: smoothness trade-off plot (verify mapping vs limits).
- `components/learn/BaselinePresetsDemo.tsx`: preset comparison (synthetic lap/stability numbers).
- `components/learn/ExperimentPlots.tsx`: experiment charts/tables (hardcoded example points).

## Proposed approach

### 1) Classify each visual: “Derived” vs “Illustrative”

For each component above, decide:
- **Derived**: must match the model used by the Playground (same units, same parameters, same formulas).
- **Illustrative**: allowed to be schematic, but must be labeled “Illustration / not to scale” inside the card.

Recommendation:
- Make physics-adjacent visuals **Derived** (`CurvatureSpeedBand`, `FrictionDonutWidget`, speed/jerk/limits plots).
- Keep interface/geometry sketches **Illustrative** unless we want full derivations rendered.

### 2) Centralize shared math + constants

Add a small shared module (example location: `lib/model/`) to host:
- `g`, any “epsilon” constants (avoid magic numbers scattered across components).
- `targetSpeedFromCurvature(mu, kappa)`.
- `frictionUsage(ax, ay, mu)` where `ay = v^2 * kappa` (consistent with Learn equations).
- `applyRateAndJerkLimits(...)` helpers if shown in visuals.

Then update Learn visuals to import these helpers instead of re-implementing formulas ad-hoc.

### 3) Stop hardcoding vehicle parameters in Learn visuals

For any diagram that shows `L`, `l_f`, `l_r`:
- Define a single “default teaching vehicle” sourced from the same YAML used in the Playground (or a checked-in JSON export).
- Use those values in both Learn diagrams and the Playground UI defaults.

If client-side importing is needed, generate a small JSON at build time and import it in `components/learn/*`.

### 4) Replace placeholder plots with generated datasets

For plots/tables meant to show real trends (experiments, pareto plots, speed tracking):
- Create a script (example: `scripts/generate_learn_figures.ts`) that runs parameter sweeps using the same simulation/model code as the Playground and emits JSON under `public/learn-data/` (or `lib/learn-data/`).
- Make the Learn components render from those JSON files (no baked-in example arrays).
- Ensure a stable seed / deterministic output.

### 5) Align “track shapes” with real track data

Many Learn visuals use hardcoded point loops. For “Derived” visuals:
- Pull track centerlines/checkpoints from `tracks/` (via the same parsing used by `app/playground/loadTracks.ts`).
- Sample a consistent segment (S-bend, hairpin, chicane) to render in Learn visuals.

For “Illustrative” visuals:
- Keep the simplified spline, but label it as schematic.

### 6) Add an accuracy checklist for every visual

Before shipping a diagram/widget change, check:
- Units are stated (m, m/s, rad/deg).
- Sign conventions are stated (what is positive `e_y`, `e_ψ`, steering δ).
- No randomness in “data”.
- Any constants (ε, μ defaults, dt) come from one place.
- If the visual is schematic, it says so on-card.

## Quick wins (can be done incrementally)

- Remove `Math.random()` from `components/learn/SpeedTrackingPlot.tsx` and use a deterministic signal.
- Add an on-card “Illustration / not to scale” label to the five pure diagram components.
- Start with one generated dataset: `LookaheadVsOscillation` sweep (small script + JSON + component update), then repeat for the others.

