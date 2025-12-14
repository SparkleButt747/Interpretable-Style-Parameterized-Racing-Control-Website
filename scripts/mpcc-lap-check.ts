import { loadTracks } from '../app/playground/loadTracks';
import { toMpccTrack, projectToTrack, sampleAtS } from '../controllers/mpcc/track';
import { createMpccSolver } from '../controllers/mpcc/solver';
import type { MpccConfig, MpccState } from '../controllers/mpcc/types';

const cfg: MpccConfig = {
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

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

async function runLap(trackId: string) {
  const tracks = await loadTracks();
  const trackDef = tracks.find((t) => t.id === trackId);
  if (!trackDef) throw new Error(`Track ${trackId} not found`);
  const mpccTrack = toMpccTrack(trackDef);
  if (!mpccTrack) throw new Error(`Track ${trackId} missing mpcc map`);

  const solver = await createMpccSolver(cfg, mpccTrack);

  const startPose = trackDef.metadata.startPose ?? {
    position: sampleAtS(mpccTrack, 0).center,
    yaw: Math.atan2(sampleAtS(mpccTrack, 0).tangent.y, sampleAtS(mpccTrack, 0).tangent.x),
  };

  const state: MpccState = {
    x: startPose.position.x,
    y: startPose.position.y,
    psi: startPose.yaw,
    v: 2.0,
    delta: 0,
  };

  let t = 0;
  let lastS = 0;
  const maxT = 500; // seconds cap
  let success = false;

  while (t < maxT) {
    const proj = projectToTrack(mpccTrack, { x: state.x, y: state.y }, state.psi, lastS);
    const s = proj.s;
    if (s + 1 >= mpccTrack.length) {
      success = true;
      console.log(`Lap complete at t=${t.toFixed(2)}s, s=${s.toFixed(2)} / ${mpccTrack.length.toFixed(2)}`);
      break;
    }
    if (s < lastS - 1e-3) {
      console.log(`Regression detected: s dropped from ${lastS.toFixed(3)} to ${s.toFixed(3)} at t=${t.toFixed(2)}s`);
      break;
    }

    const result = solver.step(state, t);
    const u = result.control;

    // simple bicycle integration
    const dt = cfg.dt;
    state.delta = clamp(state.delta + u.steering_rate * dt, -0.7, 0.7);
    state.v = clamp(state.v + u.acceleration * dt, 0, 15);
    state.psi += (state.v / cfg.vehicle!.wheelbase) * Math.tan(state.delta) * dt;
    state.x += state.v * Math.cos(state.psi) * dt;
    state.y += state.v * Math.sin(state.psi) * dt;

    t += dt;
    lastS = s;

    if (Math.abs(t % 5) < 1e-6) {
      console.log(
        `t=${t.toFixed(1)}s, s=${s.toFixed(1)} / ${mpccTrack.length.toFixed(
          1
        )}, v=${state.v.toFixed(2)} m/s, pos=(${state.x.toFixed(1)},${state.y.toFixed(1)}), psi=${state.psi.toFixed(2)}`
      );
    }
  }

  if (!success) {
    console.log(`Failed to finish lap. Final s=${lastS.toFixed(2)} / ${mpccTrack.length.toFixed(2)}, t=${t.toFixed(2)}s`);
  }
}

async function main() {
  await runLap('hairpins_increasing_difficulty');
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
