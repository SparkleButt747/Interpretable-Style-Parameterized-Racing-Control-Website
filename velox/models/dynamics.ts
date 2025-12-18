import {
  stAccelerationConstraint,
  stSteeringAngleConstraint,
  stSteeringRateConstraint,
} from './constraints';
import { SingleTrackParameters } from './types';

const kGravity = 9.81;

export function vehicleDynamicsST(x: number[], uInit: number[], p: SingleTrackParameters, _dt = 0.01): number[] {
  if (x.length !== 5 || uInit.length !== 2) {
    throw new Error('vehicle_dynamics_st: expected x.size()==5 and u_init.size()==2');
  }

  const L = Math.max(p.l_f + p.l_r, 1e-6);
  const steerRate = stSteeringRateConstraint(uInit[0], p);
  const accelCommand = stAccelerationConstraint(uInit[1], p);
  const deltaRaw = stSteeringAngleConstraint(x[4], p);
  const v = x[3];
  const psi = x[2];

  const mu = Number.isFinite(p.mu) && p.mu! > 0
    ? (p.mu as number)
    : (p.lat_accel_max > 0 ? p.lat_accel_max / kGravity : 0.8);
  const accelBudget = Math.max(mu * kGravity, 0);

  const vAbs = Math.abs(v);
  let delta = deltaRaw;
  if (accelBudget > 0 && vAbs > 1e-6) {
    const maxDeltaForLat = Math.atan((accelBudget * L) / (vAbs * vAbs));
    delta = clamp(deltaRaw, -maxDeltaForLat, maxDeltaForLat);
  }

  const beta = Math.atan((p.l_r / L) * Math.tan(delta));
  const curvature = Math.sin(beta) / L;
  const lateralAccel = v * v * curvature;
  const accelLimit = Math.sqrt(Math.max(0, accelBudget * accelBudget - lateralAccel * lateralAccel));
  const accel = clamp(accelCommand, -accelLimit, accelLimit);

  const xdot = v * Math.cos(psi + beta);
  const ydot = v * Math.sin(psi + beta);
  const psidot = v * curvature;
  const vdot = accel;
  const deltaDot = steerRate;

  return [xdot, ydot, psidot, vdot, deltaDot];
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, min), max);
}
