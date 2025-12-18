// Minimal single-track bicycle model types.

export interface SingleTrackSteeringLimits {
  min: number;
  max: number;
  rate_min: number;
  rate_max: number;
}

export interface SingleTrackAccelerationLimits {
  min: number;
  max: number;
  /** Optional jerk limit on longitudinal acceleration [m/s^3]. */
  jerk_max?: number;
}

export interface SingleTrackParameters {
  l_f: number;
  l_r: number;
  m: number;
  I_z: number;
  lat_accel_max: number;
  /** Optional friction coefficient used for the combined acceleration limit. */
  mu?: number;
  steering: SingleTrackSteeringLimits;
  accel: SingleTrackAccelerationLimits;
}

export type ModelParameters = SingleTrackParameters;

export function isSingleTrackParameters(_params: ModelParameters): _params is SingleTrackParameters {
  return true;
}
