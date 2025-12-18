// Style-parameterized controller (web)
// Implements kinematic bicycle steering + friction-ellipse throttle allocation
// with monotone piecewise-linear lookahead maps and beta-warped speed targets.

import { closestPoint, sampleAtS, type Path, type PathSample } from "../baseline/path";

export const EPSILON = 1e-3;
const TWO_PI = Math.PI * 2;

export type Vec2 = { x: number; y: number };

// Kept for compatibility with existing imports.
export type Transform = {
  position: Vec2;
  yaw: number;
};

export type StyleControllerState = {
  x: number;
  y: number;
  psi: number;
  v: number;
};

export type StyleControllerPath = Path;

const DEFAULT_LENGTH = 4.5;
const DEFAULT_WIDTH = 1.8;
const FOOTPRINT_MARGIN = 0.25;

export type LookaheadInfo = {
  baseS: number;
  steerS: number;
  speedS: number;
  maxS: number;
  steerOffset: number;
  speedOffset: number;
  baseIdx: number;
  steerIdx: number;
  speedIdx: number;
  maxIdx: number;
};

export type StyleControllerOutput = {
  throttle: number;
  steer: number;
  steering: number; // alias for convenience with existing callers
  targetSpeed?: number;
  accelCommand?: number;
  lookahead: LookaheadInfo;
  debug?: {
    vHat: number;
    theta: number;
    dTheta: number;
    kappaSteer: number;
    kappaSpeed: number;
    vBase: number;
    vStyle: number;
    ay: number;
    axAvail: number;
    axCmd: number;
    sHat: number;
    closestIdx: number;
  };
};

export interface StyleParamControllerConfig {
  Vmax: number;
  aLatMax: number;
  kappaEps: number;
  speedTimeConstant: number;

  styleA: number;
  betaEntry: number;
  betaExit: number;

  K0: number;
  KvGain: number;
  Kkappa: number;
  D: number;

  maxSteerDeg: number;

  axMax: number;
  ayMax: number;
  KvTrack: number;

  steerKnots: readonly number[];
  steerDeltas: readonly number[];
  speedKnots: readonly number[];
  speedDeltas: readonly number[];

  steerRateMax?: number;
  jerkMax?: number;
  risk?: number;
  smoothness?: number;
}

export type ControllerLimits = {
  mu?: number;
  g?: number;
};

export type StyleStepInput = {
  state: StyleControllerState;
  path: StyleControllerPath;
  params?: Partial<StyleParamControllerConfig>;
  limits?: ControllerLimits;
  dt: number;
};

export const defaultStyleParamConfig: StyleParamControllerConfig = {
  Vmax: 30.1964649875,
  aLatMax: 30.79392045061338,
  kappaEps: 0.0002,
  speedTimeConstant: 0.5,

  styleA: 0.24364273219369728,
  betaEntry: 4.702552822291359,
  betaExit: 7.223438823759539,

  K0: 0.09455353077875556,
  KvGain: 0.055236405413204785,
  Kkappa: 0.7641321562604331,
  D: 0.04541569031376522,

  maxSteerDeg: 21.0,

  axMax: 9.365396033197223,
  ayMax: 22.47398905871835,
  KvTrack: 3.617295120201827,

  steerKnots: [0.0, 0.25, 0.5, 0.75, 1.0],
  steerDeltas: [
    9.788170571432957e-13,
    0.9788047674175175,
    0.7417153149594707,
    1.4948742592457407,
    14.155148177337272,
  ],
  speedKnots: [0.0, 0.25, 0.5, 0.75, 1.0],
  speedDeltas: [
    0.037425681884370274,
    0.5134085066272408,
    0.25207321982023906,
    1.769098917198233,
    3.252900022571156,
  ],

  steerRateMax: undefined,
  jerkMax: undefined,
  risk: 0.5,
  smoothness: 0.5,
};

export const MAX_SPEED = defaultStyleParamConfig.Vmax;
export const MAX_ACC = defaultStyleParamConfig.axMax;
export const MAX_ANGLE_DEG = defaultStyleParamConfig.maxSteerDeg;

export class StyleParamController {
  config: StyleParamControllerConfig;

  private Lsteer: MonoPL;
  private Lspeed: MonoPL;
  private steerSignature: string;
  private speedSignature: string;
  private thetaPrev = 0;
  private steerPrev = 0;
  private axPrev = 0;
  private vTargetPrev = 0;

  constructor(config?: Partial<StyleParamControllerConfig>) {
    this.config = { ...defaultStyleParamConfig, ...(config ?? {}) };
    this.Lsteer = MonoPL.fromBase(this.config.steerKnots, this.config.steerDeltas);
    this.Lspeed = MonoPL.fromBase(this.config.speedKnots, this.config.speedDeltas);
    this.steerSignature = JSON.stringify([this.config.steerKnots, this.config.steerDeltas]);
    this.speedSignature = JSON.stringify([this.config.speedKnots, this.config.speedDeltas]);
  }

  reset(): void {
    this.thetaPrev = 0;
    this.steerPrev = 0;
    this.axPrev = 0;
    this.vTargetPrev = 0;
  }

  updateConfig(config: Partial<StyleParamControllerConfig>): void {
    this.config = { ...this.config, ...config };
    this._maybeRefreshMaps(this.config);
  }

  step(input: StyleStepInput): StyleControllerOutput {
    const { state, path, dt } = input;
    const cfg = { ...this.config, ...(input.params ?? {}) };
    const g = input.limits?.g ?? 9.81;
    const mu = input.limits?.mu;
    const spacing = Math.max(path.spacing ?? 0.8, 1e-3);

    const n = path?.points?.length ?? 0;
    if (n < 2 || !Number.isFinite(state.v) || dt <= 0) {
      return {
        throttle: 0,
        steer: 0,
        steering: 0,
        lookahead: {
          baseS: 0,
          steerS: 0,
          speedS: 0,
          maxS: 0,
          steerOffset: 0,
          speedOffset: 0,
          baseIdx: -1,
          steerIdx: -1,
          speedIdx: -1,
          maxIdx: -1,
        },
      };
    }

    this._maybeRefreshMaps(cfg);

    const nearest = closestPoint(path, { x: state.x, y: state.y });
    const v = Math.max(0, state.v);
    const vHat = clamp(v / Math.max(cfg.Vmax, 1e-6), 0, 1);

    // For open tracks, stick to the closest point to avoid "wrapping" toward the start;
    // loops still use a forward-facing anchor to handle the wrap seam smoothly.
    const anchor = path.isLoop ? forwardFacingAnchor(path, state) : nearest;
    const steerOffsetIdx = this.Lsteer.eval(vHat);
    const speedOffsetIdx = this.Lspeed.eval(vHat);
    const startingBias = v < 0.6 ? Math.max(1.5, spacing * 1.4) : 0; // keep target ahead when launching from rest
    const steerLookahead = Math.max(Math.max(0, steerOffsetIdx) * spacing, startingBias);
    const speedLookahead = Math.max(Math.max(0, speedOffsetIdx) * spacing, startingBias);
    const maxLookahead = Math.max(steerLookahead, speedLookahead);

    const anchorDirDot = Math.cos(anchor.heading) * Math.cos(state.psi) + Math.sin(anchor.heading) * Math.sin(state.psi);
    const dirSign = anchorDirDot >= 0 ? 1 : -1;
    const steerResolved = ensureOutsideFootprint(path, anchor.s, steerLookahead, state, spacing, dirSign);
    const speedResolved = ensureOutsideFootprint(path, anchor.s, speedLookahead, state, spacing, dirSign);
    const maxLookaheadResolved = Math.max(steerResolved.dist, speedResolved.dist, maxLookahead);

    const steerSample = steerResolved.sample;
    const speedSample = speedResolved.sample;
    const maxSample = sampleAtS(path, anchor.s + maxLookaheadResolved);

    const theta = headingErrorToPoint(state, steerSample.point);
    const kappaSteer = Math.abs(steerSample.curvature);
    const gain = cfg.K0 + cfg.KvGain * vHat + cfg.Kkappa * Math.sqrt(Math.max(kappaSteer, 0));
    const dTheta = wrapPi(theta - this.thetaPrev) / Math.max(dt, 1e-3);
    this.thetaPrev = theta;

    const maxAngleRad = degToRad(Math.max(cfg.maxSteerDeg, 1e-3));
    let steerCmd = (gain * theta + cfg.D * dTheta) / maxAngleRad;
    steerCmd = clamp(steerCmd, -1, 1);
    steerCmd = this._applySteerRateLimit(steerCmd, cfg, dt);

    const kappaSpeed = Math.abs(speedSample.curvature);
    const sHat = cornerPhaseSHat(path, speedSample.s);
    const curvWindow = Math.max(speedResolved.dist, spacing);
    const kappaPeak = maxCurvatureAhead(path, speedSample.s, curvWindow);

    const risk = Number.isFinite(cfg.risk) ? clamp(cfg.risk ?? 0.5, 0, 1) : 0.5;
    const riskScale = lerp(0.85, 1.15, risk);
    const muBase = mu && mu > 0 ? mu : 1.0;
    const muEff = Math.max(muBase * riskScale, 1e-3);
    const vBase = Math.min(
      cfg.Vmax,
      Math.sqrt((muEff * g) / Math.max(kappaPeak, cfg.kappaEps))
    );
    const vStyle = styleTargetSpeed({
      vBase,
      sHat,
      styleA: cfg.styleA,
      betaEntry: cfg.betaEntry,
      betaExit: cfg.betaExit,
    });
    const vTarget = lowPassTime(this.vTargetPrev || vStyle, vStyle, dt, cfg.speedTimeConstant);
    this.vTargetPrev = vTarget;

    const ay = v * v * kappaSpeed;
    const latCap = Math.min(cfg.ayMax, muEff * g);
    const axCap = Math.min(cfg.axMax, muEff * g);
    const ayRatio = ay / Math.max(latCap, 1e-6);
    const ellipseTerm = Math.max(0, 1 - ayRatio * ayRatio);
    const axAvail = axCap * Math.sqrt(ellipseTerm);

    let axCmd = axAvail - cfg.KvTrack * (v - vTarget);
    axCmd = clamp(axCmd, -axAvail, axAvail);
    axCmd = this._applyJerkLimit(axCmd, cfg, dt);

    let throttle = axCmd / Math.max(axCap, 1e-6);
    throttle = clamp(throttle, -1, 1);

    return {
      throttle,
      steer: steerCmd,
      steering: steerCmd,
      lookahead: {
        baseS: anchor.s,
        steerS: steerSample.s,
        speedS: speedSample.s,
        maxS: maxSample.s,
        steerOffset: steerResolved.dist,
        speedOffset: speedResolved.dist,
        baseIdx: idxFromS(path, anchor.s),
        steerIdx: idxFromS(path, steerSample.s),
        speedIdx: idxFromS(path, speedSample.s),
        maxIdx: idxFromS(path, maxSample.s),
      },
      debug: {
        vHat,
        theta,
        dTheta,
        kappaSteer,
        kappaSpeed: kappaPeak,
        vBase,
        vStyle: vTarget,
        ay,
        axAvail,
        axCmd,
        sHat,
        closestIdx: idxFromS(path, anchor.s),
      },
      targetSpeed: vTarget,
      accelCommand: axCmd,
    };
  }

  private _maybeRefreshMaps(cfg: StyleParamControllerConfig): void {
    const steerSig = JSON.stringify([cfg.steerKnots, cfg.steerDeltas]);
    const speedSig = JSON.stringify([cfg.speedKnots, cfg.speedDeltas]);
    if (steerSig !== this.steerSignature) {
      this.Lsteer = MonoPL.fromBase(cfg.steerKnots, cfg.steerDeltas);
      this.steerSignature = steerSig;
    }
    if (speedSig !== this.speedSignature) {
      this.Lspeed = MonoPL.fromBase(cfg.speedKnots, cfg.speedDeltas);
      this.speedSignature = speedSig;
    }
  }

  private _applySteerRateLimit(steerCmd: number, cfg: StyleParamControllerConfig, dt: number): number {
    if (!Number.isFinite(cfg.steerRateMax)) {
      this.steerPrev = steerCmd;
      return steerCmd;
    }

    const smooth = Number.isFinite(cfg.smoothness) ? clamp(cfg.smoothness ?? 0.5, 0, 1) : 0.5;
    const rateScale = lerp(1.5, 0.5, smooth); // smoother => tighter rate cap
    const rateMax = (cfg.steerRateMax ?? 0) * rateScale;
    const delta = steerCmd - this.steerPrev;
    const maxDelta = rateMax * dt;
    const limited = this.steerPrev + clamp(delta, -maxDelta, maxDelta);
    this.steerPrev = limited;
    return limited;
  }

  private _applyJerkLimit(axCmd: number, cfg: StyleParamControllerConfig, dt: number): number {
    if (!Number.isFinite(cfg.jerkMax)) {
      this.axPrev = axCmd;
      return axCmd;
    }

    const smooth = Number.isFinite(cfg.smoothness) ? clamp(cfg.smoothness ?? 0.5, 0, 1) : 0.5;
    const jerkScale = lerp(1.5, 0.5, smooth);
    const jMax = (cfg.jerkMax ?? 0) * jerkScale;
    const dax = axCmd - this.axPrev;
    const maxDax = jMax * dt;
    const limited = this.axPrev + clamp(dax, -maxDax, maxDax);
    this.axPrev = limited;
    return limited;
  }
}

/* ------------------------------ Helpers ------------------------------ */

function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  return value < lo ? lo : value > hi ? hi : value;
}

function clampInt(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  if (value < lo) return lo;
  if (value > hi) return hi;
  return Math.trunc(value);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function wrapPi(angle: number): number {
  const a = angle % TWO_PI;
  if (a > Math.PI) return a - TWO_PI;
  if (a <= -Math.PI) return a + TWO_PI;
  return a;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function idxFromS(path: StyleControllerPath, s: number): number {
  const n = path.points.length;
  if (n === 0) return -1;
  const spacing = Math.max(path.spacing ?? 1e-3, 1e-3);
  const raw = Math.round(s / spacing);
  if (path.isLoop) {
    return ((raw % n) + n) % n;
  }
  return clampInt(raw, 0, n - 1);
}

function forwardDistance(path: StyleControllerPath, fromS: number, toS: number): number {
  if (!path.isLoop) return Math.max(0, toS - fromS);
  const len = path.length || 0;
  if (len <= 0) return 0;
  return ((toS - fromS) % len + len) % len;
}

function pointInFootprint(state: StyleControllerState, point: Vec2): boolean {
  const dx = point.x - state.x;
  const dy = point.y - state.y;
  const cos = Math.cos(state.psi);
  const sin = Math.sin(state.psi);
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;
  const halfL = DEFAULT_LENGTH / 2 + FOOTPRINT_MARGIN;
  const halfW = DEFAULT_WIDTH / 2 + FOOTPRINT_MARGIN;
  return Math.abs(localX) <= halfL && Math.abs(localY) <= halfW;
}

function ensureOutsideFootprint(
  path: StyleControllerPath,
  anchorS: number,
  desiredLookahead: number,
  state: StyleControllerState,
  spacing: number,
  dirSign: number
): { sample: PathSample; dist: number } {
  const step = Math.max(spacing, 0.4);
  const maxAdvance = Math.max(12, step * 10);
  const stepDir = dirSign >= 0 ? 1 : -1;
  for (let adv = 0; adv <= maxAdvance; adv += step) {
    const signedAdvance = stepDir * (desiredLookahead + adv);
    const sample = sampleAtS(path, anchorS + signedAdvance);
    if (!pointInFootprint(state, sample.point)) {
      const dist =
        stepDir >= 0
          ? forwardDistance(path, anchorS, sample.s)
          : Math.abs(anchorS - sample.s);
      return { sample, dist };
    }
  }
  const fallbackSigned = stepDir * (desiredLookahead + maxAdvance);
  const fallback = sampleAtS(path, anchorS + fallbackSigned);
  const dist =
    stepDir >= 0 ? forwardDistance(path, anchorS, fallback.s) : Math.abs(anchorS - fallback.s);
  return { sample: fallback, dist };
}

function forwardFacingAnchor(path: StyleControllerPath, state: StyleControllerState): PathSample {
  const base = closestPoint(path, { x: state.x, y: state.y });
  const dir = { x: Math.cos(state.psi), y: Math.sin(state.psi) };
  const cosHalf = Math.cos(degToRad(85));
  let best: PathSample | null = null;
  let bestD2 = Number.POSITIVE_INFINITY;

  const considerSegment = (
    a: { x: number; y: number; s: number; curvature: number },
    b: { x: number; y: number; s: number; curvature: number },
    wrapAdd = 0
  ) => {
    const segVec = { x: b.x - a.x, y: b.y - a.y };
    const segLen2 = Math.max(segVec.x * segVec.x + segVec.y * segVec.y, 1e-9);
    const t = clamp(((state.x - a.x) * segVec.x + (state.y - a.y) * segVec.y) / segLen2, 0, 1);
    const proj = { x: a.x + segVec.x * t, y: a.y + segVec.y * t };
    const sVal = lerp(a.s, b.s + wrapAdd, t);
    const wrappedS = path.isLoop && wrapAdd > 0 && sVal >= path.length ? sVal - path.length : sVal;
    const vx = proj.x - state.x;
    const vy = proj.y - state.y;
    const dist2 = vx * vx + vy * vy;
    if (dist2 <= 1e-9) return;
    const dot = vx * dir.x + vy * dir.y;
    if (dot <= 0) return;
    const cosAng = dot / Math.sqrt(dist2);
    if (cosAng < cosHalf) return;
    if (dist2 < bestD2) {
      bestD2 = dist2;
      best = {
        point: proj,
        s: wrappedS,
        heading: Math.atan2(segVec.y, segVec.x),
        curvature: lerp(a.curvature, b.curvature, t),
      };
    }
  };

  const pts = path.points;
  const limit = pts.length - 1;
  for (let i = 0; i < limit; i += 1) {
    considerSegment(pts[i], pts[i + 1]);
  }
  if (path.isLoop && pts.length >= 2) {
    considerSegment(pts[pts.length - 1], pts[0], path.length);
  }

  if (best) return best;
  // Fallback: nudge forward along the closest s to avoid sitting on the car
  const tangent = { x: Math.cos(base.heading), y: Math.sin(base.heading) };
  const dirDot = tangent.x * dir.x + tangent.y * dir.y;
  const forward = Math.max(path.spacing ?? 0.6, 0.6);
  const signed = dirDot >= 0 ? forward : -forward;
  return sampleAtS(path, base.s + signed);
}

function headingErrorToPoint(state: StyleControllerState, target: Vec2): number {
  const dx = target.x - state.x;
  const dy = target.y - state.y;
  const desired = Math.atan2(dy, dx);
  return wrapPi(desired - state.psi);
}

export class MonoPL {
  readonly knots: number[];
  readonly values: number[];

  private constructor(knots: number[], values: number[]) {
    this.knots = knots;
    this.values = values;
  }

  static fromBase(knots: readonly number[], deltas: readonly number[]): MonoPL {
    if (knots.length < 2) throw new Error("MonoPL requires at least two knots");
    if (deltas.length !== knots.length) {
      throw new Error("Delta array must match knot array length");
    }
    const ks = knots.map((k) => {
      const val = Number(k);
      if (!Number.isFinite(val)) throw new Error("Knots must be finite numbers");
      return val;
    });
    for (let i = 1; i < ks.length; i += 1) {
      if (ks[i] < ks[i - 1]) throw new Error("Knots must be non-decreasing");
    }

    const values = new Array<number>(deltas.length);
    let acc = 0;
    for (let i = 0; i < deltas.length; i += 1) {
      const deltaVal = Number(deltas[i]);
      if (!Number.isFinite(deltaVal)) throw new Error("Deltas must be finite numbers");
      acc += Math.max(0, deltaVal);
      values[i] = acc;
    }
    return new MonoPL(ks, values);
  }

  eval(x: number): number {
    const clamped = clamp(x, 0, 1);
    const idx = searchSorted(this.knots, clamped);
    const i = Math.max(0, Math.min(this.knots.length - 2, idx - 1));
    const x0 = this.knots[i];
    const x1 = this.knots[i + 1];
    if (x1 - x0 <= 1e-9) return this.values[i];
    const t = (clamped - x0) / (x1 - x0);
    return (1 - t) * this.values[i] + t * this.values[i + 1];
  }
}

function searchSorted(arr: number[], x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (x < arr[mid]) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function maxCurvatureAhead(path: StyleControllerPath, s: number, window: number): number {
  const span = Math.max(window, path.spacing ?? 0.8, 1e-3);
  const steps = Math.max(1, Math.ceil(span / Math.max(path.spacing ?? 1, 0.4)));
  const step = span / steps;
  let maxCurv = 0;
  for (let i = 0; i <= steps; i += 1) {
    const sample = sampleAtS(path, s + i * step);
    const curv = Math.abs(sample.curvature);
    if (curv > maxCurv) maxCurv = curv;
  }
  return maxCurv;
}

function cornerPhaseSHat(path: StyleControllerPath, s: number, window = 8): number {
  const pts = path.points;
  const n = pts.length;
  if (n < 3) return 0.5;
  const spacing = Math.max(path.spacing ?? 1e-3, 1e-3);
  const radius = Math.min(Math.max(1, Math.floor(window)), Math.max(1, Math.floor(n / 2)));
  const span = Math.max(1, radius * 2);

  let peakOffset = 0;
  let peakCurv = -Infinity;
  for (let k = -radius; k <= radius; k += 1) {
    const sample = sampleAtS(path, s + k * spacing);
    const curv = Math.abs(sample.curvature);
    if (curv > peakCurv) {
      peakCurv = curv;
      peakOffset = k;
    }
  }

  const raw = (radius + peakOffset) / span;
  return clamp(raw, 0, 1);
}

function betaWarpNormalized(sHat: number, betaEntry: number, betaExit: number): number {
  const s = clamp(sHat, EPSILON, 1 - EPSILON);
  const be = Math.max(betaEntry, 0.5);
  const bx = Math.max(betaExit, 0.5);
  const mode = be > 1 && bx > 1 ? (be - 1) / (be + bx - 2) : 0.5;
  const peak = betaWarp(mode, be, bx);
  const val = betaWarp(s, be, bx);
  return clamp(val / Math.max(peak, 1e-9), 0, 1);
}

function betaWarp(s: number, betaEntry: number, betaExit: number): number {
  return s ** (betaEntry - 1) * (1 - s) ** (betaExit - 1);
}

function lowPass(prev: number, next: number, alpha: number): number {
  const a = clamp(alpha, 0, 1);
  return prev + (next - prev) * a;
}

function lowPassTime(prev: number, next: number, dt: number, timeConstant: number): number {
  if (!(timeConstant > 0) || !(dt > 0)) return next;
  const alpha = 1 - Math.exp(-dt / Math.max(timeConstant, EPSILON));
  return lowPass(prev, next, alpha);
}

function styleTargetSpeed({
  vBase,
  sHat,
  styleA,
  betaEntry,
  betaExit,
}: {
  vBase: number;
  sHat: number;
  styleA: number;
  betaEntry: number;
  betaExit: number;
}): number {
  const profile = betaWarpNormalized(sHat, betaEntry, betaExit);
  const depth = clamp(styleA, 0, 1);
  const v = vBase * (1 - depth * profile);
  return Math.max(0, v);
}

export const __all__ = [
  "MAX_SPEED",
  "MAX_ACC",
  "EPSILON",
  "MAX_ANGLE_DEG",
  "MonoPL",
  "LookaheadInfo",
  "StyleParamControllerConfig",
  "StyleParamController",
];
