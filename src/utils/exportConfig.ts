import { stringify } from 'yaml'
import type { ResourceGroup, RgConfig, Selector } from '@/types/model'
import { orderedSelectors } from '@/utils/selectors'
import { buildTree, flattenTree, type TreeNode } from '@/utils/tree'
import { parseBoolean } from '@/utils/units'

type JsonValue = string | number | boolean | JsonValue[] | { [key: string]: JsonValue }

/** Integers are written as numbers. Anything else is kept as typed, to stay visible. */
function integerOrText(text: string): JsonValue {
  return /^\d{1,15}$/.test(text.trim()) ? Number(text.trim()) : text
}

function groupToJson(node: TreeNode): { [key: string]: JsonValue } {
  const group = node.group
  const out: { [key: string]: JsonValue } = { name: group.name }
  const setText = (key: string, value: string): void => {
    if (value.trim() !== '') out[key] = value.trim()
  }
  const setInteger = (key: string, value: string): void => {
    if (value.trim() !== '') out[key] = integerOrText(value)
  }
  setText('softMemoryLimit', group.softMemoryLimit)
  setInteger('softConcurrencyLimit', group.softConcurrencyLimit)
  setInteger('hardConcurrencyLimit', group.hardConcurrencyLimit)
  setInteger('maxQueued', group.maxQueued)
  setText('softCpuLimit', group.softCpuLimit)
  setText('hardCpuLimit', group.hardCpuLimit)
  setText('hardPhysicalDataScanLimit', group.hardPhysicalDataScanLimit)
  setText('schedulingPolicy', group.schedulingPolicy)
  setInteger('schedulingWeight', group.schedulingWeight)
  const jmx = parseBoolean(group.jmxExport)
  if (jmx !== null) out.jmxExport = jmx
  if (node.children.length > 0) out.subGroups = node.children.map(groupToJson)
  return out
}

function selectorToJson(selector: Selector, path: string): { [key: string]: JsonValue } {
  const out: { [key: string]: JsonValue } = {}
  const setText = (key: string, value: string): void => {
    if (value !== '') out[key] = value
  }
  setText('user', selector.user)
  setText('originalUser', selector.originalUser)
  setText('authenticatedUser', selector.authenticatedUser)
  setText('userGroup', selector.userGroup)
  setText('source', selector.source)
  setText('queryText', selector.queryText)
  setText('queryType', selector.queryType.trim())
  if (selector.clientTags.length > 0) out.clientTags = [...selector.clientTags]
  out.group = path
  return out
}

/** `resource-groups.json` for the file-based manager. Selectors are written in evaluation order. */
export function exportJson(config: RgConfig): string {
  return `${JSON.stringify(fileDocument(config), null, 2)}\n`
}

/** Database identifier of every group: its own when it has one, else the next free number. */
function assignDbIds(nodes: readonly TreeNode[]): Map<string, number> {
  const used = new Set<number>()
  for (const node of nodes) if (node.group.dbId !== null) used.add(node.group.dbId)
  let next = 1
  const idOf = new Map<string, number>()
  for (const node of nodes) {
    if (node.group.dbId !== null) {
      idOf.set(node.group.id, node.group.dbId)
      continue
    }
    while (used.has(next)) next += 1
    used.add(next)
    idOf.set(node.group.id, next)
  }
  return idOf
}

/** A selector that targets a declared external group, with its position in evaluation order. */
export interface ExternalSelector {
  position: number
  target: string
}

function targetsExternalGroup(config: RgConfig, selector: Selector, tree: ReturnType<typeof buildTree>): boolean {
  const node = selector.groupId === null ? undefined : tree.byId.get(selector.groupId)
  return !node && config.externalGroups.includes(selector.unresolvedTarget)
}

/**
 * Selectors whose target exists only in the database, outside the loaded
 * file. The file format cannot reference such a group, so the file exports
 * leave these selectors out and the export panel lists them beforehand.
 */
export function externalSelectors(config: RgConfig): ExternalSelector[] {
  const tree = buildTree(config.groups)
  const out: ExternalSelector[] = []
  orderedSelectors(config).forEach((selector, index) => {
    if (targetsExternalGroup(config, selector, tree)) out.push({ position: index + 1, target: selector.unresolvedTarget })
  })
  return out
}

/** The JSON document of the file-based manager, as a plain value. */
function fileDocument(config: RgConfig): { [key: string]: JsonValue } {
  const tree = buildTree(config.groups)
  const document: { [key: string]: JsonValue } = {
    rootGroups: tree.roots.map(groupToJson),
    selectors: orderedSelectors(config)
      // A file can only name its own groups: a selector on an external group would not load.
      .filter((selector) => !targetsExternalGroup(config, selector, tree))
      .map((selector) => {
        const node = selector.groupId === null ? undefined : tree.byId.get(selector.groupId)
        return selectorToJson(selector, node ? node.path : selector.unresolvedTarget)
      }),
  }
  if (config.global.cpuQuotaPeriod.trim() !== '') document.cpuQuotaPeriod = config.global.cpuQuotaPeriod.trim()
  if (config.global.physicalDataScanQuotaPeriod.trim() !== '') {
    document.physicalDataScanQuotaPeriod = config.global.physicalDataScanQuotaPeriod.trim()
  }
  return document
}

/** `resource-groups.json` content written as YAML, for the file-based manager. */
export function exportFileYaml(config: RgConfig): string {
  return stringify(fileDocument(config), { lineWidth: 0 })
}

/**
 * Database loader format: groups nested under `subgroups` with explicit ids,
 * selectors by group path and priority. The ownership block is the one that
 * was imported, or a block that covers exactly what is written.
 */
export function exportLoaderYaml(config: RgConfig, environment: string): string {
  const tree = buildTree(config.groups)
  const nodes = flattenTree(tree.roots)
  const idOf = assignDbIds(nodes)
  const ordered = orderedSelectors(config)
  const priorityOf = (selector: Selector, index: number): number =>
    config.mode === 'db' && /^-?\d+$/.test(selector.priority.trim()) ? Number(selector.priority.trim()) : ordered.length - index
  const groupOf = (node: TreeNode): { [key: string]: JsonValue } => {
    const group = node.group
    const out: { [key: string]: JsonValue } = { name: group.name, id: idOf.get(group.id) ?? 0 }
    const text = (key: string, value: string): void => {
      if (value.trim() !== '') out[key] = value.trim()
    }
    const integer = (key: string, value: string): void => {
      if (value.trim() !== '') out[key] = integerOrText(value)
    }
    text('scheduling_policy', group.schedulingPolicy)
    text('soft_memory_limit', group.softMemoryLimit)
    integer('soft_concurrency_limit', group.softConcurrencyLimit)
    integer('hard_concurrency_limit', group.hardConcurrencyLimit)
    integer('max_queued', group.maxQueued)
    integer('scheduling_weight', group.schedulingWeight)
    text('soft_cpu_limit', group.softCpuLimit)
    text('hard_cpu_limit', group.hardCpuLimit)
    text('hard_physical_data_scan_limit', group.hardPhysicalDataScanLimit)
    const jmx = parseBoolean(group.jmxExport)
    if (jmx !== null) out.jmx_export = jmx
    if (node.children.length > 0) out.subgroups = node.children.map(groupOf)
    return out
  }
  const selectors: JsonValue[] = []
  const priorities: number[] = []
  ordered.forEach((selector, index) => {
    const node = selector.groupId === null ? undefined : tree.byId.get(selector.groupId)
    const target = node ? node.path : config.externalGroups.includes(selector.unresolvedTarget) ? selector.unresolvedTarget : null
    // A selector whose target is neither a group of the file nor a declared external group cannot be written.
    if (target === null) return
    const out: { [key: string]: JsonValue } = { group: target, priority: priorityOf(selector, index) }
    priorities.push(priorityOf(selector, index))
    const text = (key: string, value: string): void => {
      if (value !== '') out[key] = value
    }
    text('user_regex', selector.user)
    text('original_user_regex', selector.originalUser)
    text('authenticated_user_regex', selector.authenticatedUser)
    text('user_group_regex', selector.userGroup)
    text('source_regex', selector.source)
    text('query_text_regex', selector.queryText)
    text('query_type', selector.queryType.trim())
    if (selector.clientTags.length > 0) out.client_tags = [...selector.clientTags]
    selectors.push(out)
  })
  const ids = [...idOf.values()]
  const document: { [key: string]: JsonValue } = {
    environment,
    ownership: {
      group_id_min: config.ownership?.groupIdMin ?? (ids.length > 0 ? Math.min(...ids) : 1),
      selector_priority_above: config.ownership?.selectorPriorityAbove ?? (priorities.length > 0 ? Math.min(...priorities) - 1 : 0),
    },
  }
  const globals: { [key: string]: JsonValue } = {}
  if (config.global.cpuQuotaPeriod.trim() !== '') globals.cpu_quota_period = config.global.cpuQuotaPeriod.trim()
  if (config.global.physicalDataScanQuotaPeriod.trim() !== '') globals.physical_data_scan_quota_period = config.global.physicalDataScanQuotaPeriod.trim()
  if (Object.keys(globals).length > 0) document.global_properties = globals
  if (config.externalGroups.length > 0) document.external_groups = [...config.externalGroups]
  document.groups = tree.roots.map(groupOf)
  document.selectors = selectors
  return stringify(document, { lineWidth: 0 })
}

/** SQL string literal. Quotes are doubled, the only escape standard SQL needs. */
function sqlText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function sqlTextOrNull(value: string): string {
  return value.trim() === '' ? 'NULL' : sqlText(value.trim())
}

function sqlIntegerOrNull(value: string): string {
  return /^-?\d{1,15}$/.test(value.trim()) ? value.trim() : 'NULL'
}

/**
 * Identifier of a group that the script does not create, looked up in the
 * database by its name, its parent and its environment, one level per name
 * of the path. Names are written as quoted literals only.
 */
function sqlExternalGroupId(path: string, environment: string): string {
  let lookup: string | null = null
  for (const name of path.split('.')) {
    const parent: string = lookup === null ? 'parent IS NULL' : `parent = ${lookup}`
    lookup = `(SELECT resource_group_id FROM resource_groups WHERE name = ${sqlText(name)} AND ${parent} AND environment = ${sqlText(environment)})`
  }
  return lookup ?? 'NULL'
}

/**
 * INSERT statements for the database manager tables, with explicit
 * identifiers so that parents can be referenced. Parents come before children.
 */
export function exportSql(config: RgConfig, environment: string): string {
  const tree = buildTree(config.groups)
  const nodes = flattenTree(tree.roots)
  const idOf = assignDbIds(nodes)
  const lines: string[] = []
  const period = config.global.cpuQuotaPeriod.trim()
  const scanPeriod = config.global.physicalDataScanQuotaPeriod.trim()
  if (period !== '') {
    lines.push(`INSERT INTO resource_groups_global_properties (name, value) VALUES ('cpu_quota_period', ${sqlText(period)});`)
  }
  if (scanPeriod !== '') {
    lines.push(`INSERT INTO resource_groups_global_properties (name, value) VALUES ('physical_data_scan_quota_period', ${sqlText(scanPeriod)});`)
  }
  if (lines.length > 0) lines.push('')
  const groupColumns = 'resource_group_id, name, soft_memory_limit, max_queued, soft_concurrency_limit, hard_concurrency_limit, scheduling_policy, scheduling_weight, jmx_export, soft_cpu_limit, hard_cpu_limit, hard_physical_data_scan_limit, parent, environment'
  for (const node of nodes) {
    const group: ResourceGroup = node.group
    const parent = group.parentId === null ? undefined : idOf.get(group.parentId)
    const jmx = parseBoolean(group.jmxExport)
    const values = [
      String(idOf.get(group.id)),
      sqlText(group.name),
      sqlTextOrNull(group.softMemoryLimit),
      sqlIntegerOrNull(group.maxQueued),
      sqlIntegerOrNull(group.softConcurrencyLimit),
      sqlIntegerOrNull(group.hardConcurrencyLimit),
      sqlTextOrNull(group.schedulingPolicy),
      sqlIntegerOrNull(group.schedulingWeight),
      jmx === null ? 'NULL' : String(jmx),
      sqlTextOrNull(group.softCpuLimit),
      sqlTextOrNull(group.hardCpuLimit),
      sqlTextOrNull(group.hardPhysicalDataScanLimit),
      parent === undefined ? 'NULL' : String(parent),
      sqlText(environment),
    ]
    lines.push(`INSERT INTO resource_groups (${groupColumns}) VALUES (${values.join(', ')});`)
  }
  lines.push('')
  const ordered = orderedSelectors(config)
  const selectorColumns = 'resource_group_id, priority, user_regex, original_user_regex, authenticated_user_regex, user_group_regex, source_regex, query_text_regex, query_type, client_tags'
  ordered.forEach((selector, index) => {
    const ownTarget = selector.groupId === null ? undefined : idOf.get(selector.groupId)
    // A declared external group already exists in the database: its identifier is looked up by name.
    const target =
      ownTarget !== undefined
        ? String(ownTarget)
        : targetsExternalGroup(config, selector, tree) ? sqlExternalGroupId(selector.unresolvedTarget, environment) : undefined
    // A selector whose target is unknown cannot be written: it would break the load.
    if (target === undefined) {
      lines.push(`-- skipped selector ${index + 1}: target group not found`)
      return
    }
    // The first selector gets the highest priority, to keep the evaluation order.
    const priority = config.mode === 'db' && /^-?\d+$/.test(selector.priority.trim()) ? selector.priority.trim() : String(ordered.length - index)
    const values = [
      target,
      priority,
      sqlTextOrNull(selector.user),
      sqlTextOrNull(selector.originalUser),
      sqlTextOrNull(selector.authenticatedUser),
      sqlTextOrNull(selector.userGroup),
      sqlTextOrNull(selector.source),
      sqlTextOrNull(selector.queryText),
      sqlTextOrNull(selector.queryType),
      selector.clientTags.length > 0 ? sqlText(JSON.stringify(selector.clientTags)) : 'NULL',
    ]
    lines.push(`INSERT INTO selectors (${selectorColumns}) VALUES (${values.join(', ')});`)
  })
  return `${lines.join('\n')}\n`
}
