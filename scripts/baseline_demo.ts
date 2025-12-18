import fs from "fs/promises";
import path from "path";
import { BaselineController, stateFromTelemetry } from "../controllers/baseline";
import { loadTracks } from "../app/playground/loadTracks";
import { ConfigManager, type Fetcher } from "../velox/io/ConfigManager";
import { SimulationDaemon, ControlMode, ModelType, UserInputLimits } from "../velox/simulation/SimulationDaemon";

const CONFIG_ROOT = "http://local.velox.config/";
const PARAM_ROOT = "http://local.velox.parameters/";
const VEHICLE_ID = 2;
const DT = 0.02;
const STEPS = 600;

const fetcher: Fetcher = async (input) => {
  const url = input.toString();
  let filePath: string;
  if (url.startsWith(CONFIG_ROOT)) {
    filePath = path.join(process.cwd(), url.replace(CONFIG_ROOT, "config/"));
  } else if (url.startsWith(PARAM_ROOT)) {
    filePath = path.join(process.cwd(), url.replace(PARAM_ROOT, "parameters/"));
  } else {
    filePath = path.isAbsolute(url) ? url : path.join(process.cwd(), url);
  }
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat) return new Response("missing", { status: 404 });
  if (stat.isDirectory()) return new Response("", { status: 200 });
  const content = await fs.readFile(filePath, "utf-8");
  return new Response(content, { status: 200, headers: { "content-type": "text/plain" } });
};

function initialStateFromTrack(trackId: string) {
  return async (tracksPromise: Promise<ReturnType<typeof loadTracks>>) => {
    const tracks = await tracksPromise;
    const track = tracks.find((t) => t.id === trackId) ?? tracks[0];
    const pose = track?.metadata.startPose;
    return {
      track,
      initial: [
        pose?.position.x ?? 0,
        pose?.position.y ?? 0,
        pose?.yaw ?? 0,
        0,
        0,
      ],
    };
  };
}

async function main() {
  const tracksPromise = loadTracks();
  const config = new ConfigManager(CONFIG_ROOT, PARAM_ROOT, fetcher);
  const params = await config.loadModelParameters(VEHICLE_ID, ModelType.ST);
  const controller = new BaselineController();
  const { track, initial } = await initialStateFromTrack("hairpins_increasing_difficulty")(tracksPromise);
  controller.reset(track, params);

  const limits = new UserInputLimits({
    min_steering_nudge: params.steering.rate_min,
    max_steering_nudge: params.steering.rate_max,
    min_accel: params.accel.min,
    max_accel: params.accel.max,
  });

  const daemon = new SimulationDaemon({
    model: ModelType.ST,
    vehicle_id: VEHICLE_ID,
    control_mode: ControlMode.Keyboard,
    config_manager: config,
    limits,
    initial_state: initial,
    timing: { nominal_dt: DT, max_dt: DT },
  });
  await daemon.ready;

  let telem = await daemon.snapshot();
  let time = 0;
  console.log("step,time,x,y,yaw,speed,target_speed,accel_cmd,steer_rate");
  for (let k = 0; k < STEPS; k += 1) {
    const state = stateFromTelemetry(telem);
    const output = controller.update(state, DT);
    const input = controller.buildKeyboardInput(output, DT, time);
    telem = await daemon.step(input as any);
    if (k % 10 === 0) {
      console.log(
        [
          k,
          time.toFixed(2),
          (telem.pose.x ?? 0).toFixed(3),
          (telem.pose.y ?? 0).toFixed(3),
          (telem.pose.yaw ?? 0).toFixed(3),
          (telem.velocity.speed ?? 0).toFixed(3),
          output.targetSpeed.toFixed(3),
          output.acceleration.toFixed(3),
          output.steeringRate.toFixed(3),
        ].join(",")
      );
    }
    time += DT;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
