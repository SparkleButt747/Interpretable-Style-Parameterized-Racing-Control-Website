import { loadTracks } from '../app/playground/loadTracks';
import { toMpccTrack, projectToTrack, sampleAtS } from '../controllers/mpcc/track';
import { createMpccSolver } from '../controllers/mpcc/solver';
import type { MpccConfig, MpccState } from '../controllers/mpcc/types';

const defaultMpccConfig: MpccConfig = {
  horizon_steps: 32,
  dt: 0.05,
  weights: {
    progress: 6,
    lateral: 8,
    heading: 4,
    curvature: 0.6,
    input: 0.2,
    rate: 0.05,
    slack: 10,
  },
  bounds: {
    steering_rate: 3.5,
    acceleration: { min: -6, max: 4 },
    slack: 2,
  },
  vehicle: { wheelbase: 0.3, l_r: 0.17 },
  warm_start: true,
};

async function projectionSweep(trackId: string) {
  const tracks = await loadTracks();
  const trackDef = tracks.find((t) => t.id === trackId);
  if (!trackDef) throw new Error(`Track ${trackId} not found`);
  const mpccTrack = toMpccTrack(trackDef);
  if (!mpccTrack) throw new Error(`Track ${trackId} missing mpcc map`);

  const length = mpccTrack.length;
  const step = 0.5;
  let prevProj = projectToTrack(mpccTrack, sampleAtS(mpccTrack, 0).center, 0, 0);
  let worstBack = 0;
  let backCount = 0;
  let maxJump = 0;
  for (let s = step; s <= length; s += step) {
    const sample = sampleAtS(mpccTrack, s);
    const heading = Math.atan2(sample.tangent.y, sample.tangent.x);
    const proj = projectToTrack(mpccTrack, sample.center, heading, prevProj.s);
    const delta = proj.s - prevProj.s;
    if (delta < worstBack) {
      worstBack = delta;
      backCount += 1;
    }
    if (delta > maxJump) maxJump = delta;
    prevProj = proj;
  }

  console.log(`Projection sweep (${trackId}) length=${length.toFixed(2)}m`);
  console.log(`  worst backward step: ${worstBack.toFixed(3)} m (count ${backCount})`);
  console.log(`  max forward step:    ${maxJump.toFixed(3)} m`);
}

async function projectionStress(trackId: string) {
  const tracks = await loadTracks();
  const trackDef = tracks.find((t) => t.id === trackId);
  if (!trackDef) throw new Error(`Track ${trackId} not found`);
  const mpccTrack = toMpccTrack(trackDef);
  if (!mpccTrack) throw new Error(`Track ${trackId} missing mpcc map`);

  const candidates = mpccTrack.samples
    .slice()
    .sort((a, b) => Math.abs(b.curvature) - Math.abs(a.curvature))
    .slice(0, 20);

  const laterals = [-4, -3, -2, -1, -0.5, 0, 0.5, 1, 2, 3, 4];
  const headings = [
    -(5 * Math.PI) / 6,
    -(2 * Math.PI) / 3,
    -Math.PI / 2,
    -Math.PI / 3,
    -Math.PI / 6,
    0,
    Math.PI / 6,
    Math.PI / 3,
    Math.PI / 2,
    (2 * Math.PI) / 3,
    (5 * Math.PI) / 6,
  ];

  let worst = { delta: 0, baseS: 0, lateral: 0, heading: 0, projS: 0 };
  let worstModerate = { delta: 0, baseS: 0, lateral: 0, heading: 0, projS: 0 };

  candidates.forEach((base) => {
    const baseHeading = Math.atan2(base.tangent.y, base.tangent.x);
    laterals.forEach((lat) => {
      const pos = {
        x: base.center.x + lat * base.normal.x,
        y: base.center.y + lat * base.normal.y,
      };
      headings.forEach((dh) => {
        const heading = baseHeading + dh;
        const proj = projectToTrack(mpccTrack, pos, heading, base.s);
        const delta = proj.s - base.s;
        if (delta < worst.delta) {
          worst = { delta, baseS: base.s, lateral: lat, heading: dh, projS: proj.s };
        }
        if (Math.abs(dh) <= Math.PI / 4 && Math.abs(lat) <= 2 && delta < worstModerate.delta) {
          worstModerate = { delta, baseS: base.s, lateral: lat, heading: dh, projS: proj.s };
        }
      });
    });
  });

  console.log(`Projection stress (${trackId}) on high-curvature samples:`);
  console.log(
    `  worst delta s: ${worst.delta.toFixed(3)} m (base s ${worst.baseS.toFixed(
      2
    )} -> proj ${worst.projS.toFixed(2)}, lateral ${worst.lateral} m, heading offset ${(
      (worst.heading * 180) /
      Math.PI
    ).toFixed(1)} deg)`
  );
  console.log(
    `  worst (heading<=45deg, |lat|<=2m): ${worstModerate.delta.toFixed(3)} m (base s ${worstModerate.baseS.toFixed(
      2
    )} -> proj ${worstModerate.projS.toFixed(2)}, lateral ${worstModerate.lateral} m, heading offset ${(
      (worstModerate.heading * 180) /
      Math.PI
    ).toFixed(1)} deg)`
  );
}

async function solverSweep(trackId: string, cfg: MpccConfig) {
  const tracks = await loadTracks();
  const trackDef = tracks.find((t) => t.id === trackId);
  if (!trackDef) throw new Error(`Track ${trackId} not found`);
  const mpccTrack = toMpccTrack(trackDef);
  if (!mpccTrack) throw new Error(`Track ${trackId} missing mpcc map`);

  const solver = await createMpccSolver(cfg, mpccTrack);
  const length = mpccTrack.length;
  const step = 1.0;

  let flips = 0;
  let examples: Array<{ s: number; horizon: number[]; status?: string }> = [];

  for (let s = 0; s <= length; s += step) {
    const sample = sampleAtS(mpccTrack, s);
    const heading = Math.atan2(sample.tangent.y, sample.tangent.x);
    const state: MpccState = {
      x: sample.center.x,
      y: sample.center.y,
      psi: heading,
      v: 6,
      delta: Math.atan(sample.curvature * (cfg.vehicle?.wheelbase ?? 0.3)),
    };
    const result = solver.step(state, 0);
    const seq = result.horizon.map((h) => h.s);
    const nonMono = seq.some((val, idx) => idx > 0 && val < seq[idx - 1] - 1e-2);
    const behind = seq[0] < s - 0.5;
    if (nonMono || behind) {
      flips += 1;
      if (examples.length < 5) {
        examples.push({ s, horizon: seq.slice(0, 6), status: result.solver_status });
      }
    }
  }

  console.log(`Solver sweep (${trackId}) horizon checks: step ${step}m`);
  console.log(`  non-monotonic or behind cases: ${flips}`);
  examples.forEach((ex, idx) => {
    console.log(`  example ${idx + 1} at s=${ex.s.toFixed(2)} status=${ex.status}`);
    console.log(`    horizon s: ${ex.horizon.map((v) => v.toFixed(2)).join(', ')}`);
  });
}

async function main() {
  const trackId = 'hairpins_increasing_difficulty';
  await projectionSweep(trackId);
  await projectionStress(trackId);
  await solverSweep(trackId, defaultMpccConfig);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
