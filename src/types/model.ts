import type { ImportErrorCode } from '@/i18n/en'

/**
 * Editable model of a resource group configuration.
 *
 * Property values are kept as the raw text the user typed or imported, so an
 * invalid value can be shown, flagged by the coherence checks and corrected,
 * instead of being silently dropped. An empty string means "not set".
 */

export const GROUP_FIELDS = [
  'softMemoryLimit',
  'maxQueued',
  'softConcurrencyLimit',
  'hardConcurrencyLimit',
  'schedulingPolicy',
  'schedulingWeight',
  'jmxExport',
  'softCpuLimit',
  'hardCpuLimit',
  'hardPhysicalDataScanLimit',
] as const

export type GroupField = (typeof GROUP_FIELDS)[number]

export interface ResourceGroup {
  /** Internal identifier, stable for the lifetime of the page. */
  id: string
  /** `resource_group_id` when the configuration comes from the database tables. */
  dbId: number | null
  name: string
  /** Internal identifier of the parent, `null` for a root group. */
  parentId: string | null
  /** Parent `resource_group_id` that matched no row at import (orphan). */
  missingParentDbId: number | null
  environment: string
  softMemoryLimit: string
  maxQueued: string
  softConcurrencyLimit: string
  hardConcurrencyLimit: string
  schedulingPolicy: string
  schedulingWeight: string
  jmxExport: string
  softCpuLimit: string
  hardCpuLimit: string
  hardPhysicalDataScanLimit: string
}

export const SELECTOR_REGEX_FIELDS = [
  'user',
  'originalUser',
  'authenticatedUser',
  'userGroup',
  'source',
  'queryText',
] as const

export type SelectorRegexField = (typeof SELECTOR_REGEX_FIELDS)[number]

export interface Selector {
  id: string
  /** Internal identifier of the target group, `null` when it could not be resolved. */
  groupId: string | null
  /** Target as written in the input when it matches no group (path or id). */
  unresolvedTarget: string
  /** Database `priority` column. Unused by the file-based manager. */
  priority: string
  user: string
  originalUser: string
  authenticatedUser: string
  userGroup: string
  source: string
  queryText: string
  queryType: string
  clientTags: string[]
}

/** `file`: selectors apply in list order. `db`: by descending priority. */
export type ManagerMode = 'file' | 'db'

export interface GlobalProperties {
  cpuQuotaPeriod: string
  physicalDataScanQuotaPeriod: string
}

/** Scope that a database loader file declares as its own, kept so that it can be exported again. */
export interface LoaderOwnership {
  groupIdMin: number
  selectorPriorityAbove: number
}

export interface RgConfig {
  mode: ManagerMode
  /**
   * Names of groups that exist in the database but are not defined in the
   * loaded file. Selectors may target them. Only the loader format has them.
   */
  externalGroups: string[]
  /** Ownership block of a loader file, `null` for the other formats. */
  ownership: LoaderOwnership | null
  /** Flat list. The order of siblings is the order of this list. */
  groups: ResourceGroup[]
  selectors: Selector[]
  global: GlobalProperties
}

export interface ClusterSizing {
  workers: number
  vcpuPerWorker: number
  ramPerWorkerGb: number
  /** JVM maximum heap as a percentage of the node RAM. */
  heapPercent: number
  /** `memory.heap-headroom-per-node` as a percentage of the JVM heap. */
  headroomPercent: number
}

export const SCHEDULING_POLICIES = ['fair', 'weighted', 'weighted_fair', 'query_priority'] as const
export type SchedulingPolicy = (typeof SCHEDULING_POLICIES)[number]

export const QUERY_TYPES = [
  'SELECT',
  'EXPLAIN',
  'DESCRIBE',
  'INSERT',
  'UPDATE',
  'MERGE',
  'DELETE',
  'ANALYZE',
  'DATA_DEFINITION',
  'ALTER_TABLE_EXECUTE',
] as const

export type Severity = 'error' | 'warning' | 'info'

/** One import problem, located as precisely as the input allows. */
export interface ImportIssue {
  severity: 'error' | 'warning'
  /** Logical file name: `resource-groups.json`, `resource_groups`, `selectors`... */
  file: string
  line: number | null
  column: string | null
  /** Translation key under `importErrors`. */
  code: ImportErrorCode
  params: Record<string, string | number>
}

export type ImportResult =
  | { ok: true; config: RgConfig; warnings: ImportIssue[] }
  | { ok: false; errors: ImportIssue[]; warnings: ImportIssue[] }
