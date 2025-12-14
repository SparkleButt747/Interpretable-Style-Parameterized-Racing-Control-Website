import { promises as fs } from "fs";
import path from "path";

import {
  TrackCheckpoint,
  TrackDefinition,
  TrackMetadata,
  Vec2,
  TrackBounds,
  TrackLine,
  TrackCone,
  TrackMpccMap,
  TrackCenterlineSample,
} from "./types";

const TRACK_DIR = "tracks";
const DEFAULT_CONE_RADIUS = 0.35;
const CHECKPOINT_RADIUS = 1.35;
const EMPTY_TRACK_SPAN = 60;
const TRACK_SCALE_FACTOR = 1.75;
const CENTERLINE_RESOLUTION = 0.5;
const MIN_HALF_WIDTH = 0.8;
const TRACK_DESCRIPTION_OVERRIDES: Record<string, string> = {
  acceleration: "Flat straight-line strip for launch and braking tests.",
};

function toLabel(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();
}

function parseCsvCones(content: string): TrackCone[] {
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  const rows = lines.filter((line) => line && !line.toLowerCase().startsWith("tag,"));

  const cones: TrackCone[] = [];
  for (const [idx, row] of rows.entries()) {
    const parts = row.split(",").map((part) => part.trim());
    if (parts.length < 3) continue;
    const [tag, xStr, yStr] = parts;
    const x = Number(xStr);
    const y = Number(yStr);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    cones.push({
      id: `cone-${idx}`,
      tag: tag || "unknown",
      x,
      y,
      radius: DEFAULT_CONE_RADIUS,
    });
  }
  return cones;
}

function computeBounds(cones: TrackCone[]): TrackBounds {
  if (cones.length === 0) {
    const half = EMPTY_TRACK_SPAN / 2;
    return {
      minX: -half,
      maxX: half,
      minY: -half,
      maxY: half,
      width: EMPTY_TRACK_SPAN,
      height: EMPTY_TRACK_SPAN,
      span: EMPTY_TRACK_SPAN,
      center: { x: 0, y: 0 },
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  cones.forEach((cone) => {
    minX = Math.min(minX, cone.x);
    maxX = Math.max(maxX, cone.x);
    minY = Math.min(minY, cone.y);
    maxY = Math.max(maxY, cone.y);
  });
  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    span: Math.max(width, height),
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  };
}

function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function principalAxis(points: Vec2[]): number {
  if (points.length < 2) return 0;
  const mean = points.reduce(
    (acc, p) => ({ x: acc.x + p.x / points.length, y: acc.y + p.y / points.length }),
    { x: 0, y: 0 }
  );
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  points.forEach((p) => {
    const dx = p.x - mean.x;
    const dy = p.y - mean.y;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  });
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return theta;
}

type ConePair = {
  yellow: TrackCone;
  blue: TrackCone;
  midpoint: Vec2;
  distance: number;
};

function nearestPairs(yellows: TrackCone[], blues: TrackCone[]): ConePair[] {
  if (yellows.length === 0 || blues.length === 0) {
    return [];
  }

  const combos: Array<{ yellow: TrackCone; blue: TrackCone; distance: number }> = [];
  yellows.forEach((y) => {
    blues.forEach((b) => {
      const dx = y.x - b.x;
      const dy = y.y - b.y;
      combos.push({
        yellow: y,
        blue: b,
        distance: Math.hypot(dx, dy),
      });
    });
  });

  combos.sort((a, b) => a.distance - b.distance);

  const usedYellows = new Set<string>();
  const usedBlues = new Set<string>();
  const pairs: ConePair[] = [];
  const targetCount = Math.min(yellows.length, blues.length);

  for (const combo of combos) {
    if (pairs.length >= targetCount) break;
    if (usedYellows.has(combo.yellow.id) || usedBlues.has(combo.blue.id)) continue;
    usedYellows.add(combo.yellow.id);
    usedBlues.add(combo.blue.id);
    pairs.push({
      yellow: combo.yellow,
      blue: combo.blue,
      midpoint: midpoint(combo.yellow, combo.blue),
      distance: combo.distance,
    });
  }

  return pairs;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function normalize(vec: Vec2): Vec2 {
  const mag = Math.hypot(vec.x, vec.y);
  if (mag <= 1e-6) return { x: 1, y: 0 };
  return { x: vec.x / mag, y: vec.y / mag };
}

function curvatureAt(prev: Vec2, curr: Vec2, next: Vec2): number {
  const ab = { x: curr.x - prev.x, y: curr.y - prev.y };
  const bc = { x: next.x - curr.x, y: next.y - curr.y };
  const ac = { x: next.x - prev.x, y: next.y - prev.y };
  const cross = ab.x * bc.y - ab.y * bc.x;
  const denom = Math.max(
    1e-6,
    Math.hypot(ab.x, ab.y) * Math.hypot(bc.x, bc.y) * Math.hypot(ac.x, ac.y)
  );
  return (2 * cross) / denom;
}

function buildCenterlineMap(pairs: ConePair[], isLoop: boolean): TrackMpccMap | undefined {
  if (pairs.length < 2) return undefined;

  const midpoints = pairs.map((p) => p.midpoint);
  const widths = pairs.map((p) => p.distance);

  if (isLoop && pairs.length > 2) {
    midpoints.push({ ...midpoints[0] });
    widths.push(widths[0]);
  }

  const arcLengths: number[] = [0];
  for (let i = 1; i < midpoints.length; i += 1) {
    const dx = midpoints[i].x - midpoints[i - 1].x;
    const dy = midpoints[i].y - midpoints[i - 1].y;
    arcLengths[i] = arcLengths[i - 1] + Math.hypot(dx, dy);
  }
  const totalLength = arcLengths[arcLengths.length - 1] ?? 0;
  if (!(totalLength > 0)) return undefined;

  const samples: TrackCenterlineSample[] = [];
  const resolution = CENTERLINE_RESOLUTION;
  const sampleCount = Math.max(2, Math.ceil(totalLength / resolution));
  const targetLengths: number[] = [];
  for (let i = 0; i <= sampleCount; i += 1) {
    targetLengths.push(Math.min(totalLength, i * resolution));
  }
  if (targetLengths[targetLengths.length - 1] !== totalLength) {
    targetLengths.push(totalLength);
  }

  let segIdx = 0;
  targetLengths.forEach((s) => {
    while (segIdx + 1 < arcLengths.length && arcLengths[segIdx + 1] < s) {
      segIdx += 1;
    }
    const nextIdx = Math.min(segIdx + 1, midpoints.length - 1);
    const segLength = Math.max(arcLengths[nextIdx] - arcLengths[segIdx], 1e-6);
    const t = (s - arcLengths[segIdx]) / segLength;
    const a = midpoints[segIdx];
    const b = midpoints[nextIdx];
    const widthA = widths[segIdx] ?? widths[widths.length - 1] ?? MIN_HALF_WIDTH * 2;
    const widthB = widths[nextIdx] ?? widthA;
    const pos = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
    const tangent = normalize({ x: b.x - a.x, y: b.y - a.y });
    const normal = { x: -tangent.y, y: tangent.x };
    const halfWidth = Math.max(MIN_HALF_WIDTH, lerp(widthA, widthB, t) * 0.5);
    samples.push({
      s,
      position: pos,
      tangent,
      normal,
      curvature: 0,
      halfWidth,
    });
  });

  for (let i = 0; i < samples.length; i += 1) {
    const prev = samples[i - 1]?.position ?? samples[i].position;
    const curr = samples[i].position;
    const next = samples[i + 1]?.position ?? samples[i].position;
    samples[i].curvature = curvatureAt(prev, curr, next);
  }

  return {
    length: totalLength,
    resolution,
    samples,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function mixDir(a: Vec2, b: Vec2, t: number): Vec2 {
  const x = a.x * (1 - t) + b.x * t;
  const y = a.y * (1 - t) + b.y * t;
  return normalize({ x, y });
}

function estimateSpacing(checkpoints: TrackCheckpoint[], bounds: TrackBounds): number {
  if (checkpoints.length < 2) return Math.max(1.2, bounds.span / 8);
  let total = 0;
  checkpoints.forEach((cp, idx) => {
    let best = Infinity;
    checkpoints.forEach((other, j) => {
      if (idx === j) return;
      const dx = cp.position.x - other.position.x;
      const dy = cp.position.y - other.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < best) best = dist;
    });
    total += best;
  });
  const avg = total / checkpoints.length;
  return clamp(avg, 0.8, Math.max(12, bounds.span / 3));
}

function reorderCheckpointsWithFov(
  checkpoints: TrackCheckpoint[],
  bounds: TrackBounds,
  startPose?: { position: Vec2; yaw: number }
): TrackCheckpoint[] {
  if (checkpoints.length === 0) return checkpoints;

  const spacing = estimateSpacing(checkpoints, bounds);
  const baseStep = clamp(spacing * 0.3, 0.4, 2.5);
  const baseRange = clamp(spacing * 1.6, spacing * 0.8, bounds.span * 0.6);
  const maxRange = Math.max(baseRange * 2.5, bounds.span);
  const baseHalfAngle = degToRad(65);
  const maxHalfAngle = degToRad(175);

  const unvisited = new Set(checkpoints.map((cp) => cp.id));
  const ordered: TrackCheckpoint[] = [];
  const getById = new Map(checkpoints.map((cp) => [cp.id, cp]));

  let pos = startPose?.position ?? checkpoints[0].position;
  let heading =
    startPose && Number.isFinite(startPose.yaw)
      ? { x: Math.cos(startPose.yaw), y: Math.sin(startPose.yaw) }
      : normalize({
          x: checkpoints[Math.min(1, checkpoints.length - 1)].position.x - pos.x,
          y: checkpoints[Math.min(1, checkpoints.length - 1)].position.y - pos.y,
        });
  let halfAngle = baseHalfAngle;
  let range = baseRange;

  const maxIterations = checkpoints.length * 12;
  let iterations = 0;

  while (unvisited.size > 0 && iterations < maxIterations) {
    iterations += 1;
    const hNorm = normalize(heading);
    const cosHalf = Math.cos(halfAngle);

    const candidates: Array<{ cp: TrackCheckpoint; dist: number; proj: number }> = [];

    unvisited.forEach((id) => {
      const cp = getById.get(id);
      if (!cp) return;
      const dx = cp.position.x - pos.x;
      const dy = cp.position.y - pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-4 || dist > range) return;
      const dot = hNorm.x * dx + hNorm.y * dy;
      if (dot <= 0) return; // behind
      const cosAng = dot / dist;
      if (cosAng < cosHalf) return;
      candidates.push({ cp, dist, proj: dot });
    });

    if (candidates.length === 0) {
      halfAngle = clamp(halfAngle * 1.2, baseHalfAngle, maxHalfAngle);
      range = clamp(range * 1.2, baseRange, maxRange);
      if (halfAngle >= maxHalfAngle && range >= maxRange * 0.95) {
        // Fallback: pick nearest forward-ish checkpoint
        let best: { cp: TrackCheckpoint; score: number; dist: number } | null = null;
        unvisited.forEach((id) => {
          const cp = getById.get(id);
          if (!cp) return;
          const dx = cp.position.x - pos.x;
          const dy = cp.position.y - pos.y;
          const dist = Math.hypot(dx, dy);
          const dot = hNorm.x * dx + hNorm.y * dy;
          const cosAng = dist > 1e-6 ? dot / dist : 1;
          const angPenalty = 1 - clamp(cosAng, -1, 1); // smaller is better (forward)
          const score = angPenalty * 10 + dist;
          if (!best || score < best.score) {
            best = { cp, score, dist };
          }
        });
        if (best) {
          const nextHeading = normalize({
            x: best.cp.position.x - pos.x,
            y: best.cp.position.y - pos.y,
          });
          heading = mixDir(heading, nextHeading, 0.6);
          pos = best.cp.position;
          unvisited.delete(best.cp.id);
          ordered.push(best.cp);
          halfAngle = baseHalfAngle;
          range = baseRange;
          continue;
        }
      }
      continue;
    }

    candidates.sort((a, b) => {
      if (a.proj === b.proj) return a.dist - b.dist;
      return a.proj - b.proj;
    });

    const next = candidates[0];
    const moveDir = normalize({
      x: next.cp.position.x - pos.x,
      y: next.cp.position.y - pos.y,
    });
    heading = mixDir(heading, moveDir, 0.65);

    const advance = Math.min(baseStep, next.dist);
    pos = {
      x: pos.x + moveDir.x * Math.max(advance, 1e-3),
      y: pos.y + moveDir.y * Math.max(advance, 1e-3),
    };

    if (next.dist <= range * 1.05) {
      pos = next.cp.position;
      unvisited.delete(next.cp.id);
      ordered.push(next.cp);
      halfAngle = baseHalfAngle;
      range = baseRange;
    }
  }

  // If anything left (safety cap), append in original order to avoid loss.
  if (unvisited.size > 0) {
    checkpoints.forEach((cp) => {
      if (unvisited.has(cp.id)) {
        ordered.push(cp);
        unvisited.delete(cp.id);
      }
    });
  }

  return ordered.map((cp, idx) => ({ ...cp, order: idx + 1 }));
}

function buildCheckpoints(cones: TrackCone[]): { checkpoints: TrackCheckpoint[]; pairs: ConePair[] } {
  const yellows = cones.filter((c) => c.tag.toLowerCase() === "yellow");
  const blues = cones.filter((c) => c.tag.toLowerCase() === "blue");
  const pairs = nearestPairs(yellows, blues);
  if (pairs.length === 0) {
    return { checkpoints: [], pairs: [] };
  }

  const axis = principalAxis(pairs.map((p) => p.midpoint));
  const dir = { x: Math.cos(axis), y: Math.sin(axis) };
  const sorted = pairs
    .slice()
    .sort(
      (a, b) =>
        a.midpoint.x * dir.x +
        a.midpoint.y * dir.y -
        (b.midpoint.x * dir.x + b.midpoint.y * dir.y)
    );

  const checkpoints: TrackCheckpoint[] = sorted.map((pair, idx) => ({
    id: `cp-${idx}`,
    position: pair.midpoint,
    order: idx + 1,
    radius: CHECKPOINT_RADIUS,
  }));

  return { checkpoints, pairs: sorted };
}

function startFinishFromPairs(
  pairs: ConePair[],
  bounds: TrackBounds
): { start?: TrackLine; finish?: TrackLine; heading: number; isLoop: boolean } {
  if (pairs.length === 0) return { heading: 0, isLoop: false };
  const first = pairs[0];
  const last = pairs[pairs.length - 1];
  const heading =
    pairs.length > 1
      ? Math.atan2(pairs[1].midpoint.y - first.midpoint.y, pairs[1].midpoint.x - first.midpoint.x)
      : 0;
  const startLine: TrackLine = {
    id: "start",
    a: { x: first.yellow.x, y: first.yellow.y },
    b: { x: first.blue.x, y: first.blue.y },
  };
  const finishLine: TrackLine = {
    id: "finish",
    a: { x: last.yellow.x, y: last.yellow.y },
    b: { x: last.blue.x, y: last.blue.y },
  };
  const loopThreshold = Math.max(2.5, bounds.span / 8);
  const loopDistance = Math.hypot(last.midpoint.x - first.midpoint.x, last.midpoint.y - first.midpoint.y);
  const isLoop = pairs.length > 2 && loopDistance <= loopThreshold;

  return {
    start: startLine,
    finish: isLoop ? startLine : finishLine,
    heading: heading !== 0 ? heading : Math.atan2(last.midpoint.y - first.midpoint.y, last.midpoint.x - first.midpoint.x),
    isLoop,
  };
}

function scaleTrack(cones: TrackCone[], factor: number): TrackCone[] {
  if (!cones.length || factor === 1) return cones;
  const bounds = computeBounds(cones);
  const cx = bounds.center.x;
  const cy = bounds.center.y;
  return cones.map((cone) => ({
    ...cone,
    x: cx + (cone.x - cx) * factor,
    y: cy + (cone.y - cy) * factor,
  }));
}

function buildMetadata(cones: TrackCone[], _trackId?: string): TrackMetadata {
  const bounds = computeBounds(cones);
  const { checkpoints, pairs } = buildCheckpoints(cones);
  const { start, finish, heading, isLoop } = startFinishFromPairs(pairs, bounds);
  const nextMidpoint = pairs[1]?.midpoint ?? pairs[0]?.midpoint;
  let startYaw = heading;
  if (start) {
    const lineVec = { x: start.b.x - start.a.x, y: start.b.y - start.a.y };
    const normal = { x: -lineVec.y, y: lineVec.x };
    const target = nextMidpoint ?? { x: start.a.x + normal.x, y: start.a.y + normal.y };
    const dirToTarget = { x: target.x - (start.a.x + start.b.x) / 2, y: target.y - (start.a.y + start.b.y) / 2 };
    const dot = normal.x * dirToTarget.x + normal.y * dirToTarget.y;
    const chosen = dot >= 0 ? normal : { x: -normal.x, y: -normal.y };
    startYaw = Math.atan2(chosen.y, chosen.x);
  }
  const startPose = start
    ? { position: midpoint(start.a, start.b), yaw: startYaw }
    : { position: { x: 0, y: 0 }, yaw: 0 };
  const orderedCheckpoints = reorderCheckpointsWithFov(checkpoints, bounds, startPose);
  const pairById = new Map(pairs.map((pair, idx) => [`cp-${idx}`, pair]));
  const orderedPairs = orderedCheckpoints
    .map((cp) => pairById.get(cp.id))
    .filter((p): p is ConePair => !!p);
  const pairsForMap = orderedPairs.length >= 2 ? orderedPairs : pairs;
  const startIdx = pairsForMap.reduce(
    (best, pair, idx) => {
      const dx = pair.midpoint.x - startPose.position.x;
      const dy = pair.midpoint.y - startPose.position.y;
      const distSq = dx * dx + dy * dy;
      return distSq < best.distSq ? { idx, distSq } : best;
    },
    { idx: 0, distSq: Infinity }
  ).idx;
  const rotatedPairs =
    pairsForMap.length > 0 ? [...pairsForMap.slice(startIdx), ...pairsForMap.slice(0, startIdx)] : pairsForMap;
  const mpccMap = buildCenterlineMap(rotatedPairs, isLoop);

  return {
    bounds,
    startLine: start,
    finishLine: finish,
    checkpoints: orderedCheckpoints,
    startPose,
    isLoop,
    mpccMap,
  };
}

function buildEmptyTrack(): TrackDefinition {
  const bounds = computeBounds([]);
  return {
    id: "empty",
    label: "Free Practice (Empty)",
    description: "Blank grid with no cones for free practice.",
    cones: [],
    metadata: {
      bounds,
      startLine: undefined,
      finishLine: undefined,
      checkpoints: [],
      startPose: { position: { x: 0, y: 0 }, yaw: 0 },
      note: "Empty canvas",
    },
    isEmpty: true,
  };
}

export async function loadTracks(): Promise<TrackDefinition[]> {
  const dir = path.join(process.cwd(), TRACK_DIR);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    console.warn(`[tracks] Unable to read tracks directory: ${err}`);
  }

  const csvFiles = entries.filter((name) => name.toLowerCase().endsWith(".csv")).sort();
  const tracks: TrackDefinition[] = [];

  for (const file of csvFiles) {
    try {
      const content = await fs.readFile(path.join(dir, file), "utf-8");
      const parsedCones = parseCsvCones(content);
      const cones = scaleTrack(parsedCones, TRACK_SCALE_FACTOR);
      const slug = file.replace(/\.csv$/i, "");
      const label = toLabel(slug);
      const metadata = buildMetadata(cones, slug);
      const description = TRACK_DESCRIPTION_OVERRIDES[slug.toLowerCase()] ?? `Track loaded from ${TRACK_DIR}/${file}`;
      tracks.push({
        id: slug,
        label,
        description,
        cones,
        metadata,
        sourceFile: `${TRACK_DIR}/${file}`,
      });
    } catch (err) {
      console.warn(`[tracks] Failed to parse ${file}: ${err}`);
    }
  }

  return [buildEmptyTrack(), ...tracks];
}
