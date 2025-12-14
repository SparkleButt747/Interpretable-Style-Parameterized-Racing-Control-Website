import { solveQP } from './qpsolver';
import { projectToTrack, sampleAtS } from './track';
import type { MpccConfig, MpccControl, MpccState, MpccStepResult, TrackMap, MpccVehicle } from './types';

const NX = 5; // [x, y, psi, v, delta]
const NU = 2; // [steering_rate, acceleration]

export interface MpccSolver {
  step(state: MpccState, timestamp: number): MpccStepResult;
  reset(): void;
}

export async function createMpccSolver(config: MpccConfig, track: TrackMap): Promise<MpccSolver> {
  return new WorldMpccSolver(config, track);
}

class WorldMpccSolver implements MpccSolver {
  private lastControl: MpccControl = { steering_rate: 0, acceleration: 0 };
  private warmStart: Float64Array;
  private vehicle: Required<MpccVehicle>;
  private lastS: number | null = null;

  constructor(private readonly cfg: MpccConfig, private readonly track: TrackMap) {
    this.warmStart = new Float64Array(this.cfg.horizon_steps * NU);
    this.vehicle = normalizeVehicle(cfg.vehicle);
  }

  reset(): void {
    this.lastControl = { steering_rate: 0, acceleration: 0 };
    this.warmStart.fill(0);
    this.lastS = null;
  }

  step(state: MpccState, _timestamp: number): MpccStepResult {
    const N = this.cfg.horizon_steps;
    const dt = this.cfg.dt;

    const proj = projectToTrack(this.track, { x: state.x, y: state.y }, state.psi, this.lastS ?? undefined);
    this.lastS = proj.s;

    const refs = buildReferences(this.track, proj.s, targetSpeed(state.v, proj.curvature), dt, N, this.vehicle.wheelbase);

    const { Ad, Bd } = linearizeSingleTrack(state, dt, this.vehicle);
    const Phi = buildPhi(Ad, N);
    const Gamma = buildGamma(Ad, Bd, N);

    const x0 = toStateVector(state);
    const xRef = buildXref(refs, this.vehicle.wheelbase);

    const Qbar = buildQbar(this.cfg, N);
    const Rbar = buildRbar(this.cfg, N);

    const H = addMatrices(mulAtDA(Gamma, Qbar), Rbar, 1e-3);
    const error = subVec(mulMatVec(Phi, x0), xRef);
    const f = mulAtB(Gamma, mulMatVec(Qbar, error));

    const bounds = buildBounds(this.cfg, N);

    const qp = solveQP(
      {
        H,
        f,
        A: identityMatrix(H.length),
        l: bounds.lb,
        u: bounds.ub,
      },
      {
        rho: 0.8,
        alpha: 1.6,
        max_iter: 150,
        eps_abs: 5e-3,
        eps_rel: 5e-3,
        warm_start_x: this.cfg.warm_start ? this.warmStart : undefined,
      }
    );

    let control = this.lastControl;
    let statusLabel: string = qp.status;
    if (qp.status === 'solved') {
      const u0 = qp.x.slice(0, NU);
      control = {
        steering_rate: clamp(u0[0], -this.cfg.bounds.steering_rate, this.cfg.bounds.steering_rate),
        acceleration: clamp(u0[1], this.cfg.bounds.acceleration.min, this.cfg.bounds.acceleration.max),
      };
      this.lastControl = control;
      this.warmStart = qp.x;
    } else {
      control = fallbackControl(state, refs[0], this.cfg);
      statusLabel = `fallback_${qp.status}`;
      this.lastControl = control;
    }

    const horizon = refs.map((r) => ({
      s: r.s,
      position: r.position,
      heading: r.heading,
      curvature: r.curvature,
    }));

    return {
      control,
      horizon,
      cost: dot(f, qp.x),
      solver_status: statusLabel,
    };
  }
}

// --- Linearization of the single-track model ---

function linearizeSingleTrack(state: MpccState, dt: number, vehicle: Required<MpccVehicle>) {
  const { wheelbase, l_r } = vehicle;
  const v = Math.max(0.05, state.v);
  const delta = state.delta;
  const psi = state.psi;
  const ratio = l_r / wheelbase;
  const tanDelta = Math.tan(delta);
  const beta = Math.atan(ratio * tanDelta);
  const dbetaDDelta = (ratio / (1 + (ratio * tanDelta) ** 2)) * (1 / (Math.cos(delta) ** 2));
  const psiBeta = psi + beta;

  const A = zeros(NX, NX);
  A[0][2] = -v * Math.sin(psiBeta);
  A[0][3] = Math.cos(psiBeta);
  A[0][4] = -v * Math.sin(psiBeta) * dbetaDDelta;

  A[1][2] = v * Math.cos(psiBeta);
  A[1][3] = Math.sin(psiBeta);
  A[1][4] = v * Math.cos(psiBeta) * dbetaDDelta;

  A[2][3] = (1 / l_r) * Math.sin(beta);
  A[2][4] = (v / l_r) * Math.cos(beta) * dbetaDDelta;

  const B = zeros(NX, NU);
  B[3][1] = 1; // acceleration directly affects v
  B[4][0] = 1; // steering rate directly affects delta

  const Ad = identityMatrix(NX);
  for (let r = 0; r < NX; r += 1) {
    for (let c = 0; c < NX; c += 1) {
      Ad[r][c] += dt * A[r][c];
    }
  }
  const Bd = zeros(NX, NU);
  for (let r = 0; r < NX; r += 1) {
    for (let c = 0; c < NU; c += 1) {
      Bd[r][c] = dt * B[r][c];
    }
  }

  return { Ad, Bd };
}

// --- MPC matrices ---

function buildPhi(Ad: Float64Array[], N: number): Float64Array[] {
  const Phi = zeros(N * NX, NX);
  let Ak = identityMatrix(NX);
  for (let k = 0; k < N; k += 1) {
    if (k === 0) {
      Ak = Ad;
    } else {
      Ak = multiply(Ad, Ak);
    }
    copyBlock(Phi, Ak, k * NX, 0);
  }
  return Phi;
}

function buildGamma(Ad: Float64Array[], Bd: Float64Array[], N: number): Float64Array[] {
  const Gamma = zeros(N * NX, N * NU);
  const AdPowers: Float64Array[][] = [];
  AdPowers[0] = identityMatrix(NX);
  for (let p = 1; p <= N; p += 1) {
    AdPowers[p] = multiply(Ad, AdPowers[p - 1]);
  }
  for (let k = 0; k < N; k += 1) {
    for (let j = 0; j <= k; j += 1) {
      const power = k - j;
      const Akj = AdPowers[power];
      const block = multiply(Akj, Bd);
      copyBlock(Gamma, block, k * NX, j * NU);
    }
  }
  return Gamma;
}

function buildQbar(cfg: MpccConfig, N: number): Float64Array[] {
  const qDiag = [
    cfg.weights.lateral,
    cfg.weights.lateral,
    cfg.weights.heading,
    Math.max(cfg.weights.progress, 0.5),
    cfg.weights.curvature,
  ];
  const Q = diag(qDiag);
  const Qbar = zeros(N * NX, N * NX);
  for (let k = 0; k < N; k += 1) {
    copyBlock(Qbar, Q, k * NX, k * NX);
  }
  return Qbar;
}

function buildRbar(cfg: MpccConfig, N: number): Float64Array[] {
  const rDiag = [Math.max(cfg.weights.rate, 0.1), Math.max(cfg.weights.input, 0.1)];
  const R = diag(rDiag);
  const Rbar = zeros(N * NU, N * NU);
  for (let k = 0; k < N; k += 1) {
    copyBlock(Rbar, R, k * NU, k * NU);
  }
  // small smoothing on steering rate changes
  const smooth = cfg.weights.rate * 0.5;
  for (let k = 1; k < N; k += 1) {
    const idx = k * NU;
    Rbar[idx][idx] += smooth;
    Rbar[idx - NU][idx - NU] += smooth;
    Rbar[idx][idx - NU] -= smooth;
    Rbar[idx - NU][idx] -= smooth;
  }
  return Rbar;
}

function buildBounds(cfg: MpccConfig, N: number) {
  const nU = N * NU;
  const lb = new Float64Array(nU);
  const ub = new Float64Array(nU);
  for (let k = 0; k < N; k += 1) {
    const idx = k * NU;
    lb[idx + 0] = -Math.abs(cfg.bounds.steering_rate);
    ub[idx + 0] = Math.abs(cfg.bounds.steering_rate);
    lb[idx + 1] = cfg.bounds.acceleration.min;
    ub[idx + 1] = cfg.bounds.acceleration.max;
  }
  return { lb, ub };
}

function buildXref(refs: Reference[], wheelbase: number): Float64Array {
  const xRef = new Float64Array(refs.length * NX);
  refs.forEach((ref, k) => {
    const base = k * NX;
    const deltaRef = Math.atan(ref.curvature * wheelbase);
    xRef[base + 0] = ref.position.x;
    xRef[base + 1] = ref.position.y;
    xRef[base + 2] = ref.heading;
    xRef[base + 3] = ref.speed;
    xRef[base + 4] = deltaRef;
  });
  return xRef;
}

function buildReferences(track: TrackMap, s0: number, speed: number, dt: number, N: number, wheelbase: number): Reference[] {
  const refs: Reference[] = [];
  let s = s0;
  for (let k = 0; k < N; k += 1) {
    const sample = sampleAtS(track, s);
    refs.push({
      s: sample.s,
      position: sample.center,
      heading: Math.atan2(sample.tangent.y, sample.tangent.x),
      curvature: sample.curvature,
      speed,
    });
    const ds = Math.max(speed, 0.2) * dt;
    if (track.is_loop) {
      const length = track.length || (track.samples.length ? track.samples[track.samples.length - 1].s : 0);
      s = wrapArcLength(s + ds, length);
    } else {
      s = Math.min(track.length, s + ds);
    }
  }
  return refs;
}

// --- Utilities ---

type Reference = {
  s: number;
  position: { x: number; y: number };
  heading: number;
  curvature: number;
  speed: number;
};

function wrapArcLength(s: number, length: number): number {
  if (!(length > 0)) return s;
  const wrapped = s % length;
  return wrapped < 0 ? wrapped + length : wrapped;
}

function normalizeVehicle(vehicle?: MpccVehicle): Required<MpccVehicle> {
  const wheelbase = Math.max(vehicle?.wheelbase ?? 0.3, 0.05);
  const l_r = Math.max(vehicle?.l_r ?? wheelbase / 2, 1e-3);
  return { wheelbase, l_r };
}

function toStateVector(s: MpccState): Float64Array {
  return new Float64Array([s.x, s.y, s.psi, s.v, s.delta]);
}

function identityMatrix(n: number): Float64Array[] {
  const I = zeros(n, n);
  for (let i = 0; i < n; i += 1) I[i][i] = 1;
  return I;
}

function zeros(r: number, c: number): Float64Array[] {
  return Array.from({ length: r }, () => new Float64Array(c));
}

function diag(diagonal: number[]): Float64Array[] {
  const n = diagonal.length;
  const M = zeros(n, n);
  for (let i = 0; i < n; i += 1) M[i][i] = diagonal[i];
  return M;
}

function copyBlock(target: Float64Array[], block: Float64Array[], row: number, col: number) {
  for (let i = 0; i < block.length; i += 1) {
    for (let j = 0; j < block[0].length; j += 1) {
      target[row + i][col + j] = block[i][j];
    }
  }
}

function multiply(A: Float64Array[], B: Float64Array[]): Float64Array[] {
  const rows = A.length;
  const cols = B[0].length;
  const inner = B.length;
  const C = zeros(rows, cols);
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      let sum = 0;
      for (let k = 0; k < inner; k += 1) {
        sum += A[i][k] * B[k][j];
      }
      C[i][j] = sum;
    }
  }
  return C;
}

function mulMatVec(A: Float64Array[], x: Float64Array): Float64Array {
  const out = new Float64Array(A.length);
  for (let i = 0; i < A.length; i += 1) {
    let sum = 0;
    for (let j = 0; j < A[0].length; j += 1) {
      sum += A[i][j] * (x[j] ?? 0);
    }
    out[i] = sum;
  }
  return out;
}

function subVec(a: Float64Array, b: Float64Array): Float64Array {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = a[i] - b[i];
  return out;
}

function mulAtDA(A: Float64Array[], D: Float64Array[]): Float64Array[] {
  const rowsA = A.length;
  const colsA = A[0].length;
  const H = zeros(colsA, colsA);
  for (let i = 0; i < colsA; i += 1) {
    for (let j = 0; j < colsA; j += 1) {
      let sum = 0;
      for (let k = 0; k < rowsA; k += 1) {
        sum += A[k][i] * D[k][k] * A[k][j];
      }
      H[i][j] = sum;
    }
  }
  return H;
}

function mulAtB(A: Float64Array[], b: Float64Array): Float64Array {
  const cols = A[0].length;
  const out = new Float64Array(cols);
  for (let j = 0; j < cols; j += 1) {
    let sum = 0;
    for (let i = 0; i < A.length; i += 1) {
      sum += A[i][j] * b[i];
    }
    out[j] = sum;
  }
  return out;
}

function addMatrices(A: Float64Array[], B: Float64Array[], reg = 0): Float64Array[] {
  const C = zeros(A.length, A[0].length);
  for (let i = 0; i < A.length; i += 1) {
    for (let j = 0; j < A[0].length; j += 1) {
      C[i][j] = A[i][j] + B[i][j];
      if (i === j) C[i][j] += reg;
    }
  }
  return C;
}

function dot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function targetSpeed(currentSpeed: number, curvature: number): number {
  const base = clamp(currentSpeed + 1.0, 2, 10);
  const maxLatAcc = 6.0;
  const limit = Math.abs(curvature) > 1e-4 ? Math.sqrt(maxLatAcc / Math.abs(curvature)) : base;
  return clamp(Math.min(base, limit), 1.5, 12);
}

function fallbackControl(state: MpccState, ref: Reference, cfg: MpccConfig): MpccControl {
  const headingErr = wrapAngle(ref.heading - state.psi);
  const steerRate = clamp(2.0 * headingErr - 0.6 * state.delta, -cfg.bounds.steering_rate, cfg.bounds.steering_rate);

  const speedErr = ref.speed - state.v;
  const accelRaw = speedErr;
  const accel = clamp(accelRaw, cfg.bounds.acceleration.min, cfg.bounds.acceleration.max);

  return { steering_rate: steerRate, acceleration: accel };
}

function wrapAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
