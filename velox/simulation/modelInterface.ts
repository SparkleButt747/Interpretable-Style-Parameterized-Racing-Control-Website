import { vehicleDynamicsST } from '../models/dynamics';
import { initST } from '../models/init';
import { ModelParameters, isSingleTrackParameters } from '../models/types';
import { ModelInterface } from './VehicleSimulator';
import { ModelType } from './types';

export function buildModelInterface(_model: ModelType): ModelInterface {
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
}
