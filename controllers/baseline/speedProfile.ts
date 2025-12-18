import type { Path } from "./path";
import { sampleAtS } from "./path";
import { clamp, lowPassTime } from "./math";

const kGravity = 9.81;

export interface TargetSpeedConfig {
  mu?: number;
  minSpeed?: number;
  maxSpeed?: number;
  previewDistance?: number;
  smoothingTimeConstant?: number;
  curvatureEpsilon?: number;
  riskScale?: number;
}

export interface TargetSpeedState {
  s: number;
  speed: number;
}

export interface TargetSpeedResult {
  targetSpeed: number;
  rawLimit: number;
  previewCurvature: number;
}

export class TargetSpeedPlanner {
  private cfg: Required<TargetSpeedConfig>;
  private lastTarget = 0;

  constructor(config: TargetSpeedConfig = {}) {
    this.cfg = {
      mu: config.mu ?? 0.9,
      minSpeed: config.minSpeed ?? 0,
      maxSpeed: config.maxSpeed ?? 30,
      previewDistance: config.previewDistance ?? 10,
      smoothingTimeConstant: config.smoothingTimeConstant ?? 0.35,
      curvatureEpsilon: config.curvatureEpsilon ?? 1e-3,
      riskScale: config.riskScale ?? 1,
    };
  }

  reset(initialSpeed = 0): void {
    this.lastTarget = initialSpeed;
  }

  update(path: Path, state: TargetSpeedState, dt: number): TargetSpeedResult {
    const curvature = this.maxCurvatureAhead(path, state.s, this.cfg.previewDistance);
    const effectiveMu = Math.max(this.cfg.mu * this.cfg.riskScale, 1e-3);
    const rawLimit = Math.sqrt(effectiveMu * kGravity / (Math.abs(curvature) + this.cfg.curvatureEpsilon));
    const clamped = clamp(rawLimit, this.cfg.minSpeed, this.cfg.maxSpeed);
    const targetSpeed = lowPassTime(this.lastTarget, clamped, dt, this.cfg.smoothingTimeConstant);
    this.lastTarget = targetSpeed;
    return {
      targetSpeed,
      rawLimit,
      previewCurvature: curvature,
    };
  }

  private maxCurvatureAhead(path: Path, s: number, preview: number): number {
    const steps = Math.max(2, Math.ceil(preview / Math.max(path.spacing, 0.5)));
    const step = preview / steps;
    let maxCurv = 0;
    for (let i = 0; i <= steps; i += 1) {
      const sample = sampleAtS(path, s + i * step);
      const curv = Math.abs(sample.curvature);
      if (curv > maxCurv) maxCurv = curv;
    }
    return maxCurv;
  }
}
