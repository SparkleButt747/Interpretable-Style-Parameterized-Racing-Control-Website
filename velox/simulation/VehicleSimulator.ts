import { LowSpeedSafety } from './LowSpeedSafety';
import { ModelParameters, isSingleTrackParameters } from '../models/types';
import { stAccelerationConstraint, stSteeringAngleConstraint, stSteeringRateConstraint } from '../models/constraints';

export interface ModelInterface {
  init: (state: number[], params: ModelParameters) => number[];
  dynamics: (state: number[], control: number[], params: ModelParameters, dt: number) => number[];
  speed: (state: number[], params: ModelParameters) => number;
}

export class VehicleSimulator {
  private state: number[] = [];
  private ready = false;
  private lastControl: [number, number] = [0, 0];

  constructor(
    private model: ModelInterface,
    private params: ModelParameters,
    private dt: number,
    private safety: LowSpeedSafety
  ) {
    if (!this.model || !this.model.init || !this.model.dynamics || !this.model.speed) {
      throw new Error('VehicleSimulator requires a valid ModelInterface');
    }
    this.setDt(dt);
    this.safety.reset();
  }

  reset(initial: number[]): void {
    this.safety.reset();
    this.state = this.model.init(initial, this.params);
    this.applySafety(this.state, true);
    this.lastControl = [0, 0];
    this.ready = true;
  }

  setDt(dt: number): void {
    if (!(dt > 0)) {
      throw new Error('VehicleSimulator timestep must be positive');
    }
    this.dt = dt;
  }

  dtSeconds(): number {
    return this.dt;
  }

  speed(): number {
    this.ensureReady();
    return this.model.speed(this.state, this.params);
  }

  currentState(): number[] {
    this.ensureReady();
    return this.state;
  }

  step(control: number[]): number[] {
    this.ensureReady();
    if (control.length !== 2) {
      throw new Error('VehicleSimulator control must contain steering rate and acceleration');
    }
    const dt = this.dt;
    const previous = this.state.slice();

    if (isSingleTrackParameters(this.params)) {
      this.state = this.stepKinematic(previous, control, dt);
    } else {
      const [k1, state1] = this.dynamics(previous, control, true);
      this.state = state1;

      const k2State = this.addScaled(this.state, 0.5 * dt, k1);
      const [k2] = this.dynamics(k2State, control, false);

      const k3State = this.addScaled(this.state, 0.5 * dt, k2);
      const [k3] = this.dynamics(k3State, control, false);

      const k4State = this.addScaled(this.state, dt, k3);
      const [k4] = this.dynamics(k4State, control, false);

      if ([k1, k2, k3, k4].some((v) => v.length !== this.state.length)) {
        throw new Error('VehicleSimulator dynamics returned mismatched state dimension');
      }

      for (let i = 0; i < this.state.length; i += 1) {
        this.state[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
      }
    }

    const longIndex = this.safety.longitudinalIndex();
    if (longIndex !== undefined) {
      const idx = longIndex;
      if (idx < previous.length && idx < this.state.length) {
        const prevLong = previous[idx];
        const currLong = this.state[idx];
        if (prevLong >= 0 && currLong < 0) {
          this.state[idx] = 0;
        }
      }
    }

    this.applySafety(this.state, true);
    return this.state;
  }

  safetySystem(): LowSpeedSafety {
    return this.safety;
  }

  private ensureReady(): void {
    if (!this.ready) {
      throw new Error('VehicleSimulator has not been initialised; call reset() first');
    }
  }

  private addScaled(base: number[], scale: number, delta: number[]): number[] {
    if (base.length !== delta.length) {
      throw new Error('VehicleSimulator::add_scaled size mismatch');
    }
    const result = new Array<number>(base.length);
    for (let i = 0; i < base.length; i += 1) {
      result[i] = base[i] + scale * delta[i];
    }
    return result;
  }

  private dynamics(state: number[], control: number[], updateLatch: boolean): [number[], number[]] {
    const sanitized = state.slice();
    this.applySafety(sanitized, updateLatch);
    const rhs = this.model.dynamics(sanitized, control, this.params, this.dt);
    return [rhs, sanitized];
  }

  private stepKinematic(previous: number[], control: number[], dt: number): number[] {
    const state = previous.slice();
    this.applySafety(state, true);
    const limitedControl = this.clampKinematicControl(state, control, dt);
    const rhs = this.model.dynamics(state, limitedControl, this.params, dt);
    if (rhs.length !== state.length) {
      throw new Error('VehicleSimulator dynamics returned mismatched state dimension');
    }
    const next = new Array<number>(state.length);
    for (let i = 0; i < state.length; i += 1) {
      next[i] = state[i] + dt * rhs[i];
    }
    this.applySafety(next, true);
    this.lastControl = limitedControl;
    return next;
  }

  private clampKinematicControl(state: number[], control: number[], dt: number): [number, number] {
    if (!isSingleTrackParameters(this.params)) {
      return [control[0] ?? 0, control[1] ?? 0];
    }
    const params = this.params;
    const rawRate = control[0] ?? 0;
    const rawAccel = control[1] ?? 0;
    const rate = stSteeringRateConstraint(rawRate, params);
    const accelBounds = stAccelerationConstraint(rawAccel, params);
    const delta = stSteeringAngleConstraint(state[4] ?? 0, params);
    state[4] = delta;

    let accel = accelBounds;
    if (params.accel.jerk_max && params.accel.jerk_max > 0 && dt > 0) {
      const maxDelta = params.accel.jerk_max * dt;
      const prevAccel = this.lastControl[1] ?? 0;
      accel = clamp(accel, prevAccel - maxDelta, prevAccel + maxDelta);
    }

    const L = Math.max(params.l_f + params.l_r, 1e-6);
    const beta = Math.atan((params.l_r / L) * Math.tan(delta));
    const curvature = Math.sin(beta) / L;
    const v = state[3] ?? 0;
    const lateralAccel = v * v * curvature;
    const mu = Number.isFinite(params.mu) && params.mu! > 0
      ? (params.mu as number)
      : (params.lat_accel_max > 0 ? params.lat_accel_max / 9.81 : 0.8);
    const accelBudget = Math.max(mu * 9.81, 0);
    const accelLimit = Math.sqrt(Math.max(0, accelBudget * accelBudget - lateralAccel * lateralAccel));
    accel = clamp(accel, -accelLimit, accelLimit);

    if (accelBudget > 0 && Math.abs(v) > 1e-6) {
      const maxDeltaForLat = Math.atan((accelBudget * L) / (v * v));
      const clampedDelta = clamp(delta, -maxDeltaForLat, maxDeltaForLat);
      if (clampedDelta !== state[4]) {
        state[4] = clampedDelta;
      }
    }

    return [rate, accel];
  }

  private applySafety(state: number[], updateLatch: boolean): void {
    const speed = this.model.speed(state, this.params);
    this.safety.apply(state, speed, updateLatch);
    if (isSingleTrackParameters(this.params)) {
      const steeringIdx = this.safety.steeringIndex();
      if (steeringIdx !== undefined && steeringIdx >= 0 && steeringIdx < state.length) {
        state[steeringIdx] = stSteeringAngleConstraint(state[steeringIdx], this.params);
        const L = Math.max(this.params.l_f + this.params.l_r, 1e-6);
        const mu = Number.isFinite(this.params.mu) && this.params.mu! > 0
          ? (this.params.mu as number)
          : (this.params.lat_accel_max > 0 ? this.params.lat_accel_max / 9.81 : 0);
        const accelBudget = mu > 0 ? mu * 9.81 : this.params.lat_accel_max;
        if (accelBudget > 0 && Math.abs(speed) > 1e-6) {
          const maxDeltaForLat = Math.atan((accelBudget * L) / (speed * speed));
          state[steeringIdx] = Math.min(Math.max(state[steeringIdx], -maxDeltaForLat), maxDeltaForLat);
        }
      }
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, min), max);
}
