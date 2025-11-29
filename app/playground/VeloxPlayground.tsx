'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, LayoutGroup, motion } from "framer-motion"
import { FiAlertTriangle, FiRefreshCcw, FiTrendingUp } from "react-icons/fi"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ConfigManager, type Fetcher } from "@/velox/io/ConfigManager"
import {
  ControlMode,
  ModelType,
  SimulationDaemon,
  UserInputLimits,
} from "@/velox/simulation/SimulationDaemon"
import type { SimulationTelemetry } from "@/velox/telemetry"
import { SimulationTelemetryState } from "@/velox/telemetry"

import type { VehicleOption, VeloxConfigBundle } from "./types"
import { Separator } from "@/components/ui/separator"

type ControlState = {
  throttle: number
  brake: number
  steering: number
}

const trackScalePx = 12
const trackSizePx = 620
const defaultLimits = new UserInputLimits({
  min_throttle: 0,
  max_throttle: 1,
  min_brake: 0,
  max_brake: 1,
  min_steering_nudge: -1,
  max_steering_nudge: 1,
})

function createLocalFetcher(bundle: VeloxConfigBundle): Fetcher {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const method =
      (init?.method ??
        (input instanceof Request ? input.method : undefined) ??
        "GET")?.toUpperCase() || "GET"
    const url = new URL(input instanceof Request ? input.url : input.toString())
    const path = url.pathname.replace(/^\//, "")
    const bucket =
      url.hostname.includes("parameter") || url.hostname.includes("parameters")
        ? bundle.parameterFiles
        : bundle.configFiles

    if (method === "HEAD") {
      return new Response(null, { status: 200 })
    }

    const body = bucket[path]
    if (!body) {
      return new Response(null, { status: 404, statusText: `Missing config: ${path}` })
    }

    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/plain" },
    })
  }
}

function cloneTelemetry(telemetry: SimulationTelemetry): SimulationTelemetry {
  return {
    pose: { ...telemetry.pose },
    velocity: { ...telemetry.velocity },
    acceleration: { ...telemetry.acceleration },
    traction: { ...telemetry.traction },
    steering: { ...telemetry.steering },
    controller: { ...telemetry.controller },
    powertrain: { ...telemetry.powertrain },
    front_axle: {
      ...telemetry.front_axle,
      left: { ...telemetry.front_axle.left },
      right: { ...telemetry.front_axle.right },
    },
    rear_axle: {
      ...telemetry.rear_axle,
      left: { ...telemetry.rear_axle.left },
      right: { ...telemetry.rear_axle.right },
    },
    totals: { ...telemetry.totals },
    detector_severity: telemetry.detector_severity,
    safety_stage: telemetry.safety_stage,
    detector_forced: telemetry.detector_forced,
    low_speed_engaged: telemetry.low_speed_engaged,
  }
}

function renderSummary(vehicle: VehicleOption): string {
  const parts = []
  if (vehicle.summary.massKg) parts.push(`${vehicle.summary.massKg.toFixed(0)} kg`)
  if (vehicle.summary.lengthM && vehicle.summary.widthM) {
    parts.push(`${vehicle.summary.lengthM.toFixed(2)} m × ${vehicle.summary.widthM.toFixed(2)} m`)
  }
  return parts.join(" · ")
}

export function VeloxPlayground({ bundle }: { bundle: VeloxConfigBundle }) {
  const [selectedVehicle, setSelectedVehicle] = useState<number>(bundle.vehicles[0]?.id ?? 1)
  const [model, setModel] = useState<ModelType>(ModelType.ST)
  const [driftEnabled, setDriftEnabled] = useState(false)
  const [telemetry, setTelemetry] = useState<SimulationTelemetry>(new SimulationTelemetryState())
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const [trace, setTrace] = useState<Array<{ x: number; y: number }>>([])
  const [trackSize, setTrackSize] = useState({ width: trackSizePx, height: (trackSizePx * 3) / 4 })

  const loopCancelRef = useRef<() => void>()
  const simRef = useRef<SimulationDaemon | null>(null)
  const inputRef = useRef<ControlState>({ throttle: 0, brake: 0, steering: 0 })
  const lastFrameRef = useRef<number>(0)
  const driftRef = useRef<boolean>(false)
  const resetRef = useRef<() => void>()
  const trackRef = useRef<HTMLDivElement>(null)

  const fetcher = useMemo(() => createLocalFetcher(bundle), [bundle])

  const handleKeyState = useCallback((keys: Set<string>) => {
    const has = (target: string[]) => target.some((key) => keys.has(key))
    const steering =
      (has(["arrowleft", "a"]) ? -1 : 0) + (has(["arrowright", "d"]) ? 1 : 0)
    const throttle = has(["w", "arrowup"]) ? 1 : 0
    const brake = has(["s", "arrowdown", " "]) ? 1 : 0
    inputRef.current = {
      throttle,
      brake,
      steering: Math.max(-1, Math.min(1, steering)),
    }
  }, [])

  useEffect(() => {
    const keys = new Set<string>()
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
        event.preventDefault()
      }
      if (key === "shift" && !event.repeat) {
        setDriftEnabled((prev) => !prev)
      }
      if (key === "r" && !event.repeat) {
        event.preventDefault()
        resetRef.current?.()
      }
      keys.add(key)
      handleKeyState(keys)
    }
    const up = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      keys.delete(key)
      handleKeyState(keys)
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [handleKeyState])

  const stopLoop = useCallback(() => {
    loopCancelRef.current?.()
    loopCancelRef.current = undefined
  }, [])

  const startLoop = useCallback(() => {
    stopLoop()
    let cancelled = false
    const tick = async (time: number) => {
      if (cancelled || !simRef.current) return
      const dtCandidate = (time - lastFrameRef.current) / 1000
      const dt = Math.min(Math.max(dtCandidate, 0.005), 0.05)
      lastFrameRef.current = time
      try {
        const next = await simRef.current.step({
          control_mode: ControlMode.Keyboard,
          longitudinal: {
            throttle: inputRef.current.throttle,
            brake: inputRef.current.brake,
          },
          steering_nudge: inputRef.current.steering,
          drift_toggle: driftRef.current ? 1 : 0,
          timestamp: time / 1000,
          dt,
        })
        setTelemetry(cloneTelemetry(next))
        setTrace((prev) => {
          const nextTrace = [...prev, { x: next.pose.x, y: next.pose.y }]
          return nextTrace.slice(-140)
        })
        setStatus((prev) => (prev === "ready" ? prev : "ready"))
      } catch (err) {
        const message = err instanceof Error ? err.message : "Simulation step failed"
        setError(message)
        setStatus("error")
        cancelled = true
        return
      }
      frame = requestAnimationFrame(tick)
    }

    let frame = requestAnimationFrame((time) => {
      lastFrameRef.current = time
      tick(time)
    })

    loopCancelRef.current = () => {
      cancelled = true
      if (frame) cancelAnimationFrame(frame)
    }
  }, [stopLoop])

  const rebuildDaemon = useCallback(async () => {
    stopLoop()
    setStatus("loading")
    setError(null)
    setTrace([])

    const configManager = new ConfigManager(bundle.configRoot, bundle.parameterRoot, fetcher)
    const daemon = new SimulationDaemon({
      model,
      vehicle_id: selectedVehicle,
      control_mode: ControlMode.Keyboard,
      drift_enabled: driftRef.current,
      config_manager: configManager,
      limits: defaultLimits,
    })

    try {
      await daemon.ready
      simRef.current = daemon
      const snap = await daemon.snapshot()
      setTelemetry(cloneTelemetry(snap.telemetry))
      setStatus("ready")
      startLoop()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start the simulation daemon"
      setError(message)
      setStatus("error")
    }
  }, [bundle.configRoot, bundle.parameterRoot, fetcher, model, selectedVehicle, startLoop, stopLoop])

  useEffect(() => {
    rebuildDaemon()
    return () => stopLoop()
  }, [rebuildDaemon, stopLoop])

  useEffect(() => {
    driftRef.current = driftEnabled
    if (simRef.current) {
      simRef.current.setDriftEnabled(driftEnabled)
    }
  }, [driftEnabled])

  useEffect(() => {
    const node = trackRef.current
    if (!node) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      setTrackSize({ width, height })
    })

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const pose = telemetry.pose
  const trackPadding = 32
  const trackWidth = Math.max(trackSize.width - trackPadding * 2, 0)
  const trackHeight = Math.max(trackSize.height - trackPadding * 2, 0)
  const originX = trackPadding + trackWidth / 2
  const originY = trackPadding + trackHeight / 2
  const trackX = originX + pose.x * trackScalePx
  const trackY = originY - pose.y * trackScalePx
  const yawDeg = (pose.yaw * 180) / Math.PI
  const speed = telemetry.velocity.speed ?? 0
  const accel = telemetry.acceleration.longitudinal ?? 0
  const slipDeg = ((telemetry.traction.slip_angle ?? 0) * 180) / Math.PI
  const carScale = 0.9 + Math.min(Math.abs(speed) / 24, 0.45)
  const statusTone =
    status === "ready"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100"
      : status === "error"
        ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-100"
        : "bg-amber-100 text-amber-700 dark:bg-amber-400/20 dark:text-amber-200"
  const statusLabel =
    status === "ready" ? "Live" : status === "loading" ? "Loading..." : status === "error" ? "Error" : "Paused"

  const handleReset = useCallback(async () => {
    if (!simRef.current) return
    stopLoop()
    await simRef.current.reset({
      vehicle_id: selectedVehicle,
      model,
      drift_enabled: driftEnabled,
      control_mode: ControlMode.Keyboard,
    })
    const snap = await simRef.current.snapshot()
    setTelemetry(cloneTelemetry(snap.telemetry))
    setTrace([])
    startLoop()
  }, [driftEnabled, model, selectedVehicle, startLoop, stopLoop])

  useEffect(() => {
    resetRef.current = handleReset
  }, [handleReset])

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="rounded-3xl border bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 shadow-lg ring-1 ring-white/10">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Velox Playground</p>
            <h2 className="text-3xl font-semibold text-slate-50">Keyboard-in-the-loop vehicle dynamics</h2>
            <p className="text-sm text-slate-300">
              Choose a vehicle dataset, pick a dynamics model, and drive with <kbd className="rounded bg-white/10 px-1.5">W/S</kbd>{" "}
              for throttle/brake and <kbd className="rounded bg-white/10 px-1.5">A/D</kbd> for steering.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-200">
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 font-semibold text-emerald-200">Real-time loop</span>
            <span className="rounded-full bg-sky-500/20 px-3 py-1 font-semibold text-sky-100">Framer Motion visuals</span>
            <span
              className={cn(
                "rounded-full px-3 py-1 font-semibold",
                statusTone
              )}
            >
              {statusLabel}
            </span>
          </div>
        </div>
        <Separator className="my-4 border-white/10" />
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 shadow-inner ring-1 ring-white/5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-400">Track space</p>
                <p className="text-lg font-semibold text-white">
                  {selectedVehicle ? `Vehicle ${selectedVehicle}` : "Vehicle"} · {model}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-200">
                <span className="rounded-full bg-white/5 px-3 py-1">W/S throttle</span>
                <span className="rounded-full bg-white/5 px-3 py-1">A/D steer</span>
                <span className="rounded-full bg-white/5 px-3 py-1">Space brake</span>
              </div>
            </div>
            <div
              ref={trackRef}
              className="relative mt-4 aspect-[4/3] overflow-hidden rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
            >
              <motion.div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.03), transparent 35%), radial-gradient(circle at 80% 40%, rgba(16,185,129,0.08), transparent 40%)",
                }}
              />
              <div className="absolute inset-8 border border-white/5" />
              {trace.map((point, idx) => {
                const x = originX + point.x * trackScalePx
                const y = originY - point.y * trackScalePx
                const opacity = (idx + 1) / trace.length
                return (
                  <motion.div
                    key={`${point.x}-${point.y}-${idx}`}
                    className="pointer-events-none absolute rounded-full bg-emerald-300"
                    style={{
                      x,
                      y,
                      width: 6,
                      height: 6,
                      opacity: 0.15 + 0.6 * opacity,
                    }}
                    layout
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  />
                )
              })}

              <motion.div
                className="pointer-events-none absolute rounded-full bg-emerald-400/15 blur-3xl"
                style={{
                  x: trackX,
                  y: trackY,
                  width: 110,
                  height: 110,
                  translateX: "-50%",
                  translateY: "-50%",
                }}
                animate={{ scale: carScale * 1.25, opacity: 0.25 + Math.min(Math.abs(speed) / 30, 0.3) }}
                transition={{ type: "spring", stiffness: 110, damping: 18, mass: 0.6 }}
              />

              <motion.svg
                className="pointer-events-none absolute drop-shadow-[0_12px_28px_rgba(14,165,233,0.35)]"
                viewBox="0 0 100 140"
                style={{
                  x: trackX,
                  y: trackY,
                  width: 70,
                  height: 98,
                  translateX: "-50%",
                  translateY: "-50%",
                  originX: "50%",
                  originY: "50%",
                }}
                animate={{ x: trackX, y: trackY, rotate: yawDeg, scale: carScale }}
                transition={{ type: "spring", stiffness: 140, damping: 24, mass: 0.7 }}
              >
                <defs>
                  <linearGradient id="playground-car-body" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#34d399" />
                    <stop offset="100%" stopColor="#0ea5e9" />
                  </linearGradient>
                </defs>
                <motion.polygon
                  points="94,70 26,22 26,118"
                  fill="url(#playground-car-body)"
                  stroke="rgba(255,255,255,0.7)"
                  strokeWidth="4"
                  animate={{ rotate: slipDeg * 0.1 }}
                  transition={{ type: "spring", stiffness: 120, damping: 20 }}
                />
                <motion.polygon
                  points="34,70 22,46 22,94"
                  fill="rgba(255,255,255,0.16)"
                  animate={{ opacity: 0.4 + Math.min(Math.abs(speed) / 14, 0.35) }}
                />
                <motion.circle
                  cx="78"
                  cy="70"
                  r="6"
                  fill="rgba(255,255,255,0.9)"
                  animate={{ scale: 0.9 + Math.min(Math.abs(accel) / 6, 0.3) }}
                  transition={{ type: "spring", stiffness: 140, damping: 16 }}
                />
              </motion.svg>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-200 md:grid-cols-4">
              <StatChip label="Speed" value={`${speed.toFixed(2)} m/s`} />
              <StatChip label="Accel" value={`${accel.toFixed(2)} m/s²`} />
              <StatChip label="Yaw" value={`${yawDeg.toFixed(1)}°`} />
              <StatChip label="Distance" value={`${(telemetry.totals.distance_traveled_m ?? 0).toFixed(1)} m`} />
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-inner ring-1 ring-white/5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-400">Vehicle & model</p>
                <p className="text-lg font-semibold text-white">Loaded directly from config/parameters</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleReset} className="gap-2">
                <FiRefreshCcw className="h-4 w-4" />
                Restart run
              </Button>
            </div>
            <LayoutGroup>
              <div className="grid gap-3 md:grid-cols-2">
                {bundle.vehicles.map((vehicle) => {
                  const active = vehicle.id === selectedVehicle
                  return (
                    <motion.button
                      key={vehicle.id}
                      layout
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setSelectedVehicle(vehicle.id)}
                      className={cn(
                        "w-full rounded-xl border p-4 text-left transition-colors",
                        active
                          ? "border-emerald-400/70 bg-emerald-400/10 shadow-[0_10px_40px_rgba(16,185,129,0.25)]"
                          : "border-white/10 bg-white/5 hover:border-white/20"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-widest text-slate-300">Vehicle {vehicle.id}</p>
                          <p className="text-base font-semibold text-white">{vehicle.label}</p>
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-semibold",
                            active ? "bg-emerald-500/20 text-emerald-100" : "bg-white/10 text-white"
                          )}
                        >
                          {active ? "Selected" : "Load"}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-slate-300">{vehicle.description}</p>
                      {renderSummary(vehicle) && (
                        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                          {renderSummary(vehicle)}
                        </p>
                      )}
                    </motion.button>
                  )
                })}
              </div>
            </LayoutGroup>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Dynamics model</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[ModelType.ST, ModelType.STD].map((option) => (
                  <motion.button
                    key={option}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setModel(option)}
                    className={cn(
                      "rounded-lg px-3 py-1 text-sm font-semibold transition-colors",
                      model === option
                        ? "bg-sky-500/20 text-sky-100 ring-1 ring-sky-400/60"
                        : "bg-white/10 text-white hover:bg-white/20"
                    )}
                  >
                    {option}
                  </motion.button>
                ))}
                <motion.button
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setDriftEnabled((prev) => !prev)}
                  className={cn(
                    "rounded-lg px-3 py-1 text-sm font-semibold transition-colors",
                    driftEnabled
                      ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/60"
                      : "bg-white/10 text-white hover:bg-white/20"
                  )}
                >
                  {driftEnabled ? "Drift guard on" : "Drift guard off"}
                </motion.button>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Input state</p>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <ControlBar label="Throttle" value={inputRef.current.throttle} color="from-emerald-400 to-emerald-300" />
                <ControlBar label="Brake" value={inputRef.current.brake} color="from-rose-400 to-amber-300" />
                <ControlBar
                  label="Steer"
                  value={(inputRef.current.steering + 1) / 2}
                  color="from-sky-400 to-indigo-300"
                  hint={inputRef.current.steering.toFixed(1)}
                />
              </div>
              <p className="mt-2 text-xs text-slate-300">
                Hold <kbd className="rounded bg-white/10 px-1">Shift</kbd> to toggle drift guard, tap{" "}
                <kbd className="rounded bg-white/10 px-1">R</kbd> if you need a fresh reset.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <InfoPanel
                title="Controller output"
                rows={[
                  { label: "Drive force", value: telemetry.controller.drive_force.toFixed(1) + " N" },
                  { label: "Brake force", value: telemetry.controller.brake_force.toFixed(1) + " N" },
                  { label: "SOC", value: ((telemetry.powertrain.soc ?? 0) * 100).toFixed(0) + "%" },
                ]}
              />
              <InfoPanel
                title="Safety"
                rows={[
                  { label: "Stage", value: telemetry.safety_stage },
                  { label: "Detector", value: telemetry.detector_severity.toFixed(2) },
                  { label: "Low speed", value: telemetry.low_speed_engaged ? "Engaged" : "Idle" },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {status === "error" && error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-50"
          >
            <FiAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500 dark:text-amber-200" />
            <div>
              <p className="font-semibold">Simulation hiccup</p>
              <p className="text-sm text-amber-800/80 dark:text-amber-100/80">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <motion.div
      layout
      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"
      transition={{ type: "spring", stiffness: 180, damping: 20 }}
    >
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="text-base font-semibold text-white">{value}</p>
    </motion.div>
  )
}

function ControlBar({
  label,
  value,
  color,
  hint,
}: {
  label: string
  value: number
  color: string
  hint?: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-200">
        <span className="uppercase tracking-[0.2em] text-slate-400">{label}</span>
        <span className="font-semibold text-white">{hint ?? `${Math.round(value * 100)}%`}</span>
      </div>
      <div className="mt-1 h-2 w-full rounded-full bg-white/10">
        <motion.div
          className={cn("h-2 rounded-full bg-gradient-to-r", color)}
          animate={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
          transition={{ type: "spring", stiffness: 180, damping: 20 }}
        />
      </div>
    </div>
  )
}

function InfoPanel({ title, rows }: { title: string; rows: Array<{ label: string; value: string }> }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-2 text-slate-100">
        <FiTrendingUp className="h-4 w-4" />
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <dl className="mt-2 space-y-1 text-sm text-slate-200">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <dt className="text-slate-400">{row.label}</dt>
            <dd className="font-semibold text-white">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
