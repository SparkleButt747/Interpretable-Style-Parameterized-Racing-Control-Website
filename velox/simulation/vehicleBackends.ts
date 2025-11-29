import { JsSimulationBackend, JsBackendOptions } from './jsBackend';
import { ModelType } from './types';

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
