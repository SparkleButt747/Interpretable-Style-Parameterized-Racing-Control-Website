import { SingleTrackParameters, VehicleParameters } from './types';

export function initSTD(init: number[], params: VehicleParameters): number[] {
  const baseSize = 7;
  const x0: number[] = new Array(baseSize).fill(0);
  const copy = Math.min(init.length, baseSize);
  for (let i = 0; i < copy; i += 1) {
    x0[i] = init[i] ?? 0;
  }

  const v = x0[3];
  const beta = x0[6];
  const delta = x0[2];

  x0.push(v * Math.cos(beta) * Math.cos(delta) / Math.max(params.R_w, 1e-9));
  x0.push(v * Math.cos(beta) / Math.max(params.R_w, 1e-9));
  return x0;
}

export function initST(init: number[], params: SingleTrackParameters): number[] {
  const x0: number[] = [0, 0, 0, 0, 0];
  const copy = Math.min(init.length, x0.length);
  for (let i = 0; i < copy; i += 1) {
    x0[i] = init[i] ?? 0;
  }
  x0[4] = Math.min(Math.max(x0[4], params.steering.min), params.steering.max);
  return x0;
}
