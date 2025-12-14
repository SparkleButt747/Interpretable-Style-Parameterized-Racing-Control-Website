import { LongitudinalParameters, SteeringParameters, SingleTrackParameters } from './types';

export function steeringConstraints(angle: number, rate: number, params: SteeringParameters): number {
  let steeringVelocity = rate;
  if ((angle <= params.min && steeringVelocity <= 0) || (angle >= params.max && steeringVelocity >= 0)) {
    steeringVelocity = 0;
  } else if (steeringVelocity <= params.v_min) {
    steeringVelocity = params.v_min;
  } else if (steeringVelocity >= params.v_max) {
    steeringVelocity = params.v_max;
  }
  return steeringVelocity;
}

export function kappaDotDotConstraints(kappaDotDot: number, kappaDot: number, params: SteeringParameters): number {
  if ((kappaDot < -params.kappa_dot_max && kappaDotDot < 0) || (kappaDot > params.kappa_dot_max && kappaDotDot > 0)) {
    return 0;
  }
  if (Math.abs(kappaDotDot) >= params.kappa_dot_dot_max) {
    return params.kappa_dot_dot_max;
  }
  return kappaDotDot;
}

export function accelerationConstraints(velocity: number, acceleration: number, params: LongitudinalParameters): number {
  let posLimit: number;
  if (velocity > params.v_switch && params.v_switch > 0) {
    posLimit = params.a_max * params.v_switch / velocity;
  } else {
    posLimit = params.a_max;
  }

  if ((velocity <= params.v_min && acceleration <= 0) || (velocity >= params.v_max && acceleration >= 0)) {
    acceleration = 0;
  } else if (acceleration <= -params.a_max) {
    acceleration = -params.a_max;
  } else if (acceleration >= posLimit) {
    acceleration = posLimit;
  }

  return acceleration;
}

export function jerkDotConstraints(jerkDot: number, jerk: number, params: LongitudinalParameters): number {
  if ((jerkDot < 0 && jerk <= -params.j_max) || (jerkDot > 0 && jerk >= params.j_max)) {
    return 0;
  }
  if (Math.abs(jerkDot) >= params.j_dot_max) {
    return params.j_dot_max;
  }
  return jerkDot;
}

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
