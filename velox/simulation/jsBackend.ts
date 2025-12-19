import { SimulationTelemetryState, SafetyStage } from '../telemetry/index';
import type { BackendSnapshot, SimulationBackend } from './backend';
import { ModelType } from './types';
import { ModelParameters, SingleTrackParameters, isSingleTrackParameters } from '../models/types';
import { VehicleSimulator } from './VehicleSimulator';
import { buildModelInterface } from './modelInterface';
import { LowSpeedSafety, LowSpeedSafetyConfig, LowSpeedIndices } from './LowSpeedSafety';

export interface JsBackendOptions {
  model: ModelType;
  params: ModelParameters;
  lowSpeed: LowSpeedSafetyConfig;
  driftEnabled: boolean;
}

interface TelemetryInputs {
  accel: number;
  steerRate: number;
  lateralAccel: number;
  slipRatios: number[];
  frontSlip: number;
  rearSlip: number;
  beta?: number;
  yawRate?: number;
  frictionUtilization?: number;
}

export class JsSimulationBackend implements SimulationBackend {
  private params: ModelParameters;
  private model: ModelType;
  private safety: LowSpeedSafety;
  private simulator: VehicleSimulator;
  private telemetry = new SimulationTelemetryState();
  private dt = 0.01;
  private simTime = 0;
  private distance = 0;
  private energy = 0;
  private indices: LowSpeedIndices;
  ready: Promise<void> = Promise.resolve();

  constructor(private readonly options: JsBackendOptions) {
    this.params = options.params;
    this.model = options.model;
    this.indices = buildSafetyIndices(options.model, options.params);
    this.safety = new LowSpeedSafety(options.lowSpeed, this.indices);
    this.simulator = new VehicleSimulator(buildModelInterface(options.model), this.params, this.dt, this.safety);
    this.safety.setDriftEnabled(options.driftEnabled);
  }

  reset(initial: number[], dt: number): void {
    this.dt = dt;
    this.indices = buildSafetyIndices(this.options.model, this.params);
    this.safety = new LowSpeedSafety(this.options.lowSpeed, this.indices);
    this.safety.setDriftEnabled(this.options.driftEnabled);
    this.simulator = new VehicleSimulator(buildModelInterface(this.options.model), this.params, dt, this.safety);
    this.simulator.reset(initial);
    this.telemetry = new SimulationTelemetryState();
    this.simTime = 0;
    this.distance = 0;
    this.energy = 0;
    this.updateTelemetry(this.simulator.currentState(), {
      accel: 0,
      steerRate: 0,
      lateralAccel: 0,
      slipRatios: this.computeSlipRatios(this.simulator.currentState(), 0),
      frontSlip: 0,
      rearSlip: 0,
      beta: 0,
      yawRate: 0,
      frictionUtilization: 0,
    });
  }

  step(control: number[], dt: number): void {
    const steerRate = control[0] ?? 0;
    const accel = control[1] ?? 0;
    this.dt = dt ?? this.dt;
    this.simulator.setDt(this.dt);
    this.simulator.step([steerRate, accel]);

    const state = this.simulator.currentState();
    const speed = this.simulator.speed();
    const isStModel = this.model === ModelType.ST || isSingleTrackParameters(this.params);
    let lateralAccel = 0;
    let slipRatios = [0, 0];
    let yawRate = 0;
    let slip = 0;
    let beta = 0;
    let frictionUtilization = 0;

    if (isStModel && isSingleTrackParameters(this.params)) {
      const stParams = this.params;
      const delta = state[this.indices.steeringIndex ?? 4] ?? 0;
      const v = speed;
      const L = Math.max(stParams.l_f + stParams.l_r, 1e-6);
      beta = Math.atan((stParams.l_r / L) * Math.tan(delta));
      yawRate = v * Math.sin(beta) / L;
      lateralAccel = v * v * Math.sin(beta) / L;
      slip = beta;
      const vLong = v * Math.cos(beta);
      const vLat = v * Math.sin(beta);
      const frontSlip = Math.atan2(vLat + stParams.l_f * yawRate, Math.max(Math.abs(vLong), 1e-6)) - delta;
      const rearSlip = Math.atan2(vLat - stParams.l_r * yawRate, Math.max(Math.abs(vLong), 1e-6));
      const mu = stParams.mu && stParams.mu > 0 ? stParams.mu : (stParams.lat_accel_max > 0 ? stParams.lat_accel_max / 9.81 : 0.8);
      const accelBudget = Math.max(mu * 9.81, 1e-6);
      frictionUtilization = Math.min(1, Math.hypot(accel, lateralAccel) / accelBudget);
      slipRatios = [0, 0];
      this.updateTelemetry(state, {
        accel,
        steerRate,
        lateralAccel,
        slipRatios,
        frontSlip,
        rearSlip,
        beta,
        yawRate,
        frictionUtilization,
      }, 0);
      this.simTime += this.dt;
      this.distance += Math.abs(speed) * this.dt;
      this.energy += accel * speed * this.dt;
      return;
    }

    // Non-single-track models are not supported in the JS backend.
  }

  snapshot(): BackendSnapshot {
    return { state: [...this.simulator.currentState()], telemetry: this.telemetry, dt: this.dt, simulation_time_s: this.simTime };
  }

  speed(): number {
    return this.simulator.speed();
  }

  private estimateAxleSlips(state: number[]): { front: number; rear: number } {
    const speed = this.indexValue(state, this.indices.longitudinalIndex);
    const beta = this.indexValue(state, this.indices.slipIndex);
    const yawRate = this.indexValue(state, this.indices.yawRateIndex);
    const steering = this.indexValue(state, this.indices.steeringIndex);
    const vLong = speed * Math.cos(beta);
    const vLat = speed * Math.sin(beta);
    const front = Math.atan2(vLat + this.params.l_f * yawRate, Math.max(Math.abs(vLong), 1e-6)) - steering;
    const rear = Math.atan2(vLat - this.params.l_r * yawRate, Math.max(Math.abs(vLong), 1e-6));
    return { front, rear };
  }

  private estimateLateralAccel(state: number[]): number {
    const yawRate = this.indexValue(state, this.indices.yawRateIndex);
    let vLong = this.indexValue(state, this.indices.longitudinalIndex);
    let vLat = 0;
    if (this.indices.lateralIndex !== undefined) {
      vLat = this.indexValue(state, this.indices.lateralIndex);
    } else if (this.indices.slipIndex !== undefined) {
      const slip = this.indexValue(state, this.indices.slipIndex);
      vLat = vLong * Math.tan(slip);
      vLong = vLong / Math.max(Math.cos(slip), 1e-6);
    }
    return yawRate * vLong; // approximate body lateral acceleration
  }

  private computeSlipRatios(state: number[], speed: number): number[] {
    if (!this.indices.wheelSpeedIndices || this.indices.wheelSpeedIndices.length < 2) {
      return [0, 0];
    }
    const denom = Math.max(speed, 1e-6);
    const front = this.indexValue(state, this.indices.wheelSpeedIndices[0]);
    const rear = this.indexValue(state, this.indices.wheelSpeedIndices[1]);
    return [(front - speed) / denom, (rear - speed) / denom];
  }

  private indexValue(state: number[], index?: number): number {
    if (index === undefined) return 0;
    if (index < 0 || index >= state.length) return 0;
    const value = state[index];
    return Number.isFinite(value) ? value : 0;
  }

  private updateTelemetry(state: number[], inputs: TelemetryInputs, detectorSeverity = 0): void {
    const yaw = state[2] ?? 0;
    const speed = this.indexValue(state, this.indices.longitudinalIndex);
    const beta = inputs.beta ?? 0;
    const yawRate = inputs.yawRate ?? this.yawRateForSt(state, this.params);
    const vLong = speed * Math.cos(beta);
    const vLat = speed * Math.sin(beta);
    const totalNormal = Math.max(this.params.m * 9.81, 1e-6);
    const wheelbase = Math.max(this.params.l_f + this.params.l_r, 1e-6);
    const frontNormal = totalNormal * (this.params.l_r / wheelbase);
    const rearNormal = totalNormal - frontNormal;
    const telem = new SimulationTelemetryState();
    telem.pose.x = state[0] ?? 0;
    telem.pose.y = state[1] ?? 0;
    telem.pose.yaw = yaw;

    telem.velocity.speed = Math.abs(speed);
    telem.velocity.longitudinal = vLong;
    telem.velocity.lateral = vLat;
    telem.velocity.yaw_rate = yawRate;
    telem.velocity.global_x = vLong * Math.cos(yaw) - vLat * Math.sin(yaw);
    telem.velocity.global_y = vLong * Math.sin(yaw) + vLat * Math.cos(yaw);

    telem.acceleration.longitudinal = inputs.accel;
    telem.acceleration.lateral = inputs.lateralAccel;

    telem.traction.slip_angle = beta;
    telem.traction.front_slip_angle = inputs.frontSlip;
    telem.traction.rear_slip_angle = inputs.rearSlip;
    telem.traction.lateral_force_saturation = clamp(inputs.frictionUtilization ?? 0, 0, 1);
    telem.traction.drift_mode = false;

    telem.steering.desired_angle = state[this.indices.steeringIndex ?? 4] ?? 0;
    telem.steering.actual_angle = telem.steering.desired_angle;
    telem.steering.desired_rate = inputs.steerRate;
    telem.steering.actual_rate = inputs.steerRate;

    const accelScale = Math.max(Math.abs(this.params.accel.max || 1), 1e-6);
    telem.controller.acceleration = inputs.accel;
    telem.controller.throttle = Math.max(0, inputs.accel) / accelScale;
    telem.controller.brake = Math.max(0, -inputs.accel) / Math.max(Math.abs(this.params.accel.min || 1), 1e-6);
    telem.controller.drive_force = Math.max(0, inputs.accel) * this.params.m;
    telem.controller.brake_force = Math.max(0, -inputs.accel) * this.params.m;
    telem.controller.regen_force = 0;
    telem.controller.hydraulic_force = telem.controller.brake_force;
    telem.controller.drag_force = 0;
    telem.controller.rolling_force = 0;

    telem.powertrain.drive_torque = 0;
    telem.powertrain.regen_torque = 0;
    telem.powertrain.total_torque = 0;
    telem.powertrain.mechanical_power = (telem.controller.drive_force - telem.controller.brake_force) * speed;
    telem.powertrain.battery_power = telem.powertrain.mechanical_power;
    telem.powertrain.soc = this.telemetry.powertrain.soc || 0.5;

    telem.front_axle.drive_torque = telem.controller.drive_force * wheelbase * 0.5;
    telem.rear_axle.drive_torque = telem.controller.drive_force * wheelbase * 0.5;
    telem.front_axle.brake_torque = telem.controller.brake_force * wheelbase * 0.5;
    telem.rear_axle.brake_torque = telem.controller.brake_force * wheelbase * 0.5;
    telem.front_axle.regen_torque = 0;
    telem.rear_axle.regen_torque = 0;
    telem.front_axle.normal_force = frontNormal;
    telem.rear_axle.normal_force = rearNormal;

    telem.front_axle.left.speed = speed;
    telem.front_axle.right.speed = speed;
    telem.rear_axle.left.speed = speed;
    telem.rear_axle.right.speed = speed;
    telem.front_axle.left.slip_ratio = 0;
    telem.front_axle.right.slip_ratio = 0;
    telem.rear_axle.left.slip_ratio = 0;
    telem.rear_axle.right.slip_ratio = 0;
    const frictionUse = telem.traction.lateral_force_saturation;
    telem.front_axle.left.friction_utilization = frictionUse;
    telem.front_axle.right.friction_utilization = frictionUse;
    telem.rear_axle.left.friction_utilization = frictionUse;
    telem.rear_axle.right.friction_utilization = frictionUse;

    const safetyStatus = this.safety.status(state, Math.abs(speed));
    telem.detector_severity = Math.max(detectorSeverity, safetyStatus.severity);
    telem.safety_stage = safetyStatus.stage;
    telem.detector_forced = safetyStatus.detector_forced;
    telem.low_speed_engaged = safetyStatus.latch_active;

    telem.totals.distance_traveled_m = this.distance;
    telem.totals.energy_consumed_joules = this.energy;
    telem.totals.simulation_time_s = this.simTime;

    this.telemetry = telem;
  }

  private yawRateForSt(state: number[], params: SingleTrackParameters): number {
    const v = this.indexValue(state, this.indices.longitudinalIndex);
    const delta = state[this.indices.steeringIndex ?? 4] ?? 0;
    const L = Math.max(params.l_f + params.l_r, 1e-6);
    const beta = Math.atan((params.l_r / L) * Math.tan(delta));
    return (v / Math.max(params.l_r, 1e-6)) * Math.sin(beta);
  }
}

function buildSafetyIndices(model: ModelType, params: ModelParameters): LowSpeedIndices {
  const stParams = isSingleTrackParameters(params) ? params : undefined;
  const longitudinalIndex = 3;
  const steeringIndex = 4;
  const wheelbase = stParams ? stParams.l_f + stParams.l_r : 0;
  const rearLength = stParams ? stParams.l_r : 0;
  return {
    longitudinalIndex,
    lateralIndex: undefined,
    yawRateIndex: undefined,
    slipIndex: undefined,
    wheelSpeedIndices: undefined,
    steeringIndex,
    wheelbase: wheelbase > 0 ? wheelbase : undefined,
    rearLength: rearLength > 0 ? rearLength : undefined,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
