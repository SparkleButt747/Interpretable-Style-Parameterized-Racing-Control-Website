import type { TrackDefinition, Vec2 } from "@/app/playground/types";
import { clamp, curvatureFromPoints, distance, lerp, normalize, wrapAngle } from "./math";

export interface PathPoint extends Vec2 {
  s: number;
  heading: number;
  curvature: number;
}

export interface PathSample {
  point: Vec2;
  s: number;
  heading: number;
  curvature: number;
}

export interface PathOptions {
  spacing?: number;
  minPoints?: number;
  curvatureSmoothing?: number;
}

export interface Path {
  points: PathPoint[];
  length: number;
  isLoop: boolean;
  spacing: number;
}

const kMinSpacing = 0.2;
const kDefaultSpacing = 0.8;

export function buildPath(track: TrackDefinition, options: PathOptions = {}): Path {
  const { spacing = kDefaultSpacing, minPoints = 6, curvatureSmoothing = 5 } = options;
  const raw = orderedCheckpoints(track);
  const isLoop = !!track.metadata.isLoop;
  const resampled = resample(raw, Math.max(spacing, kMinSpacing), isLoop);
  const usable = resampled.length >= minPoints ? resampled : raw;
  const enriched = computeProperties(usable, isLoop, curvatureSmoothing);
  return {
    points: enriched,
    length: enriched.length > 0 ? enriched[enriched.length - 1].s : 0,
    isLoop,
    spacing: Math.max(spacing, kMinSpacing),
  };
}

export function closestPoint(path: Path, position: Vec2): PathSample {
  if (path.points.length === 0) {
    return { point: { x: 0, y: 0 }, s: 0, heading: 0, curvature: 0 };
  }

  let bestDist = Number.POSITIVE_INFINITY;
  let best: PathSample = {
    point: path.points[0],
    s: path.points[0].s,
    heading: path.points[0].heading,
    curvature: path.points[0].curvature,
  };

  const points = path.points;
  const limit = points.length - 1;
  for (let i = 0; i < limit; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const segVec = { x: b.x - a.x, y: b.y - a.y };
    const segLen2 = Math.max(segVec.x * segVec.x + segVec.y * segVec.y, 1e-9);
    const t = clamp(((position.x - a.x) * segVec.x + (position.y - a.y) * segVec.y) / segLen2, 0, 1);
    const proj = { x: a.x + segVec.x * t, y: a.y + segVec.y * t };
    const s = lerp(a.s, b.s, t);
    const d = distance(position, proj);
    if (d < bestDist) {
      bestDist = d;
      best = {
        point: proj,
        s,
        heading: Math.atan2(segVec.y, segVec.x),
        curvature: lerp(a.curvature, b.curvature, t),
      };
    }
  }

  // Closing segment for loops
  if (path.isLoop && points.length >= 2) {
    const a = points[points.length - 1];
    const b = points[0];
    const segVec = { x: b.x - a.x, y: b.y - a.y };
    const segLen2 = Math.max(segVec.x * segVec.x + segVec.y * segVec.y, 1e-9);
    const t = clamp(((position.x - a.x) * segVec.x + (position.y - a.y) * segVec.y) / segLen2, 0, 1);
    const proj = { x: a.x + segVec.x * t, y: a.y + segVec.y * t };
    const s = lerp(a.s, b.s + path.length, t);
    const wrappedS = s >= path.length ? s - path.length : s;
    const d = distance(position, proj);
    if (d < bestDist) {
      best = {
        point: proj,
        s: wrappedS,
        heading: Math.atan2(segVec.y, segVec.x),
        curvature: lerp(a.curvature, b.curvature, t),
      };
    }
  }

  return best;
}

export function sampleAtS(path: Path, sQuery: number): PathSample {
  if (path.points.length === 0) {
    return { point: { x: 0, y: 0 }, s: 0, heading: 0, curvature: 0 };
  }

  const length = path.length;
  let s = path.isLoop ? ((sQuery % length) + length) % length : clamp(sQuery, 0, length);

  // Binary search could be used, but path sizes are modest; linear search is fine.
  const points = path.points;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (s >= a.s && s <= b.s) {
      const t = (s - a.s) / Math.max(b.s - a.s, 1e-9);
      const x = lerp(a.x, b.x, t);
      const y = lerp(a.y, b.y, t);
      const heading = wrapAngle(lerp(a.heading, b.heading, t));
      const curvature = lerp(a.curvature, b.curvature, t);
      return { point: { x, y }, s, heading, curvature };
    }
  }

  const last = points[points.length - 1];
  return { point: last, s: last.s, heading: last.heading, curvature: last.curvature };
}

function orderedCheckpoints(track: TrackDefinition): Vec2[] {
  const cps = (track.metadata.checkpoints ?? []).slice();
  cps.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (cps.length > 0) {
    return cps.map((cp) => cp.position);
  }

  if (track.cones.length > 0) {
    // Fallback: just use cone positions as-is.
    return track.cones.map((c) => ({ x: c.x, y: c.y }));
  }

  // Final fallback: a short straight
  return [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
  ];
}

function resample(points: Vec2[], spacing: number, isLoop: boolean): Vec2[] {
  if (points.length < 2) return points.slice();
  const result: Vec2[] = [];
  const base = points.slice();
  if (isLoop) base.push(points[0]);

  let last = base[0];
  result.push(last);
  let carry = 0;

  for (let i = 1; i < base.length; i += 1) {
    const curr = base[i];
    let seg = distance(last, curr);
    if (seg < 1e-6) continue;
    let dir = normalize({ x: curr.x - last.x, y: curr.y - last.y });
    let remaining = seg;

    while (remaining + carry >= spacing) {
      const step = spacing - carry;
      const next = {
        x: last.x + dir.x * step,
        y: last.y + dir.y * step,
      };
      result.push(next);
      remaining -= step;
      carry = 0;
      last = next;
      seg = remaining;
      dir = normalize({ x: curr.x - last.x, y: curr.y - last.y });
    }

    carry += remaining;
    last = curr;
  }

  if (!isLoop) {
    const tail = points[points.length - 1];
    if (distance(result[result.length - 1], tail) > spacing * 0.1) {
      result.push(tail);
    }
  } else if (result.length > 1) {
    const start = result[0];
    if (distance(result[result.length - 1], start) > spacing * 0.2) {
      result.push(start);
    }
  }

  return result;
}

function computeProperties(points: Vec2[], isLoop: boolean, smoothWindow: number): PathPoint[] {
  if (points.length === 0) return [];

  const enriched: PathPoint[] = [];
  let s = 0;
  for (let i = 0; i < points.length; i += 1) {
    if (i > 0) s += distance(points[i - 1], points[i]);
    const heading =
      i < points.length - 1
        ? Math.atan2(points[i + 1].y - points[i].y, points[i + 1].x - points[i].x)
        : Math.atan2(points[i].y - points[i - 1].y, points[i].x - points[i - 1].x);
    enriched.push({ ...points[i], s, heading, curvature: 0 });
  }

  const n = enriched.length;
  for (let i = 0; i < n; i += 1) {
    const prevIdx = i === 0 ? (isLoop ? n - 2 : 0) : i - 1;
    const nextIdx = i === n - 1 ? (isLoop ? 1 : n - 1) : i + 1;
    const p0 = enriched[prevIdx];
    const p1 = enriched[i];
    const p2 = enriched[nextIdx];
    const curveMag = curvatureFromPoints(p0, p1, p2);
    const v1 = { x: p1.x - p0.x, y: p1.y - p0.y };
    const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
    const cross = v1.x * v2.y - v1.y * v2.x;
    const sign = Math.sign(cross || 0);
    p1.curvature = curveMag * (sign === 0 ? 1 : sign);
  }

  if (smoothWindow > 1) {
    const half = Math.max(1, Math.floor(smoothWindow / 2));
    const smoothed = enriched.map((p, idx) => {
      let sum = 0;
      let count = 0;
      for (let k = -half; k <= half; k += 1) {
        let j = idx + k;
        if (isLoop) {
          j = ((j % n) + n) % n;
        }
        if (j < 0 || j >= n) continue;
        sum += enriched[j].curvature;
        count += 1;
      }
      return { ...p, curvature: count > 0 ? sum / count : p.curvature };
    });
    return smoothed;
  }

  return enriched;
}
