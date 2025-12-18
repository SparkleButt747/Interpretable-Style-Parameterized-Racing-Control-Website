// Lightweight math helpers for geometric controllers.
export const kTwoPi = Math.PI * 2;
export const kEpsilon = 1e-6;

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function wrapAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= kTwoPi;
  while (a <= -Math.PI) a += kTwoPi;
  return a;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function hypot2(x: number, y: number): number {
  return Math.hypot(x, y);
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return hypot2(a.x - b.x, a.y - b.y);
}

export function normalize(vec: { x: number; y: number }): { x: number; y: number } {
  const mag = Math.hypot(vec.x, vec.y);
  if (mag < kEpsilon) return { x: 1, y: 0 };
  return { x: vec.x / mag, y: vec.y / mag };
}

export function dot(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return a.x * b.x + a.y * b.y;
}

export function rateLimit(current: number, target: number, maxDelta: number): number {
  const delta = clamp(target - current, -maxDelta, maxDelta);
  return current + delta;
}

export function rateLimitPerSecond(current: number, target: number, rateLimitValue: number, dt: number): number {
  const maxDelta = Math.max(rateLimitValue, 0) * Math.max(dt, kEpsilon);
  return rateLimit(current, target, maxDelta);
}

export function lowPass(prev: number, next: number, alpha: number): number {
  const a = clamp(alpha, 0, 1);
  return prev + (next - prev) * a;
}

export function lowPassTime(prev: number, next: number, dt: number, timeConstant: number): number {
  if (!(timeConstant > 0) || !(dt > 0)) return next;
  const alpha = 1 - Math.exp(-dt / Math.max(timeConstant, kEpsilon));
  return lowPass(prev, next, alpha);
}

export function signedAngle(from: { x: number; y: number }, to: { x: number; y: number }): number {
  const a = Math.atan2(from.y, from.x);
  const b = Math.atan2(to.y, to.x);
  return wrapAngle(b - a);
}

export function curvatureFromPoints(p0: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const a = distance(p0, p1);
  const b = distance(p1, p2);
  const c = distance(p0, p2);
  const denom = Math.max(a * b * c, kEpsilon);
  const area = Math.abs(
    0.5 *
    (p0.x * (p1.y - p2.y) +
      p1.x * (p2.y - p0.y) +
      p2.x * (p0.y - p1.y))
  );
  return (4 * area) / denom;
}

export function jerkLimit(prev: number, target: number, jerkMax: number, dt: number): number {
  if (!(jerkMax > 0) || !(dt > 0)) return target;
  const maxDelta = jerkMax * dt;
  return rateLimit(prev, target, maxDelta);
}
