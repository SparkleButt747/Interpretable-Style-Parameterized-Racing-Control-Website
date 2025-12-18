import type { SingleTrackParameters } from "@/velox/models/types";
import { clamp, rateLimitPerSecond, wrapAngle } from "./math";
import type { Path, PathSample } from "./path";
import { closestPoint, sampleAtS } from "./path";

export interface PurePursuitConfig {
  baseLookahead: number;
  lookaheadGain: number;
  minLookahead?: number;
  maxLookahead?: number;
}

export interface PurePursuitState {
  x: number;
  y: number;
  yaw: number;
  speed: number;
  steeringAngle: number;
}

export interface PurePursuitResult {
  lookahead: number;
  target: PathSample;
  curvature: number;
  steeringAngleCommand: number;
  steeringRateCommand: number;
  headingError: number;
}

export class PurePursuitController {
  private readonly cfg: Required<PurePursuitConfig>;
  private steeringLimits = { min: -0.6, max: 0.6, rateMin: -4, rateMax: 4 };
  private wheelbase = 1.0;

  constructor(config: PurePursuitConfig, vehicle?: SingleTrackParameters) {
    this.cfg = {
      baseLookahead: config.baseLookahead,
      lookaheadGain: config.lookaheadGain,
      minLookahead: config.minLookahead ?? 0.4,
      maxLookahead: config.maxLookahead ?? 12,
    };
    if (vehicle) {
      this.wheelbase = Math.max(vehicle.l_f + vehicle.l_r, 1e-3);
      this.steeringLimits = {
        min: vehicle.steering.min,
        max: vehicle.steering.max,
        rateMin: vehicle.steering.rate_min,
        rateMax: vehicle.steering.rate_max,
      };
    }
  }

  update(path: Path, state: PurePursuitState, dt: number, nearestOverride?: PathSample): PurePursuitResult {
    const lookahead = this.computeLookahead(state.speed);
    const nearest = nearestOverride ?? closestPoint(path, { x: state.x, y: state.y });
    const target = sampleAtS(path, nearest.s + lookahead);
    const toTarget = { x: target.point.x - state.x, y: target.point.y - state.y };
    const targetHeading = Math.atan2(toTarget.y, toTarget.x);
    const headingError = wrapAngle(targetHeading - state.yaw);
    const curvature = (2 * Math.sin(headingError)) / Math.max(lookahead, 1e-3);

    const steeringAngleCommand = clamp(Math.atan(this.wheelbase * curvature), this.steeringLimits.min, this.steeringLimits.max);
    const desiredRate = (steeringAngleCommand - state.steeringAngle) / Math.max(dt, 1e-3);
    const steeringRateCommand = clamp(desiredRate, this.steeringLimits.rateMin, this.steeringLimits.rateMax);
    const nextAngle = rateLimitPerSecond(
      state.steeringAngle,
      state.steeringAngle + steeringRateCommand * dt,
      Math.max(Math.abs(this.steeringLimits.rateMax), Math.abs(this.steeringLimits.rateMin)),
      dt
    );
    const finalRate = clamp((nextAngle - state.steeringAngle) / Math.max(dt, 1e-3), this.steeringLimits.rateMin, this.steeringLimits.rateMax);

    return {
      lookahead,
      target,
      curvature,
      steeringAngleCommand,
      steeringRateCommand: finalRate,
      headingError,
    };
  }

  private computeLookahead(speed: number): number {
    const { baseLookahead, lookaheadGain, minLookahead, maxLookahead } = this.cfg;
    const raw = baseLookahead + lookaheadGain * Math.max(speed, 0);
    return clamp(raw, minLookahead, maxLookahead);
  }
}
