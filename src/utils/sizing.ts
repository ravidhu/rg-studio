import type { ClusterSizing } from '@/types/model'
import { BYTES_PER_GB, parseDuration, parseMemoryLimit } from '@/utils/units'

export const DEFAULT_SIZING: ClusterSizing = {
  workers: 3,
  vcpuPerWorker: 16,
  ramPerWorkerGb: 64,
  // The deployment documentation recommends 70 to 85 percent of the node memory.
  heapPercent: 80,
  // Documented default of memory.heap-headroom-per-node: 30 percent of the heap.
  headroomPercent: 30,
}

export interface ClusterTotals {
  vcpus: number
  ramGb: number
  heapGbPerWorker: number
  headroomGbPerWorker: number
  queryMemoryGbPerWorker: number
  /** Memory that the percentages of softMemoryLimit refer to. */
  queryMemoryGb: number
}

export function clusterTotals(sizing: ClusterSizing): ClusterTotals {
  const heapGbPerWorker = (sizing.ramPerWorkerGb * sizing.heapPercent) / 100
  const headroomGbPerWorker = (heapGbPerWorker * sizing.headroomPercent) / 100
  const queryMemoryGbPerWorker = heapGbPerWorker - headroomGbPerWorker
  return {
    vcpus: sizing.workers * sizing.vcpuPerWorker,
    ramGb: sizing.workers * sizing.ramPerWorkerGb,
    heapGbPerWorker,
    headroomGbPerWorker,
    queryMemoryGbPerWorker,
    queryMemoryGb: sizing.workers * queryMemoryGbPerWorker,
  }
}

export interface ResolvedMemory {
  gb: number
  /** Share of the cluster query memory, in percent. */
  percentOfCluster: number
  kind: 'percent' | 'absolute'
}

/** Translates a softMemoryLimit into GB for a given cluster query memory. */
export function resolveMemory(text: string, queryMemoryGb: number): ResolvedMemory | null {
  const limit = parseMemoryLimit(text)
  if (limit === null) return null
  if (limit.kind === 'percent') {
    return { gb: (queryMemoryGb * limit.percent) / 100, percentOfCluster: limit.percent, kind: 'percent' }
  }
  const gb = limit.bytes / BYTES_PER_GB
  return { gb, percentOfCluster: queryMemoryGb > 0 ? (gb / queryMemoryGb) * 100 : 0, kind: 'absolute' }
}

/**
 * Average number of vCPUs a CPU limit allows over the quota period:
 * CPU time divided by the period. `48h` per `1h` is 48 vCPUs.
 */
export function cpuLimitToVcpus(limitText: string, periodText: string): number | null {
  const limit = parseDuration(limitText)
  const period = parseDuration(periodText)
  if (limit === null || period === null || period <= 0) return null
  return limit / period
}
