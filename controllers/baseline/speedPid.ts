import { clamp, jerkLimit, lowPassTime } from "./math";

export interface PidGains {
  kp: number;
  ki: number;
  kd: number;
}

export interface PidLimits {
  accelMin: number;
  accelMax: number;
  integratorMin?: number;
  integratorMax?: number;
  jerkMax?: number;
}

export interface PidConfig extends PidGains, PidLimits {
  derivativeFilterHz?: number;
}

export interface PidResult {
  command: number;
  p: number;
  i: number;
  d: number;
  error: number;
}

export class SpeedPid {
  private i = 0;
  private prevErr = 0;
  private prevD = 0;
  private prevCmd = 0;
  private readonly gains: PidGains;
  private readonly limits: PidLimits;
  private readonly tauD: number;

  constructor(config: PidConfig) {
    this.gains = { kp: config.kp, ki: config.ki, kd: config.kd };
    this.limits = {
      accelMin: config.accelMin,
      accelMax: config.accelMax,
      integratorMin: config.integratorMin ?? -Infinity,
      integratorMax: config.integratorMax ?? Infinity,
      jerkMax: config.jerkMax,
    };
    const hz = config.derivativeFilterHz ?? 4;
    this.tauD = hz > 0 ? 1 / (2 * Math.PI * hz) : 0;
  }

  reset(initialCommand = 0): void {
    this.i = 0;
    this.prevErr = 0;
    this.prevD = 0;
    this.prevCmd = initialCommand;
  }

  update(targetSpeed: number, measuredSpeed: number, dt: number): PidResult {
    const error = targetSpeed - measuredSpeed;
    const p = this.gains.kp * error;
    this.i += this.gains.ki * error * Math.max(dt, 0);
    this.i = clamp(this.i, this.limits.integratorMin ?? -Infinity, this.limits.integratorMax ?? Infinity);

    const rawD = dt > 0 ? (error - this.prevErr) / dt : 0;
    const dFiltered = this.tauD > 0 ? lowPassTime(this.prevD, rawD, dt, this.tauD) : rawD;
    const d = this.gains.kd * dFiltered;

    let cmd = p + this.i + d;
    cmd = clamp(cmd, this.limits.accelMin, this.limits.accelMax);
    cmd = jerkLimit(this.prevCmd, cmd, this.limits.jerkMax ?? 0, dt);

    this.prevErr = error;
    this.prevD = dFiltered;
    this.prevCmd = cmd;

    return { command: cmd, p, i: this.i, d, error };
  }
}
