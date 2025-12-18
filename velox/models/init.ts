import { SingleTrackParameters } from './types';

export function initST(init: number[], params: SingleTrackParameters): number[] {
  const x0: number[] = [0, 0, 0, 0, 0];
  const copy = Math.min(init.length, x0.length);
  for (let i = 0; i < copy; i += 1) {
    x0[i] = init[i] ?? 0;
  }
  x0[4] = Math.min(Math.max(x0[4], params.steering.min), params.steering.max);
  return x0;
}
