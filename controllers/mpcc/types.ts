export type Vec2 = { x: number; y: number };

export type MpccState = {
  x: number;
  y: number;
  psi: number;
  v: number;
  delta: number;
};

export type MpccControl = {
  steering_rate: number;
  acceleration: number;
};

export type MpccTrajectoryPoint = {
  s: number;
  position: Vec2;
  heading: number;
  curvature: number;
};

export type TrackSample = {
  s: number;
  center: Vec2;
  tangent: Vec2;
  normal: Vec2;
  curvature: number;
  half_width: number;
};

export type TrackMap = {
  id: string;
  length: number;
  samples: TrackSample[];
  resolution: number;
  is_loop?: boolean;
};

export type MpccWeights = {
  progress: number;
  lateral: number;
  heading: number;
  curvature: number;
  input: number;
  rate: number;
  slack: number;
};

export type MpccBounds = {
  steering_rate: number;
  acceleration: { min: number; max: number };
  steering?: { min: number; max: number };
  slack: number;
};

export type MpccVehicle = {
  wheelbase: number;
  l_r?: number;
};

export type MpccConfig = {
  horizon_steps: number;
  dt: number;
  weights: MpccWeights;
  bounds: MpccBounds;
  vehicle?: MpccVehicle;
  warm_start: boolean;
};

export type MpccInitRequest = {
  type: 'init';
  config: MpccConfig;
  track: TrackMap;
};

export type MpccStepRequest = {
  type: 'step';
  state: MpccState;
  timestamp: number;
};

export type MpccResetRequest = {
  type: 'reset';
};

export type MpccWorkerRequest = MpccInitRequest | MpccStepRequest | MpccResetRequest;

export type MpccStepResult = {
  control: MpccControl;
  horizon: MpccTrajectoryPoint[];
  cost?: number;
  solver_status?: string;
};

export type MpccReadyResponse = { type: 'ready' };
export type MpccStepResponse = { type: 'step_result'; result: MpccStepResult };
export type MpccErrorResponse = { type: 'error'; message: string };
export type MpccResetResponse = { type: 'reset_done' };

export type MpccWorkerResponse = MpccReadyResponse | MpccStepResponse | MpccErrorResponse | MpccResetResponse;
