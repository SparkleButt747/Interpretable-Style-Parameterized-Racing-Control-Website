export type VehicleOption = {
  id: number;
  label: string;
  description: string;
  parameterPath: string;
  summary: {
    massKg?: number;
    lengthM?: number;
    widthM?: number;
  };
};

export type VeloxConfigBundle = {
  configRoot: string;
  parameterRoot: string;
  configFiles: Record<string, string>;
  parameterFiles: Record<string, string>;
  vehicles: VehicleOption[];
  tracks: TrackDefinition[];
};

export type Vec2 = {
  x: number;
  y: number;
};

export type TrackCone = Vec2 & {
  id: string;
  tag: string;
  radius: number;
};

export type TrackBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  span: number;
  center: Vec2;
};

export type TrackLine = {
  id: string;
  a: Vec2;
  b: Vec2;
};

export type TrackCheckpoint = {
  id: string;
  position: Vec2;
  order: number;
  radius: number;
};

export type TrackCenterlineSample = {
  s: number;
  position: Vec2;
  tangent: Vec2;
  normal: Vec2;
  curvature: number;
  halfWidth: number;
};

export type TrackMpccMap = {
  length: number;
  resolution: number;
  samples: TrackCenterlineSample[];
};

export type TrackMetadata = {
  bounds: TrackBounds;
  startLine?: TrackLine;
  finishLine?: TrackLine;
  checkpoints: TrackCheckpoint[];
  startPose?: {
    position: Vec2;
    yaw: number;
  };
  isLoop?: boolean;
  note?: string;
  mpccMap?: TrackMpccMap;
};

export type TrackDefinition = {
  id: string;
  label: string;
  description?: string;
  cones: TrackCone[];
  metadata: TrackMetadata;
  isEmpty?: boolean;
  sourceFile?: string;
};
