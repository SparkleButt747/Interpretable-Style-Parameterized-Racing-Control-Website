import { VehicleParameters } from './types';

export function initST(init: number[]): number[] {
  const size = 7;
  const state = new Array<number>(size).fill(0);
  const copy = Math.min(init.length, size);
  for (let i = 0; i < copy; i += 1) {
    state[i] = init[i] ?? 0;
  }
  return state;
}

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
