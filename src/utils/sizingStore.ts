import type { ClusterSizing } from '@/types/model'
import { DEFAULT_SIZING } from '@/utils/sizing'
import type { PreferenceStorage } from '@/utils/welcome'

/**
 * Cluster size typed in the side menu, kept in this browser as a preference
 * so that a reload does not reset it. It is apart from the configuration:
 * deleting the configuration leaves it. Anything else than five numbers
 * inside the bounds of the fields is removed, and the defaults are used.
 */
export const SIZING_KEY = 'rg-studio.sizing.v1'

/** Bounds of each field, the same as those of the inputs. */
export const SIZING_BOUNDS: Record<keyof ClusterSizing, { min: number; max: number; integer: boolean }> = {
  workers: { min: 1, max: 10000, integer: true },
  vcpuPerWorker: { min: 1, max: 4096, integer: false },
  ramPerWorkerGb: { min: 1, max: 100000, integer: false },
  heapPercent: { min: 1, max: 100, integer: false },
  headroomPercent: { min: 0, max: 99, integer: false },
}

function readSizing(raw: string): ClusterSizing | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const fields = value as Record<string, unknown>
    const out = { ...DEFAULT_SIZING }
    for (const key of Object.keys(SIZING_BOUNDS) as (keyof ClusterSizing)[]) {
      const number = fields[key]
      const bounds = SIZING_BOUNDS[key]
      if (typeof number !== 'number' || !Number.isFinite(number) || number < bounds.min || number > bounds.max) return null
      if (bounds.integer && !Number.isInteger(number)) return null
      out[key] = number
    }
    return out
  } catch {
    return null
  }
}

/** Stored cluster size, or the defaults. An unusable value is removed on the spot. */
export function loadSizing(storage: PreferenceStorage | null): ClusterSizing {
  try {
    const raw = storage?.getItem(SIZING_KEY) ?? null
    if (raw === null) return DEFAULT_SIZING
    const sizing = raw.length > 1000 ? null : readSizing(raw)
    if (sizing === null) storage?.removeItem(SIZING_KEY)
    return sizing ?? DEFAULT_SIZING
  } catch {
    return DEFAULT_SIZING
  }
}

/** Stores the cluster size. A browser that refuses is ignored: the size then lasts for the visit. */
export function saveSizing(storage: PreferenceStorage | null, sizing: ClusterSizing): void {
  try {
    storage?.setItem(SIZING_KEY, JSON.stringify(sizing))
  } catch {
    // The page works without storage.
  }
}
