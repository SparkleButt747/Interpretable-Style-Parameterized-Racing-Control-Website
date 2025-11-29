import { promises as fs } from "fs"
import path from "path"

import type { VehicleOption, VeloxConfigBundle } from "./types"

const CONFIG_ROOT = "http://local.velox.config/"
const PARAMETER_ROOT = "http://local.velox.parameters/"

async function readYamlDirectory(dir: string, prefix = ""): Promise<Record<string, string>> {
  const entries = await fs.readdir(dir)
  const files = entries.filter((name) => name.toLowerCase().endsWith(".yaml"))

  const results: Record<string, string> = {}
  for (const name of files) {
    const content = await fs.readFile(path.join(dir, name), "utf-8")
    results[`${prefix}${name}`] = content
  }
  return results
}

function parseScalar(content: string, key: string): number | undefined {
  const pattern = new RegExp(`^\\s*${key}\\s*:\\s*([\\d.eE+-]+)`, "m")
  const match = content.match(pattern)
  if (!match) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) ? value : undefined
}

function extractVehicleMeta(content: string, fallbackLabel: string): Pick<VehicleOption, "label" | "description"> {
  const commentBlob = content
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("#"))
    .slice(0, 6)
    .join(" ")
    .replace(/#+/g, "")
    .trim()

  const sourceMatch = commentBlob.match(/values are taken from (?:a|an)?\s*([^.#]+)/i)
  const name = sourceMatch?.[1]?.trim()
  const label = name ? name : fallbackLabel

  const description =
    name ??
    commentBlob ||
    "Vehicle parameters loaded from the local velox dataset. If values look odd, the parser will still surface them."

  return { label, description }
}

async function loadVehicleOptions(dir: string): Promise<VehicleOption[]> {
  const entries = await fs.readdir(dir)
  const yamlFiles = entries.filter((name) => name.toLowerCase().endsWith(".yaml"))
  const vehicles: VehicleOption[] = []

  for (const file of yamlFiles) {
    const fullPath = path.join(dir, file)
    const content = await fs.readFile(fullPath, "utf-8")
    const idMatch = file.match(/parameters_vehicle(\d+)/i)
    const id = idMatch ? Number(idMatch[1]) : vehicles.length + 1

    const fallbackLabel = `Vehicle ${id}`
    const meta = extractVehicleMeta(content, fallbackLabel)

    vehicles.push({
      id,
      label: meta.label,
      description: meta.description,
      parameterPath: `vehicle/${file}`,
      summary: {
        massKg: parseScalar(content, "m"),
        lengthM: parseScalar(content, "l"),
        widthM: parseScalar(content, "w"),
      },
    })
  }

  return vehicles.sort((a, b) => a.id - b.id)
}

function ensureModelTiming(configFiles: Record<string, string>): void {
  if (configFiles["model_timing.yaml"]) return
  configFiles["model_timing.yaml"] = [
    "mb:",
    "  nominal_dt: 0.005",
    "  max_dt: 0.005",
    "st:",
    "  nominal_dt: 0.01",
    "  max_dt: 0.02",
    "std:",
    "  nominal_dt: 0.01",
    "  max_dt: 0.01",
    "",
  ].join("\n")
}

export async function loadVeloxBundle(): Promise<VeloxConfigBundle> {
  const configDir = path.join(process.cwd(), "config")
  const parameterDir = path.join(process.cwd(), "parameters")

  const configFiles = await readYamlDirectory(configDir)
  ensureModelTiming(configFiles)

  const parameterFiles = {
    ...(await readYamlDirectory(path.join(parameterDir, "tire"), "tire/")),
    ...(await readYamlDirectory(path.join(parameterDir, "vehicle"), "vehicle/")),
  }

  const vehicles = await loadVehicleOptions(path.join(parameterDir, "vehicle"))

  return {
    configRoot: CONFIG_ROOT,
    parameterRoot: PARAMETER_ROOT,
    configFiles,
    parameterFiles,
    vehicles,
  }
}
