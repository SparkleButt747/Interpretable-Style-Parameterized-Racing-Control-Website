import { JsSimulationBackend, JsBackendOptions } from './jsBackend.ts';
import { ModelType } from './types.ts';

export type VehicleBackendOptions = Omit<JsBackendOptions, 'model'> & { model?: ModelType };

export class STSimulationBackend extends JsSimulationBackend {
  constructor(options: VehicleBackendOptions) {
    super({ ...options, model: ModelType.ST });
  }
}

export class STDSimulationBackend extends JsSimulationBackend {
  constructor(options: VehicleBackendOptions) {
    super({ ...options, model: ModelType.STD });
  }
}
