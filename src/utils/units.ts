/** Parsers for the textual units used by resource group properties. */

const DATA_SIZE_FACTORS: Record<string, number> = {
  B: 1,
  kB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
  PB: 1024 ** 5,
}

const DURATION_SECONDS: Record<string, number> = {
  ns: 1e-9,
  us: 1e-6,
  ms: 1e-3,
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
}

export const BYTES_PER_GB = 1024 ** 3

/** Non-negative integer written with digits only, or `null`. */
export function parseNonNegativeInteger(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d{1,15}$/.test(trimmed)) return null
  return Number(trimmed)
}

/** Data size such as `10GB` or `512MB`, in bytes, or `null` when not parseable. */
export function parseDataSize(text: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s*$/.exec(text)
  if (!match) return null
  const factor = DATA_SIZE_FACTORS[match[2] ?? '']
  if (factor === undefined) return null
  return Number(match[1]) * factor
}

/** Duration such as `1h`, `30m` or `90s`, in seconds, or `null` when not parseable. */
export function parseDuration(text: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s*$/.exec(text)
  if (!match) return null
  const factor = DURATION_SECONDS[match[2] ?? '']
  if (factor === undefined) return null
  return Number(match[1]) * factor
}

export type MemoryLimit =
  | { kind: 'percent'; percent: number }
  | { kind: 'absolute'; bytes: number }

/** `softMemoryLimit`: a percentage of the cluster memory or an absolute size. */
export function parseMemoryLimit(text: string): MemoryLimit | null {
  const percent = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(text)
  if (percent) return { kind: 'percent', percent: Number(percent[1]) }
  const bytes = parseDataSize(text)
  return bytes === null ? null : { kind: 'absolute', bytes }
}

export function parseBoolean(text: string): boolean | null {
  const lowered = text.trim().toLowerCase()
  if (['true', 't', '1'].includes(lowered)) return true
  if (['false', 'f', '0'].includes(lowered)) return false
  return null
}
