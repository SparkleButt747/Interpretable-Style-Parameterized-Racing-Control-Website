/// <reference lib="webworker" />
import { createMpccSolver, type MpccSolver } from './solver';
import type {
  MpccWorkerRequest,
  MpccWorkerResponse,
  MpccStepResult,
  MpccConfig,
  TrackMap,
} from './types';

type WorkerCtx = DedicatedWorkerGlobalScope & { postMessage: (data: MpccWorkerResponse) => void };

const ctx: WorkerCtx = self as unknown as WorkerCtx;

let solver: MpccSolver | null = null;
let config: MpccConfig | null = null;
let track: TrackMap | null = null;

async function handleInit(msg: Extract<MpccWorkerRequest, { type: 'init' }>) {
  config = msg.config;
  track = msg.track;
  solver = await createMpccSolver(config, track);
  ctx.postMessage({ type: 'ready' });
}

function handleStep(msg: Extract<MpccWorkerRequest, { type: 'step' }>) {
  if (!solver || !config || !track) {
    ctx.postMessage({ type: 'error', message: 'MPCC solver not initialized' });
    return;
  }
  let result: MpccStepResult;
  try {
    result = solver.step(msg.state, msg.timestamp);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.postMessage({ type: 'error', message });
    return;
  }
  ctx.postMessage({ type: 'step_result', result });
}

function handleReset() {
  solver?.reset();
  ctx.postMessage({ type: 'reset_done' });
}

ctx.onmessage = async (event: MessageEvent<MpccWorkerRequest>) => {
  const message = event.data;
  switch (message.type) {
    case 'init':
      await handleInit(message);
      break;
    case 'step':
      handleStep(message);
      break;
    case 'reset':
      handleReset();
      break;
    default:
      ctx.postMessage({ type: 'error', message: `Unknown message type ${(message as any).type}` });
  }
};
