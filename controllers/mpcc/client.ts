import type {
  MpccConfig,
  MpccState,
  MpccWorkerRequest,
  MpccWorkerResponse,
  MpccStepResult,
  TrackMap,
} from './types';

type Resolver<T> = { resolve: (value: T) => void; reject: (reason?: unknown) => void };

export class MpccControllerClient {
  private worker?: Worker;
  private ready = false;
  private pending: Resolver<MpccStepResult | void> | null = null;

  constructor(private readonly options: { workerFactory?: () => Worker } = {}) {}

  async init(config: MpccConfig, track: TrackMap): Promise<void> {
    this.ensureWorker();
    await this.send({ type: 'init', config, track });
    this.ready = true;
  }

  async step(state: MpccState, timestamp: number): Promise<MpccStepResult> {
    if (!this.ready) {
      throw new Error('MPCC worker not ready; call init() first');
    }
    return this.send({ type: 'step', state, timestamp }) as Promise<MpccStepResult>;
  }

  async reset(): Promise<void> {
    if (!this.worker) return;
    this.ready = false;
    await this.send({ type: 'reset' });
    this.ready = true;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.ready = false;
    this.pending = null;
  }

  private ensureWorker(): void {
    if (this.worker) return;
    if (this.options.workerFactory) {
      this.worker = this.options.workerFactory();
    } else {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    }
    this.worker.onmessage = (event: MessageEvent<MpccWorkerResponse>) => this.handleMessage(event.data);
    this.worker.onerror = (error) => {
      this.pending?.reject(error);
      this.pending = null;
    };
  }

  private send(message: MpccWorkerRequest): Promise<MpccStepResult | void> {
    if (!this.worker) {
      throw new Error('Worker missing');
    }
    if (this.pending) {
      this.pending.reject(new Error('MPCC worker busy'));
    }
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.worker?.postMessage(message);
    });
  }

  private handleMessage(message: MpccWorkerResponse) {
    switch (message.type) {
      case 'ready':
      case 'reset_done':
        this.pending?.resolve();
        break;
      case 'step_result':
        this.pending?.resolve(message.result);
        break;
      case 'error':
        this.pending?.reject(new Error(message.message));
        break;
      default:
        this.pending?.reject(new Error(`Unknown MPCC worker response ${(message as any).type}`));
    }
    this.pending = null;
  }
}
