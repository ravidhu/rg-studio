import { GROUP_FIELDS, SELECTOR_REGEX_FIELDS, type GlobalProperties, type LoaderOwnership, type ResourceGroup, type RgConfig, type Selector } from '@/types/model'
import { MAX_INPUT_BYTES, MAX_ROWS } from '@/utils/csv'
import type { ReadAs } from '@/utils/importFiles'
import { reserveIds } from '@/utils/tree'
import type { PreferenceStorage } from '@/utils/welcome'

/**
 * The loaded configuration, kept in the storage of this browser so that a
 * reload does not lose it. Only the parsed model and where it came from are
 * stored, never the content of a file. The key carries a version: anything
 * else than this exact shape is discarded and removed, never repaired.
 */
export const CONFIG_KEY = 'rg-studio.config.v1'
const VERSION = 1
/** A stored value larger than this was not written by this page. */
const MAX_STORED_LENGTH = 4 * MAX_INPUT_BYTES
const READ_AS: readonly ReadAs[] = ['fileJson', 'fileYaml', 'dbCsv', 'dbYaml']

export interface StoredSource {
  /** The built-in example is never stored. */
  origin: 'imported' | 'created'
  edited: boolean
  /** What the import was read as, `null` for a configuration started from scratch. */
  readAs: ReadAs | null
  /** Names of the imported files. Their content is not kept. */
  files: string[]
  /** `false` while a configuration started from scratch has no manager chosen yet. */
  managerChosen: boolean
}

export interface StoredConfig {
  config: RgConfig
  source: StoredSource
}

type Json = Record<string, unknown>

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('not a text')
  return value
}

function textOrNull(value: unknown): string | null {
  return value === null ? null : text(value)
}

function integerOrNull(value: unknown): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('not an integer')
  return value
}

function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('not a list')
  return value
}

/** Reads one group, key by key: nothing else than the known fields is carried over. */
function readGroup(value: unknown): ResourceGroup {
  if (!isRecord(value)) throw new Error('not a group')
  const group = {
    id: text(value.id),
    dbId: integerOrNull(value.dbId),
    name: text(value.name),
    parentId: textOrNull(value.parentId),
    missingParentDbId: integerOrNull(value.missingParentDbId),
    environment: text(value.environment),
  } as ResourceGroup
  for (const field of GROUP_FIELDS) group[field] = text(value[field])
  return group
}

function readSelector(value: unknown): Selector {
  if (!isRecord(value)) throw new Error('not a selector')
  const selector = {
    id: text(value.id),
    groupId: textOrNull(value.groupId),
    unresolvedTarget: text(value.unresolvedTarget),
    priority: text(value.priority),
    queryType: text(value.queryType),
    clientTags: list(value.clientTags, MAX_ROWS).map(text),
  } as Selector
  for (const field of SELECTOR_REGEX_FIELDS) selector[field] = text(value[field])
  return selector
}

function readConfig(value: unknown): RgConfig {
  if (!isRecord(value)) throw new Error('not a configuration')
  if (value.mode !== 'file' && value.mode !== 'db') throw new Error('unknown manager')
  let ownership: LoaderOwnership | null = null
  if (value.ownership !== null) {
    if (!isRecord(value.ownership)) throw new Error('not an ownership block')
    const groupIdMin = integerOrNull(value.ownership.groupIdMin)
    const selectorPriorityAbove = integerOrNull(value.ownership.selectorPriorityAbove)
    if (groupIdMin === null || selectorPriorityAbove === null) throw new Error('incomplete ownership block')
    ownership = { groupIdMin, selectorPriorityAbove }
  }
  if (!isRecord(value.global)) throw new Error('no global properties')
  const global: GlobalProperties = {
    cpuQuotaPeriod: text(value.global.cpuQuotaPeriod),
    physicalDataScanQuotaPeriod: text(value.global.physicalDataScanQuotaPeriod),
  }
  const groups = list(value.groups, MAX_ROWS).map(readGroup)
  const selectors = list(value.selectors, MAX_ROWS).map(readSelector)
  if (new Set([...groups, ...selectors].map((item) => item.id)).size !== groups.length + selectors.length) throw new Error('identifier used twice')
  return { mode: value.mode, externalGroups: list(value.externalGroups, MAX_ROWS).map(text), ownership, groups, selectors, global }
}

/** Text written to the storage for a configuration and its source. */
export function serializeStored(stored: StoredConfig): string {
  return JSON.stringify({ version: VERSION, config: stored.config, source: stored.source })
}

/**
 * Reads a stored value back. Fails closed: a value that is not JSON, is of
 * another version, is too large or strays from the model in any way gives
 * `null`, and the caller removes it.
 */
export function parseStored(raw: string): StoredConfig | null {
  try {
    if (raw.length > MAX_STORED_LENGTH) return null
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value) || value.version !== VERSION) return null
    const source = value.source
    if (!isRecord(source)) return null
    const origin = source.origin
    if (origin !== 'imported' && origin !== 'created') return null
    if (typeof source.edited !== 'boolean') return null
    const readAs = READ_AS.find((candidate) => candidate === source.readAs) ?? null
    if (source.readAs !== null && readAs === null) return null
    const managerChosen = source.managerChosen
    if (managerChosen !== undefined && typeof managerChosen !== 'boolean') return null
    return {
      config: readConfig(value.config),
      // A value saved before the question existed carries a manager already: it counts as chosen.
      source: { origin, edited: source.edited, readAs, files: list(source.files, 10).map(text), managerChosen: managerChosen ?? true },
    }
  } catch {
    return null
  }
}

export type StoredState =
  | { state: 'none' }
  | { state: 'restored'; stored: StoredConfig }
  /** Something was stored but could not be trusted: it was removed. */
  | { state: 'discarded' }

/** Configuration stored in this browser, if any. An unusable value is removed on the spot. */
export function loadStored(storage: PreferenceStorage | null): StoredState {
  let raw: string | null
  try {
    raw = storage?.getItem(CONFIG_KEY) ?? null
  } catch {
    return { state: 'none' }
  }
  if (raw === null) return { state: 'none' }
  const stored = parseStored(raw)
  if (stored === null) {
    removeStored(storage)
    return { state: 'discarded' }
  }
  reserveIds([...stored.config.groups, ...stored.config.selectors].map((item) => item.id))
  return { state: 'restored', stored }
}

/** Stores the configuration. `false` when the browser refuses: no storage, blocked, or full. */
export function saveStored(storage: PreferenceStorage | null, stored: StoredConfig): boolean {
  try {
    if (!storage) return false
    storage.setItem(CONFIG_KEY, serializeStored(stored))
    return storage.getItem(CONFIG_KEY) !== null
  } catch {
    return false
  }
}

export function removeStored(storage: PreferenceStorage | null): void {
  try {
    storage?.removeItem(CONFIG_KEY)
  } catch {
    // Nothing to remove when the storage cannot be reached.
  }
}
