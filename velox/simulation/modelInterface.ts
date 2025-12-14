import { vehicleDynamicsSTD, vehicleDynamicsST } from '../models/dynamics';
import { initSTD, initST } from '../models/init';
import { ModelParameters, VehicleParameters, isSingleTrackParameters } from '../models/types';
import { ModelInterface } from './VehicleSimulator';
import { ModelType } from './types';

export function buildModelInterface(model: ModelType): ModelInterface {
  switch (model) {
    case ModelType.ST:
      return {
        init: (state: number[], params: ModelParameters) => {
          if (!isSingleTrackParameters(params)) {
            throw new Error('Single-track model requires SingleTrackParameters');
          }
          return initST(state, params);
        },
        dynamics: (x, u, p, dt) => {
          if (!isSingleTrackParameters(p)) {
            throw new Error('Single-track model requires SingleTrackParameters');
          }
          return vehicleDynamicsST(x, u, p, dt);
        },
        speed: (state) => (state.length > 3 ? Math.abs(state[3]) : 0),
      };
    case ModelType.STD:
      return {
        init: (state: number[], params: ModelParameters) => {
          if (isSingleTrackParameters(params)) {
            throw new Error('STD model requires detailed vehicle parameters');
          }
          return initSTD(state, params);
        },
        dynamics: (x, u, p, dt) => {
          if (isSingleTrackParameters(p)) {
            throw new Error('STD model requires detailed vehicle parameters');
          }
          return vehicleDynamicsSTD(x, u, p, dt);
        },
        speed: (state) => (state.length > 3 ? Math.abs(state[3]) : 0),
      };
    default:
      throw new Error(`Unsupported model type ${model}`);
  }
}
