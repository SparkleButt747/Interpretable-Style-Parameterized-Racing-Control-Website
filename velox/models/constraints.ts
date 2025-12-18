import { SingleTrackParameters } from './types';

export function stSteeringRateConstraint(rate: number, params: SingleTrackParameters): number {
  return clamp(rate, params.steering.rate_min, params.steering.rate_max);
}

export function stSteeringAngleConstraint(angle: number, params: SingleTrackParameters): number {
  return clamp(angle, params.steering.min, params.steering.max);
}

export function stAccelerationConstraint(accel: number, params: SingleTrackParameters): number {
  return clamp(accel, params.accel.min, params.accel.max);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, min), max);
}
