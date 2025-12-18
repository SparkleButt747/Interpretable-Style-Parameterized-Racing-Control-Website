import type { TrackDefinition, Vec2 } from "@/app/playground/types";
import type { SingleTrackParameters } from "@/velox/models/types";
import type { SimulationTelemetry } from "@/velox/telemetry";
import { ControlMode, type UserInput } from "@/velox/simulation/SimulationDaemon";
import { clamp } from "./math";
import { PurePursuitController, type PurePursuitConfig, type PurePursuitResult } from "./purePursuit";
import { buildPath, closestPoint, type Path, type PathOptions } from "./path";
import { TargetSpeedPlanner, type TargetSpeedConfig } from "./speedProfile";
import { SpeedPid, type PidConfig, type PidResult } from "./speedPid";

export interface BaselineConfig {
  lookahead: PurePursuitConfig;
  speed: TargetSpeedConfig;
  pid: Omit<PidConfig, "accelMin" | "accelMax">;
  path?: PathOptions;
}

export interface BaselineState {
  x: number;
  y: number;
  yaw: number;
  speed: number;
  steeringAngle: number;
}

export interface BaselineOutput {
  steeringRate: number;
  acceleration: number;
  targetSpeed: number;
  lookahead: number;
  targetPoint: Vec2;
  pathS: number;
  headingError: number;
  curvature: number;
  previewCurvature: number;
  speedError: number;
  steeringAngleCommand: number;
  raw: {
    pursuit: PurePursuitResult;
    pid: PidResult;
  };
}

export class BaselineController {
  private path?: Path;
  private pursuit?: PurePursuitController;
  private speedPlanner?: TargetSpeedPlanner;
  private pid?: SpeedPid;
  private vehicle?: SingleTrackParameters;
  private config: BaselineConfig;

  constructor(config?: Partial<BaselineConfig>) {
    this.config = mergeConfig(config);
  }

  reset(track: TrackDefinition, vehicle: SingleTrackParameters): void {
    this.vehicle = vehicle;
    const pathOptions = this.config.path ?? {};
    this.path = buildPath(track, pathOptions);
    this.pursuit = new PurePursuitController(this.config.lookahead, vehicle);
    this.speedPlanner = new TargetSpeedPlanner({
      ...this.config.speed,
      mu: resolveMu(vehicle, this.config.speed.mu),
      maxSpeed: this.config.speed.maxSpeed ?? vehicle.accel.max * 4,
    });
    this.pid = new SpeedPid({
      ...this.config.pid,
      accelMin: vehicle.accel.min,
      accelMax: vehicle.accel.max,
      jerkMax: vehicle.accel.jerk_max,
      integratorMin: this.config.pid.integratorMin ?? vehicle.accel.min,
      integratorMax: this.config.pid.integratorMax ?? vehicle.accel.max,
    });
    this.speedPlanner.reset(0);
    this.pid.reset(0);
  }

  update(state: BaselineState, dt: number): BaselineOutput {
    if (!this.path || !this.pursuit || !this.speedPlanner || !this.pid) {
      throw new Error("BaselineController must be reset() before update()");
    }

    const nearest = closestPoint(this.path, { x: state.x, y: state.y });
    const pursuit = this.pursuit.update(this.path, state, dt, nearest);
    const speedPlan = this.speedPlanner.update(
      this.path,
      { s: nearest.s, speed: state.speed },
      dt
    );
    const pid = this.pid.update(speedPlan.targetSpeed, state.speed, dt);

    return {
      steeringRate: pursuit.steeringRateCommand,
      acceleration: pid.command,
      targetSpeed: speedPlan.targetSpeed,
      lookahead: pursuit.lookahead,
      targetPoint: pursuit.target.point,
      pathS: nearest.s,
      headingError: pursuit.headingError,
      curvature: pursuit.curvature,
      previewCurvature: speedPlan.previewCurvature,
      speedError: pid.error,
      steeringAngleCommand: pursuit.steeringAngleCommand,
      raw: { pursuit, pid },
    };
  }

  buildKeyboardInput(output: BaselineOutput, dt: number, timestamp: number): UserInput {
    if (!this.vehicle) {
      throw new Error("BaselineController requires vehicle params to build user input");
    }
    const accelMax = Math.max(this.vehicle.accel.max, 1e-3);
    const accelMin = Math.min(this.vehicle.accel.min, -1e-3);
    const accel = clamp(output.acceleration, accelMin, accelMax);
    const throttle = accel >= 0 ? clamp(accel / accelMax, 0, 1) : 0;
    const brake = accel < 0 ? clamp(-accel / Math.abs(accelMin), 0, 1) : 0;
    return {
      control_mode: ControlMode.Keyboard,
      longitudinal: { throttle, brake },
      steering_nudge: output.steeringRate,
      timestamp,
      dt,
    };
  }
}

export function stateFromTelemetry(telem: SimulationTelemetry): BaselineState {
  return {
    x: telem.pose.x ?? 0,
    y: telem.pose.y ?? 0,
    yaw: telem.pose.yaw ?? 0,
    speed: telem.velocity.speed ?? 0,
    steeringAngle: telem.steering.actual_angle ?? 0,
  };
}

function resolveMu(vehicle: SingleTrackParameters, override?: number): number {
  const cap = 1.6;
  if (override && override > 0) return Math.min(override, cap);
  if (vehicle.mu && vehicle.mu > 0) return Math.min(vehicle.mu, cap);
  if (vehicle.lat_accel_max > 0) return Math.min(vehicle.lat_accel_max / 9.81, cap);
  return 0.9;
}

function mergeConfig(config?: Partial<BaselineConfig>): BaselineConfig {
  const lookahead: PurePursuitConfig = {
    baseLookahead: config?.lookahead?.baseLookahead ?? 2.0,
    lookaheadGain: config?.lookahead?.lookaheadGain ?? 0.25,
    minLookahead: config?.lookahead?.minLookahead ?? 0.6,
    maxLookahead: config?.lookahead?.maxLookahead ?? 18,
  };
  const speed: TargetSpeedConfig = {
    mu: config?.speed?.mu,
    minSpeed: config?.speed?.minSpeed ?? 0.5,
    maxSpeed: config?.speed?.maxSpeed ?? 32,
    previewDistance: config?.speed?.previewDistance ?? 12,
    smoothingTimeConstant: config?.speed?.smoothingTimeConstant ?? 0.4,
    curvatureEpsilon: config?.speed?.curvatureEpsilon ?? 1e-3,
    riskScale: config?.speed?.riskScale ?? 1,
  };
  const pid: Omit<PidConfig, "accelMin" | "accelMax"> = {
    kp: config?.pid?.kp ?? 1.2,
    ki: config?.pid?.ki ?? 0.35,
    kd: config?.pid?.kd ?? 0.05,
    derivativeFilterHz: config?.pid?.derivativeFilterHz ?? 5,
    integratorMin: config?.pid?.integratorMin ?? undefined,
    integratorMax: config?.pid?.integratorMax ?? undefined,
    jerkMax: config?.pid?.jerkMax ?? undefined,
  };

  return {
    lookahead,
    speed,
    pid,
    path: config?.path,
  };
}
