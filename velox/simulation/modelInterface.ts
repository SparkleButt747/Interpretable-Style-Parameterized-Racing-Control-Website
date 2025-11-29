import { vehicleDynamicsST, vehicleDynamicsSTD } from '../models/dynamics.ts';
import { initST, initSTD } from '../models/init.ts';
import { VehicleParameters } from '../models/types.ts';
import { ModelInterface } from './VehicleSimulator.ts';
import { ModelType } from './types.ts';

export function buildModelInterface(model: ModelType): ModelInterface {
  switch (model) {
    case ModelType.ST:
      return {
        init: (state: number[]) => initST(state),
        dynamics: (x, u, p) => vehicleDynamicsST(x, u, p),
        speed: (state) => (state.length > 3 ? Math.abs(state[3]) : 0),
      };
    case ModelType.STD:
      return {
        init: (state: number[], params: VehicleParameters) => initSTD(state, params),
        dynamics: (x, u, p, dt) => vehicleDynamicsSTD(x, u, p, dt),
        speed: (state) => (state.length > 3 ? Math.abs(state[3]) : 0),
      };
    default:
      throw new Error(`Unsupported model type ${model}`);
  }
}
