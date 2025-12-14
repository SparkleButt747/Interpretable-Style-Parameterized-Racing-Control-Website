import { choleskyDecompose, choleskySolve } from './linear-algebra';

export type QpMatrix = Float64Array[];

export interface QpProblem {
  H: QpMatrix;
  f: Float64Array;
  A: QpMatrix;
  l: Float64Array;
  u: Float64Array;
}

export interface QpSolution {
  x: Float64Array;
  status: 'solved' | 'max_iter' | 'infeasible';
  iterations: number;
  primal_res: number;
  dual_res: number;
}

export interface QpOptions {
  rho?: number;
  alpha?: number;
  max_iter?: number;
  eps_abs?: number;
  eps_rel?: number;
  reg?: number;
  warm_start_x?: Float64Array;
  warm_start_z?: Float64Array;
}

type QpRequired = Required<Omit<QpOptions, 'warm_start_x' | 'warm_start_z'>> &
  Pick<QpOptions, 'warm_start_x' | 'warm_start_z'>;

const defaultOpts: QpRequired = {
  rho: 0.2,
  alpha: 1.6,
  max_iter: 120,
  eps_abs: 1e-3,
  eps_rel: 1e-3,
  reg: 1e-5,
  warm_start_x: undefined,
  warm_start_z: undefined,
};

/**
 * Small dense ADMM QP solver (dependency-free).
 * Solves: minimize 0.5 x' H x + f' x s.t. l <= A x <= u.
 */
export function solveQP(problem: QpProblem, opts: QpOptions = {}): QpSolution {
  const { H, f, A, l, u } = problem;
  const n = f.length;
  const m = l.length;
  const cfg = { ...defaultOpts, ...opts };

  const x = new Float64Array(n);
  const z = new Float64Array(m);
  const y = new Float64Array(m);
  const Ax = new Float64Array(m);
  const AxHat = new Float64Array(m);
  const tmp = new Float64Array(n);

  // Factorization of (H + rho A'A + reg I)
  const M: QpMatrix = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      let sum = H[i][j];
      for (let k = 0; k < m; k += 1) {
        sum += cfg.rho * A[k][i] * A[k][j];
      }
      if (i === j) sum += cfg.reg;
      M[i][j] = sum;
    }
  }
  const L = choleskyDecompose(M);
  if (!L) {
    return { x, status: 'infeasible', iterations: 0, primal_res: Infinity, dual_res: Infinity };
  }

  // optional warm start
  if (cfg.warm_start_x && cfg.warm_start_x.length === n) {
    for (let i = 0; i < n; i += 1) x[i] = cfg.warm_start_x[i];
  }
  if (cfg.warm_start_z && cfg.warm_start_z.length === m) {
    for (let i = 0; i < m; i += 1) z[i] = cfg.warm_start_z[i];
  }

  let primalRes = Infinity;
  let dualRes = Infinity;
  let status: QpSolution['status'] = 'max_iter';

  for (let iter = 0; iter < cfg.max_iter; iter += 1) {
    // x-update: solve (H + rho A'A) x = -f + A'(rho(z - y))
    for (let i = 0; i < n; i += 1) {
      let rhs = -f[i];
      for (let k = 0; k < m; k += 1) rhs += A[k][i] * cfg.rho * (z[k] - y[k]);
      tmp[i] = rhs;
    }
    choleskySolve(L, tmp, x);

    // Ax
    for (let i = 0; i < m; i += 1) {
      let sum = 0;
      for (let j = 0; j < n; j += 1) sum += A[i][j] * x[j];
      Ax[i] = sum;
    }

    // z / y update with relaxation
    for (let i = 0; i < m; i += 1) {
      AxHat[i] = cfg.alpha * Ax[i] + (1 - cfg.alpha) * AxHat[i];
      const v = AxHat[i] + y[i];
      const projected = Math.min(Math.max(v, l[i]), u[i]);
      z[i] = projected;
      y[i] = y[i] + AxHat[i] - projected;
    }

    // residuals
    primalRes = 0;
    dualRes = 0;
    for (let i = 0; i < m; i += 1) {
      const r = Ax[i] - z[i];
      primalRes = Math.max(primalRes, Math.abs(r));
      let dualTerm = 0;
      for (let j = 0; j < n; j += 1) dualTerm += A[i][j] * (z[i] - AxHat[i]);
      dualRes = Math.max(dualRes, Math.abs(cfg.rho * dualTerm));
    }

    const epsPri = Math.sqrt(m) * cfg.eps_abs + cfg.eps_rel * Math.max(normInf(Ax), normInf(z));
    const epsDual = Math.sqrt(n) * cfg.eps_abs + cfg.eps_rel * normInf(f);

    if (primalRes <= epsPri && dualRes <= epsDual) {
      status = 'solved';
      return { x, status, iterations: iter + 1, primal_res: primalRes, dual_res: dualRes };
    }
  }

  return { x, status, iterations: cfg.max_iter, primal_res: primalRes, dual_res: dualRes };
}

function normInf(v: Float64Array): number {
  let m = 0;
  for (let i = 0; i < v.length; i += 1) m = Math.max(m, Math.abs(v[i]));
  return m;
}
