import { STDSimulationBackend, STSimulationBackend, type VehicleBackendOptions } from './vehicleBackends';
import type { NativeDaemonFactory, NativeDaemonHandle } from './backend';
import { ModelType } from './types';
import { ModelParameters } from '../models/types';
import type { LowSpeedSafetyConfig } from './LowSpeedSafety';
import type { LossOfControlConfig } from './LossOfControlDetector';

class TypeScriptNativeDaemon implements NativeDaemonHandle {
  constructor(
    private readonly backend: STDSimulationBackend
  ) {}

  reset(state: number[], dt: number): void {
    this.backend.reset(state, dt);
  }

  step(control: number[], dt: number): void {
    this.backend.step(control, dt);
  }

  snapshot() {
    return this.backend.snapshot();
  }

  speed(): number {
    return this.backend.speed();
  }
}

function modelKey(model: ModelType): string {
  switch (model) {
    case ModelType.ST:
      return 'st';
    case ModelType.STD:
      return 'std';
    default:
      return 'std';
  }
}

function selectModelConfig<T extends Record<string, any>>(config: T, model: ModelType): T {
  if (!config || typeof config !== 'object') {
    return {} as T;
  }
  const key = modelKey(model);
  const candidate = (config as Record<string, any>)[key];
  if (candidate && typeof candidate === 'object') {
    return candidate as T;
  }
  return config;
}

/**
 * Packaged native daemon factory implemented purely in TypeScript. This mirrors
 * the C++ solvers and safety logic so that HybridSimulationBackend can run the
 * STD model without external bindings.
 */
export const packagedNativeFactory: NativeDaemonFactory = async ({
  model,
  vehicleParameters,
  lowSpeedSafety,
  lossOfControl,
}) => {
  const safetyConfig = selectModelConfig(lowSpeedSafety ?? {}, model);
  const lossConfig = selectModelConfig(lossOfControl ?? {}, model);
  const driftEnabled = Boolean((safetyConfig as any).drift_enabled);

  const backend = createModelBackend({
    model,
    params: (vehicleParameters ?? {}) as unknown as ModelParameters,
    lowSpeed: safetyConfig as LowSpeedSafetyConfig,
    lossConfig: lossConfig as LossOfControlConfig,
    driftEnabled,
  });

  return new TypeScriptNativeDaemon(backend);
};

function createModelBackend(options: VehicleBackendOptions & { model: ModelType }) {
  switch (options.model) {
    case ModelType.ST:
      return new STSimulationBackend(options);
    case ModelType.STD:
      return new STDSimulationBackend(options);
    default:
      return new STDSimulationBackend(options);
  }
}

export default packagedNativeFactory;
