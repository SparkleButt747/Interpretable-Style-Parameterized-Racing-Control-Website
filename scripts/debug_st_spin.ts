import fs from 'fs/promises';
import path from 'path';
import { SimulationDaemon, ControlMode, ModelType, UserInputLimits } from '../velox/simulation/SimulationDaemon';
import { ConfigManager, Fetcher } from '../velox/io/ConfigManager';

const CONFIG_ROOT = 'http://local.velox.config/';
const PARAM_ROOT = 'http://local.velox.parameters/';

const fetcher: Fetcher = async (input) => {
  const url = input.toString();
  let filePath: string;
  if (url.startsWith(CONFIG_ROOT)) {
    filePath = path.join(process.cwd(), url.replace(CONFIG_ROOT, 'config/'));
  } else if (url.startsWith(PARAM_ROOT)) {
    filePath = path.join(process.cwd(), url.replace(PARAM_ROOT, 'parameters/'));
  } else if (url.startsWith('file://')) {
    filePath = new URL(url).pathname;
  } else {
    filePath = path.isAbsolute(url) ? url : path.join(process.cwd(), url);
  }
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat) {
    return new Response('missing', { status: 404 });
  }
  if (stat.isDirectory()) {
    return new Response('', { status: 200 });
  }
  const content = await fs.readFile(filePath, 'utf-8');
  return new Response(content, { status: 200, headers: { 'content-type': 'text/plain' } });
};

function fmt(num: number): string {
  return Number.isFinite(num) ? num.toFixed(4) : 'nan';
}

async function main() {
  const config = new ConfigManager(CONFIG_ROOT, PARAM_ROOT, fetcher);
  const daemon = new SimulationDaemon({
    model: ModelType.ST,
    control_mode: ControlMode.Keyboard,
    config_manager: config,
    limits: new UserInputLimits({
      min_steering_nudge: -3.5,
      max_steering_nudge: 3.5,
      min_steering_rate: -3.5,
      max_steering_rate: 3.5,
      min_accel: -6,
      max_accel: 4,
    }),
  });
  await daemon.ready;

  const steps = 80;
  const input = {
    control_mode: ControlMode.Keyboard,
    longitudinal: { throttle: 0.45, brake: 0 },
    steering_nudge: 2.0,
    timestamp: 0,
    dt: 0.02,
  };

  console.log('step,x,y,yaw,delta,speed');
  for (let k = 0; k < steps; k += 1) {
    input.timestamp = k * input.dt;
    const telem = await daemon.step(input as any);
    const yaw = telem.pose.yaw ?? 0;
    const delta = telem.steering.actual_angle ?? 0;
    const speed = telem.velocity.speed ?? 0;
    console.log(`${k},${fmt(telem.pose.x)},${fmt(telem.pose.y)},${fmt(yaw)},${fmt(delta)},${fmt(speed)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
