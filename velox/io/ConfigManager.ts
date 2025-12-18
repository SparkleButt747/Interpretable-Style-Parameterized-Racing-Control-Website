import {
  SingleTrackParameters,
  ModelParameters,
} from '../models/types';
import { defaultStyleParamConfig, type StyleParamControllerConfig } from '../../controllers/style-param';
import { ModelTimingInfo, ModelType } from '../simulation/types';

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function withTrailingSlash(path: string): string {
  return path.endsWith('/') ? path : `${path}/`;
}

function siblingConfigRoot(parameterRoot: string): string {
  const trimmed = parameterRoot.replace(/\/+$/, '');
  const segments = trimmed.split('/');
  segments.pop();
  segments.push('config');
  return segments.join('/') || 'config';
}

function modelKey(model: ModelType): string {
  void model;
  return 'st';
}

async function ensureAvailable(fetcher: Fetcher, url: string, description: string): Promise<void> {
  const response = await fetcher(url, { method: 'HEAD' }).catch((error) => {
    throw new Error(`${description} root ${url} is unreachable: ${error}`);
  });
  if (!response.ok) {
    throw new Error(`${description} root ${url} is not accessible (status ${response.status})`);
  }
}

function parseScalar(value: string): number | boolean | string {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function parseYamlLike(document: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = document
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0 && !line.trim().startsWith('#'));
  const stack: Array<{ indent: number; target: Record<string, unknown> }> = [{ indent: -1, target: result }];

  for (const raw of lines) {
    const match = raw.match(/^(\s*)([^:]+):\s*(.*)$/);
    if (!match) continue;
    const [, spaces, keyRaw, valueRaw] = match;
    const key = keyRaw.trim();
    const valuePart = valueRaw.replace(/\s+#.*$/, '').trim();
    const indent = spaces.length;
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].target;
    if (valuePart === '') {
      const child: Record<string, unknown> = {};
      parent[key] = child;
      stack.push({ indent, target: child });
    } else {
      parent[key] = parseScalar(valuePart);
    }
  }
  return result;
}

function ensureNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeStSteering(raw: unknown = {}): SingleTrackParameters['steering'] {
  const steering = (raw ?? {}) as Record<string, unknown>;
  return {
    min: ensureNumber(steering.min, -0.6),
    max: ensureNumber(steering.max, 0.6),
    rate_min: ensureNumber(steering.rate_min ?? steering.rate_min_rad ?? steering.rate_limit_min, -3),
    rate_max: ensureNumber(steering.rate_max ?? steering.rate_max_rad ?? steering.rate_limit_max, 3),
  };
}

function normalizeStAccel(raw: unknown = {}): SingleTrackParameters['accel'] {
  const accel = (raw ?? {}) as Record<string, unknown>;
  return {
    min: ensureNumber(accel.min ?? accel.min_accel, -6),
    max: ensureNumber(accel.max ?? accel.max_accel, 4),
    jerk_max: ensureNumber(accel.jerk_max ?? accel.max_jerk ?? accel.jerk, 0),
  };
}

function normalizeSingleTrack(raw: unknown): SingleTrackParameters {
  const data = (raw ?? {}) as Record<string, unknown>;
  const steering = normalizeStSteering((data.steering as unknown) ?? {});
  const accel = normalizeStAccel((data.accel as unknown) ?? (data.acceleration as unknown) ?? {});
  return {
    l_f: ensureNumber(data.l_f ?? data.a ?? data.lf),
    l_r: ensureNumber(data.l_r ?? data.b ?? data.lr),
    m: ensureNumber(data.m),
    I_z: ensureNumber(data.I_z ?? data.Izz ?? data.I),
    lat_accel_max: ensureNumber(data.lat_accel_max ?? 6),
    mu: ensureNumber(data.mu ?? data.friction_coefficient, 0),
    steering,
    accel,
  };
}

export class ConfigManager {
  readonly configRoot: string;
  readonly parameterRoot: string;
  private readonly fetcher: Fetcher;
  private rootsChecked = false;

  constructor(configRoot?: string, parameterRoot: string = 'parameters', fetcher?: Fetcher) {
    this.fetcher = fetcher ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined as unknown as Fetcher);
    if (!this.fetcher) {
      throw new Error('A fetch-compatible API is required to load configuration assets.');
    }

    const paramRoot = withTrailingSlash(parameterRoot);
    const derivedConfig = withTrailingSlash(configRoot ?? siblingConfigRoot(paramRoot));
    this.parameterRoot = paramRoot;
    this.configRoot = derivedConfig;
  }

  async verifyRoots(): Promise<void> {
    if (this.rootsChecked) return;
    await ensureAvailable(this.fetcher, this.parameterRoot, 'Parameter');
    await ensureAvailable(this.fetcher, this.configRoot, 'Config');
    this.rootsChecked = true;
  }

  async loadSingleTrackParameters(path = 'st/vehicle.yaml'): Promise<SingleTrackParameters> {
    await this.verifyRoots();
    const document = await this.fetchDocument(this.resolveParameterPath(path), 'single-track parameters');
    const parsed = this.parseDocument(document);
    return normalizeSingleTrack(parsed);
  }

  async loadModelParameters(vehicleId: number, model: ModelType): Promise<ModelParameters> {
    void vehicleId;
    void model;
    return this.loadSingleTrackParameters().catch(() => normalizeSingleTrack({}));
  }

  async loadLowSpeedSafetyConfig(model: ModelType): Promise<Record<string, unknown>> {
    await this.verifyRoots();
    const suffix = modelKey(model);
    const overrideName = `low_speed_safety_${suffix}.yaml`;
    const overridePath = this.resolveConfigPath(overrideName);
    const fallback = this.resolveConfigPath('low_speed_safety.yaml');
    try {
      return this.parseDocument(await this.fetchDocument(overridePath, `low speed safety config (${suffix})`));
    } catch (error) {
      return this.parseDocument(await this.fetchDocument(fallback, 'low speed safety config (default)'));
    }
  }

  async loadModelTiming(model: ModelType): Promise<ModelTimingInfo> {
    await this.verifyRoots();
    const defaultTimings: Record<ModelType, ModelTimingInfo> = {
      [ModelType.ST]: { nominal_dt: 0.01, max_dt: 0.016 },
    };
    const path = this.resolveConfigPath('model_timing.yaml');
    try {
      const document = await this.fetchDocument(path, 'model timing');
      const parsed = this.parseDocument(document);
      const modelSection = parsed[modelKey(model)];
      if (modelSection && typeof modelSection === 'object') {
        const section = modelSection as Record<string, unknown>;
        const nominal = Number(section.nominal_dt);
        const max = Number(section.max_dt);
        if (Number.isFinite(nominal) && Number.isFinite(max)) {
          return { nominal_dt: nominal, max_dt: max };
        }
      }
    } catch (error) {
      console.warn(`Timing config missing or invalid at ${path}: ${error}`);
    }
    return defaultTimings[model];
  }

  async loadStyleParamConfig(): Promise<StyleParamControllerConfig> {
    // Inline bundle: no remote YAML required.
    return {
      ...defaultStyleParamConfig,
      steerKnots: [...defaultStyleParamConfig.steerKnots],
      steerDeltas: [...defaultStyleParamConfig.steerDeltas],
      speedKnots: [...defaultStyleParamConfig.speedKnots],
      speedDeltas: [...defaultStyleParamConfig.speedDeltas],
    };
  }

  private resolveConfigPath(path: string): string {
    return new URL(path, this.configRoot).toString();
  }

  private resolveParameterPath(path: string): string {
    return new URL(path, this.parameterRoot).toString();
  }

  private async fetchDocument(path: string, description: string): Promise<unknown> {
    const response = await this.fetcher(path).catch((error) => {
      throw new Error(`Failed to fetch ${description} at ${path}: ${error}`);
    });
    if (!response.ok) {
      throw new Error(`Missing ${description} at ${path} (status ${response.status})`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    const body = await response.text();
    const looksJson = contentType.includes('application/json') || path.endsWith('.tson');
    if (looksJson) {
      try {
        return JSON.parse(body);
      } catch (error) {
        throw new Error(`Invalid JSON in ${description} at ${path}: ${error}`);
      }
    }
    return body;
  }

  private parseDocument(document: unknown): Record<string, unknown> {
    if (typeof document === 'string') {
      try {
        return parseYamlLike(document);
      } catch (error) {
        throw new Error(`Failed to parse YAML: ${error}`);
      }
    }
    if (document && typeof document === 'object') {
      return document as Record<string, unknown>;
    }
    return {};
  }
}
