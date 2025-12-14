import type { TrackDefinition, TrackCenterlineSample, Vec2 as TrackVec2 } from '@/app/playground/types';
import type { TrackMap, TrackSample } from './types';

function convertSamples(samples: TrackCenterlineSample[]): TrackSample[] {
  return samples.map((sample) => ({
    s: sample.s,
    center: sample.position,
    tangent: normalize(sample.tangent),
    normal: normalize(sample.normal),
    curvature: sample.curvature,
    half_width: sample.halfWidth,
  }));
}

function normalize(vec: TrackVec2): TrackVec2 {
  const mag = Math.hypot(vec.x, vec.y);
  if (mag <= 1e-9) return { x: 1, y: 0 };
  return { x: vec.x / mag, y: vec.y / mag };
}

export function toMpccTrack(track: TrackDefinition): TrackMap | null {
  const map = track.metadata.mpccMap;
  if (!map) return null;
  return {
    id: track.id,
    length: map.length,
    resolution: map.resolution,
    samples: convertSamples(map.samples),
    is_loop: track.metadata.isLoop ?? false,
  };
}

export type Projection = {
  s: number;
  lateral: number;
  headingError: number;
  tangent: TrackVec2;
  normal: TrackVec2;
  curvature: number;
  halfWidth: number;
};

function wrapArcLength(s: number, length: number): number {
  if (!(length > 0)) return s;
  const wrapped = s % length;
  return wrapped < 0 ? wrapped + length : wrapped;
}

function wrapAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function findIdxByS(samples: TrackSample[], target: number): number {
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (samples[mid].s < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

export function sampleAtS(track: TrackMap, s: number) {
  const samples = track.samples;
  const length = track.length || (samples.length ? samples[samples.length - 1].s : 0);
  if (samples.length === 0) {
    return {
      s: 0,
      center: { x: 0, y: 0 },
      tangent: { x: 1, y: 0 },
      normal: { x: 0, y: 1 },
      curvature: 0,
      half_width: 1,
    };
  }
  if (samples.length === 1) return samples[0];

  const useLoop = !!track.is_loop && length > 0;
  const target = useLoop ? wrapArcLength(s, length) : clamp(s, 0, Math.max(length, 0));
  const idxHigh = findIdxByS(samples, target);
  const idxLow = idxHigh === 0 ? (useLoop ? samples.length - 1 : 0) : idxHigh - 1;

  const sLow = samples[idxLow].s;
  let sHigh = samples[idxHigh].s;
  if (useLoop && idxHigh === 0) sHigh += length;
  const span = Math.max(1e-6, sHigh - sLow);
  const t = clamp((target - sLow) / span, 0, 1);

  const lerp = (a: number, b: number) => a * (1 - t) + b * t;
  const center = {
    x: lerp(samples[idxLow].center.x, samples[idxHigh].center.x),
    y: lerp(samples[idxLow].center.y, samples[idxHigh].center.y),
  };
  const tangent = normalize({
    x: lerp(samples[idxLow].tangent.x, samples[idxHigh].tangent.x),
    y: lerp(samples[idxLow].tangent.y, samples[idxHigh].tangent.y),
  });
  const normal = normalize({
    x: lerp(samples[idxLow].normal.x, samples[idxHigh].normal.x),
    y: lerp(samples[idxLow].normal.y, samples[idxHigh].normal.y),
  });
  const curvature = lerp(samples[idxLow].curvature, samples[idxHigh].curvature);
  const half_width = lerp(samples[idxLow].half_width, samples[idxHigh].half_width);

  return {
    s: useLoop ? target : Math.max(0, Math.min(length, target)),
    center,
    tangent,
    normal,
    curvature,
    half_width,
  };
}

export function projectToTrack(
  track: TrackMap,
  point: TrackVec2,
  heading: number,
  previousS?: number
): Projection {
  const samples = track.samples;
  const length = track.length || (samples.length ? samples[samples.length - 1].s : 0);
  const useLoop = !!track.is_loop && length > 0;
  const resolution = Math.max(track.resolution || 0.5, 0.05);
  const windowCount = Math.max(10, Math.round(4 / resolution));

  const windowSegments: Array<{ i: number; j: number; s0: number; s1: number; lap: number }> = [];
  const baseLap = previousS !== undefined && useLoop ? Math.floor(previousS / length) : 0;
  const anchor = previousS !== undefined ? previousS : 0;

  const addSegment = (i: number, j: number, lap: number) => {
    const s0Raw = samples[i].s + lap * length;
    let s1Raw = samples[j].s + lap * length;
    if (useLoop && s1Raw < s0Raw) s1Raw += length;
    windowSegments.push({ i, j, s0: s0Raw, s1: s1Raw, lap });
  };

  if (previousS !== undefined && samples.length > 1) {
    const anchorWrapped = useLoop ? wrapArcLength(previousS, length) : clamp(previousS, 0, length);
    const idx = findIdxByS(samples, anchorWrapped);
    const start = idx - windowCount;
    const end = idx + windowCount;
    for (let k = start; k <= end; k += 1) {
      const i = ((k % samples.length) + samples.length) % samples.length;
      const j = (i + 1) % samples.length;
      const lap = useLoop ? baseLap + Math.floor(k / samples.length) : 0;
      addSegment(i, j, lap);
      if (useLoop) addSegment(i, j, lap + 1);
    }
  } else {
    for (let i = 0; i < samples.length - 1; i += 1) addSegment(i, i + 1, 0);
    if (useLoop && samples.length > 1) addSegment(samples.length - 1, 0, 0);
  }

  let best:
    | {
        s: number;
        closest: TrackVec2;
        tangent: TrackVec2;
        normal: TrackVec2;
        curvature: number;
        halfWidth: number;
        score: number;
        distSq: number;
      }
    | null = null;

  const headingWeight = 0.4;
  const backPenaltyScale = 6 * resolution;
  const anchorS = previousS ?? 0;

  for (const seg of windowSegments) {
    const a = samples[seg.i];
    const b = samples[seg.j];
    const ax = a.center.x;
    const ay = a.center.y;
    const bx = b.center.x;
    const by = b.center.y;
    const abx = bx - ax;
    const aby = by - ay;
    const abLenSq = abx * abx + aby * aby;
    if (abLenSq <= 1e-9) continue;
    const apx = point.x - ax;
    const apy = point.y - ay;
    let t = (apx * abx + apy * aby) / abLenSq;
    t = clamp(t, 0, 1);

    const cx = ax + abx * t;
    const cy = ay + aby * t;
    const dx = point.x - cx;
    const dy = point.y - cy;
    const distSq = dx * dx + dy * dy;

    const sOnSeg = seg.s0 + t * (seg.s1 - seg.s0);
    const sVal = useLoop ? sOnSeg : clamp(sOnSeg, 0, length);

    const tangent = normalize({
      x: a.tangent.x * (1 - t) + b.tangent.x * t,
      y: a.tangent.y * (1 - t) + b.tangent.y * t,
    });
    const normal = normalize({
      x: a.normal.x * (1 - t) + b.normal.x * t,
      y: a.normal.y * (1 - t) + b.normal.y * t,
    });
    const curvature = a.curvature * (1 - t) + b.curvature * t;
    const halfWidth = a.half_width * (1 - t) + b.half_width * t;

    const headingErr = wrapAngle(heading - Math.atan2(tangent.y, tangent.x));
    const headingPenalty = (1 - Math.cos(headingErr)) * headingWeight;
    const backward = anchorS !== undefined && sVal < anchorS - backPenaltyScale ? anchorS - sVal : 0;
    const backwardPenalty = backward > 0 ? backward * backward : 0;
    const score = distSq + headingPenalty + backwardPenalty;

    if (!best || score < best.score) {
      best = {
        s: sVal,
        closest: { x: cx, y: cy },
        tangent,
        normal,
        curvature,
        halfWidth,
        score,
        distSq,
      };
    }
  }

  const tryGlobalSearch = () => {
    let global: typeof best = null;
    for (let i = 0; i < samples.length - 1; i += 1) {
      const a = samples[i];
      const b = samples[i + 1];
      const ax = a.center.x;
      const ay = a.center.y;
      const bx = b.center.x;
      const by = b.center.y;
      const abx = bx - ax;
      const aby = by - ay;
      const abLenSq = abx * abx + aby * aby;
      if (abLenSq <= 1e-9) continue;
      const apx = point.x - ax;
      const apy = point.y - ay;
      let t = (apx * abx + apy * aby) / abLenSq;
      t = clamp(t, 0, 1);

      const cx = ax + abx * t;
      const cy = ay + aby * t;
      const dx = point.x - cx;
      const dy = point.y - cy;
      const distSq = dx * dx + dy * dy;
      const sVal = clamp(a.s + t * (b.s - a.s), 0, length);
      if (previousS !== undefined && sVal < previousS) continue;

      const tangent = normalize({
        x: a.tangent.x * (1 - t) + b.tangent.x * t,
        y: a.tangent.y * (1 - t) + b.tangent.y * t,
      });
      const normal = normalize({
        x: a.normal.x * (1 - t) + b.normal.x * t,
        y: a.normal.y * (1 - t) + b.normal.y * t,
      });
      const curvature = a.curvature * (1 - t) + b.curvature * t;
      const halfWidth = a.half_width * (1 - t) + b.half_width * t;
      const headingErr = wrapAngle(heading - Math.atan2(tangent.y, tangent.x));
      const headingPenalty = (1 - Math.cos(headingErr)) * headingWeight;
      const score = distSq + headingPenalty;

      if (!global || score < global.score) {
        global = {
          s: sVal,
          closest: { x: cx, y: cy },
          tangent,
          normal,
          curvature,
          halfWidth,
          score,
          distSq,
        };
      }
    }
    return global;
  };

  const farThresholdSq = 30 * 30;
  if (!useLoop && previousS !== undefined) {
    if (!best || best.s < previousS || best.distSq > farThresholdSq) {
      const globalBest = tryGlobalSearch();
      if (globalBest && globalBest.score < (best?.score ?? Infinity)) {
        best = globalBest;
      }
    }
  }

  const fallback = samples[0];
  let chosen = best ?? {
    s: 0,
    closest: fallback.center,
    tangent: fallback.tangent,
    normal: fallback.normal,
    curvature: fallback.curvature,
    halfWidth: fallback.half_width,
    score: 0,
  };

  if (!useLoop && previousS !== undefined) {
    const minS = Math.max(0, previousS);
    if (chosen.s < minS) {
      const clamped = sampleAtS(track, minS);
      chosen = {
        s: clamped.s,
        closest: clamped.center,
        tangent: clamped.tangent,
        normal: clamped.normal,
        curvature: clamped.curvature,
        halfWidth: clamped.half_width,
        score: chosen.score,
      };
    }
  }

  const dx = point.x - chosen.closest.x;
  const dy = point.y - chosen.closest.y;
  const lateral = dx * chosen.normal.x + dy * chosen.normal.y;
  const headingError = wrapAngle(heading - Math.atan2(chosen.tangent.y, chosen.tangent.x));

  return {
    s: chosen.s,
    lateral,
    headingError,
    tangent: chosen.tangent,
    normal: chosen.normal,
    curvature: chosen.curvature,
    halfWidth: chosen.halfWidth,
  };
}
