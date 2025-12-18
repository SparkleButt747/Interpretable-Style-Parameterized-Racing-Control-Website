import { ConfigManager } from '../io/ConfigManager';
import { ModelType } from './types';
import type { SimulationTelemetry } from '../telemetry/index';
import { JsSimulationBackend } from './jsBackend';

export interface BackendSnapshot {
  state: number[];
  telemetry?: SimulationTelemetry;
  dt?: number;
  simulation_time_s?: number;
}

export interface SimulationBackend {
  ready?: Promise<void>;
  reset(state: number[], dt: number): void | Promise<void>;
  step(control: number[], dt: number): void | Promise<void>;
  snapshot(): BackendSnapshot;
  speed(): number;
}

interface LowSpeedRegimeConfig {
  engage_speed: number;
  release_speed: number;
  yaw_rate_limit: number;
  slip_angle_limit: number;
}

interface LowSpeedSafetyConfig {
  drift_enabled: boolean;
  stop_speed_epsilon: number;
  normal: LowSpeedRegimeConfig;
  drift: LowSpeedRegimeConfig;
}

/**
 * Simple backend wrapper that always uses the JS kinematic bicycle model.
 */
export class HybridSimulationBackend implements SimulationBackend {
  private delegate!: SimulationBackend;
  ready: Promise<void>;

  constructor(
    private readonly options: {
      model?: ModelType;
      vehicleId?: number;
      configManager: ConfigManager;
      driftEnabled: boolean;
    }
  ) {
    this.ready = this.initialize();
  }

  async reset(state: number[], dt: number): Promise<void> {
    await this.ready;
    return this.delegate.reset(state, dt);
  }

  async step(control: number[], dt: number): Promise<void> {
    await this.ready;
    return this.delegate.step(control, dt);
  }

  snapshot(): BackendSnapshot {
    return this.delegate.snapshot();
  }

  speed(): number {
    return this.delegate.speed();
  }

  private async initialize(): Promise<void> {
    const model = this.options.model ?? ModelType.ST;
    const vehicleId = this.options.vehicleId ?? 0;
    const fallbackDefaults = await this.loadConfigs(this.options.configManager, vehicleId, model).catch((error) => {
      console.warn(`HybridSimulationBackend failed to load configs; using defaults: ${error}`);
      return {
        vehicle: {},
        lowSpeed: defaultLowSpeedSafety(),
      };
    });

    this.delegate = new JsSimulationBackend({
      model,
      params: fallbackDefaults.vehicle as any,
      lowSpeed: fallbackDefaults.lowSpeed,
      driftEnabled: this.options.driftEnabled,
    });
  }

  private async loadConfigs(configManager: ConfigManager, vehicleId: number, model: ModelType) {
    const [vehicle, lowSpeedDoc] = await Promise.all([
      configManager.loadModelParameters(vehicleId, model),
      configManager.loadLowSpeedSafetyConfig(model),
    ]);

    const lowSpeed = parseConfigDocument(lowSpeedDoc) as Record<string, any>;

    return {
      vehicle: ensureObject(vehicle),
      lowSpeed: normalizeLowSpeedSafety(lowSpeed),
    };
  }
}

function parseConfigDocument(document: unknown): Record<string, unknown> {
  if (typeof document === 'string') {
    return parseYamlLike(document);
  }
  if (document && typeof document === 'object') {
    return document as Record<string, unknown>;
  }
  return {};
}

function parseYamlLike(document: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = document.split(/\r?\n/).filter((line) => line.trim().length > 0 && !line.trim().startsWith('#'));
  const stack: Array<{ indent: number; target: Record<string, unknown> }> = [{ indent: -1, target: result }];

  for (const raw of lines) {
    const match = raw.match(/^(\s*)([^:]+):\s*(.*)$/);
    if (!match) continue;
    const [, spaces, key, value] = match;
    const indent = spaces.length;
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].target;
    if (value === '') {
      const child: Record<string, unknown> = {};
      parent[key.trim()] = child;
      stack.push({ indent, target: child });
    } else {
      const numeric = Number(value);
      parent[key.trim()] = Number.isFinite(numeric) ? numeric : value.trim();
    }
  }
  return result;
}

function ensureObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return {};
}

function normalizeLowSpeedSafety(raw: Record<string, any>): LowSpeedSafetyConfig {
  const base = defaultLowSpeedSafety();
  const merged: LowSpeedSafetyConfig = {
    ...base,
    drift_enabled: coerceBoolean(raw.drift_enabled, base.drift_enabled),
    stop_speed_epsilon: Number(raw.stop_speed_epsilon ?? base.stop_speed_epsilon),
    normal: { ...base.normal },
    drift: { ...base.drift },
  };
  if (raw.normal) {
    merged.normal = {
      ...merged.normal,
      engage_speed: Number(raw.normal.engage_speed ?? merged.normal.engage_speed),
      release_speed: Number(raw.normal.release_speed ?? merged.normal.release_speed),
      yaw_rate_limit: Number(raw.normal.yaw_rate_limit ?? merged.normal.yaw_rate_limit),
      slip_angle_limit: Number(raw.normal.slip_angle_limit ?? merged.normal.slip_angle_limit),
    };
  }
  if (raw.drift) {
    merged.drift = {
      ...merged.drift,
      engage_speed: Number(raw.drift.engage_speed ?? merged.drift.engage_speed),
      release_speed: Number(raw.drift.release_speed ?? merged.drift.release_speed),
      yaw_rate_limit: Number(raw.drift.yaw_rate_limit ?? merged.drift.yaw_rate_limit),
      slip_angle_limit: Number(raw.drift.slip_angle_limit ?? merged.drift.slip_angle_limit),
    };
  }
  return merged;
}

function coerceBoolean(value: any, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function defaultLowSpeedSafety(): LowSpeedSafetyConfig {
  return {
    drift_enabled: false,
    stop_speed_epsilon: 0.05,
    normal: { engage_speed: 0.4, release_speed: 0.8, yaw_rate_limit: 0.5, slip_angle_limit: 0.35 },
    drift: { engage_speed: 0.3, release_speed: 1.0, yaw_rate_limit: 0.8, slip_angle_limit: 0.6 },
  };
}
