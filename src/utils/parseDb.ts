import type { ImportErrorCode } from '@/i18n/en'
import type { ImportIssue, ImportResult, ResourceGroup, RgConfig, Selector } from '@/types/model'
import { MAX_INPUT_BYTES, parseCsv, type CsvRow } from '@/utils/csv'
import { emptyConfig, emptyGroup, newId } from '@/utils/tree'
import { parseBoolean } from '@/utils/units'

export const FILE_RESOURCE_GROUPS = 'resource_groups'
export const FILE_SELECTORS = 'selectors'
export const FILE_GLOBAL_PROPERTIES = 'resource_groups_global_properties'

type ColumnKind = 'integer' | 'text' | 'boolean'

interface ColumnSpec {
  kind: ColumnKind
  required: boolean
}

const GROUP_COLUMNS: Record<string, ColumnSpec> = {
  resource_group_id: { kind: 'integer', required: true },
  name: { kind: 'text', required: true },
  max_queued: { kind: 'integer', required: true },
  hard_concurrency_limit: { kind: 'integer', required: true },
  soft_concurrency_limit: { kind: 'integer', required: false },
  soft_memory_limit: { kind: 'text', required: false },
  scheduling_policy: { kind: 'text', required: false },
  scheduling_weight: { kind: 'integer', required: false },
  jmx_export: { kind: 'boolean', required: false },
  soft_cpu_limit: { kind: 'text', required: false },
  hard_cpu_limit: { kind: 'text', required: false },
  parent: { kind: 'integer', required: false },
  environment: { kind: 'text', required: false },
  hard_physical_data_scan_limit: { kind: 'text', required: false },
}

const SELECTOR_COLUMNS: Record<string, ColumnSpec> = {
  resource_group_id: { kind: 'integer', required: true },
  priority: { kind: 'integer', required: false },
  user_regex: { kind: 'text', required: false },
  source_regex: { kind: 'text', required: false },
  query_type: { kind: 'text', required: false },
  client_tags: { kind: 'text', required: false },
  selector_resource_estimate: { kind: 'text', required: false },
  user_group_regex: { kind: 'text', required: false },
  original_user_regex: { kind: 'text', required: false },
  authenticated_user_regex: { kind: 'text', required: false },
  query_text_regex: { kind: 'text', required: false },
}

const GLOBAL_COLUMNS: Record<string, ColumnSpec> = {
  name: { kind: 'text', required: true },
  value: { kind: 'text', required: false },
}

interface TypedRow {
  line: number
  values: Record<string, string | null>
}

interface TableRead {
  rows: TypedRow[]
  issues: ImportIssue[]
}

/** Reads one CSV dump and validates its structure and column types. */
function readTable(text: string, file: string, columns: Record<string, ColumnSpec>): TableRead {
  const issues: ImportIssue[] = []
  const issue = (code: ImportErrorCode, line: number | null, column: string | null, params: ImportIssue['params'] = {}): void => {
    issues.push({ severity: 'error', file, line, column, code, params })
  }
  if (text.length > MAX_INPUT_BYTES) {
    issue('tooLarge', null, null, { maxMb: MAX_INPUT_BYTES / 1024 / 1024 })
    return { rows: [], issues }
  }
  const table = parseCsv(text)
  for (const error of table.errors) issue(error.code, error.line, null, error.params)
  if (table.errors.length > 0) return { rows: [], issues }

  for (const [name, spec] of Object.entries(columns)) {
    if (spec.required && !table.header.includes(name)) issue('missingColumn', 1, name)
  }
  for (const name of table.header) {
    if (!(name in columns)) {
      issues.push({ severity: 'warning', file, line: 1, column: name, code: 'unknownColumn', params: {} })
    }
  }
  if (issues.some((entry) => entry.severity === 'error')) return { rows: [], issues }

  const rows = table.rows.map((row: CsvRow): TypedRow => {
    const values: Record<string, string | null> = {}
    table.header.forEach((name, index) => {
      const spec = columns[name]
      if (!spec) return
      const value = row.cells[index]?.value ?? null
      if (value === null || (value.trim() === '' && spec.kind !== 'text')) {
        if (spec.required) issue('missingValue', row.line, name)
        values[name] = null
        return
      }
      if (spec.kind === 'integer' && !/^-?\d{1,15}$/.test(value.trim())) {
        issue('notInteger', row.line, name, { value })
      } else if (spec.kind === 'boolean' && parseBoolean(value) === null) {
        issue('notBoolean', row.line, name, { value })
      }
      values[name] = spec.kind === 'text' ? value : value.trim()
    })
    return { line: row.line, values }
  })
  return { rows, issues }
}

function hasErrors(issues: readonly ImportIssue[]): boolean {
  return issues.some((entry) => entry.severity === 'error')
}

function parseClientTags(raw: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((tag) => typeof tag === 'string')) {
      return parsed as string[]
    }
    return null
  } catch {
    return null
  }
}

export interface DbInputs {
  resourceGroups: string
  selectors?: string
  globalProperties?: string
}

/**
 * Builds a configuration from CSV dumps of the database tables. Fails closed:
 * any structural or type error in any table rejects the whole import.
 */
export function parseDbTables(inputs: DbInputs): ImportResult {
  const issues: ImportIssue[] = []
  const config: RgConfig = { ...emptyConfig(), mode: 'db' }

  const groupTable = readTable(inputs.resourceGroups, FILE_RESOURCE_GROUPS, GROUP_COLUMNS)
  issues.push(...groupTable.issues)
  const byDbId = new Map<number, ResourceGroup>()
  const parentOf = new Map<string, number>()
  if (!hasErrors(groupTable.issues)) {
    for (const row of groupTable.rows) {
      const text = (column: string): string => row.values[column] ?? ''
      const dbId = Number(row.values.resource_group_id)
      if (byDbId.has(dbId)) {
        issues.push({ severity: 'error', file: FILE_RESOURCE_GROUPS, line: row.line, column: 'resource_group_id', code: 'duplicateId', params: { value: dbId } })
        continue
      }
      const jmx = row.values.jmx_export
      const group: ResourceGroup = {
        ...emptyGroup(text('name'), null),
        dbId,
        environment: text('environment'),
        softMemoryLimit: text('soft_memory_limit'),
        maxQueued: text('max_queued'),
        softConcurrencyLimit: text('soft_concurrency_limit'),
        hardConcurrencyLimit: text('hard_concurrency_limit'),
        schedulingPolicy: text('scheduling_policy'),
        schedulingWeight: text('scheduling_weight'),
        jmxExport: jmx === null || jmx === undefined ? '' : String(parseBoolean(jmx)),
        softCpuLimit: text('soft_cpu_limit'),
        hardCpuLimit: text('hard_cpu_limit'),
        hardPhysicalDataScanLimit: text('hard_physical_data_scan_limit'),
      }
      const parent = row.values.parent
      if (parent !== null && parent !== undefined) parentOf.set(group.id, Number(parent))
      byDbId.set(dbId, group)
      config.groups.push(group)
    }
    // Parents are linked after every row is read: a child may precede its parent.
    for (const group of config.groups) {
      const parentDbId = parentOf.get(group.id)
      if (parentDbId === undefined) continue
      const parent = byDbId.get(parentDbId)
      if (parent) group.parentId = parent.id
      else group.missingParentDbId = parentDbId
    }
    if (config.groups.length === 0) {
      issues.push({ severity: 'error', file: FILE_RESOURCE_GROUPS, line: null, column: null, code: 'noGroups', params: {} })
    }
  }

  if (inputs.selectors !== undefined && inputs.selectors.trim() !== '') {
    const selectorTable = readTable(inputs.selectors, FILE_SELECTORS, SELECTOR_COLUMNS)
    issues.push(...selectorTable.issues)
    if (!hasErrors(selectorTable.issues)) {
      for (const row of selectorTable.rows) {
        const text = (column: string): string => row.values[column] ?? ''
        const targetDbId = Number(row.values.resource_group_id)
        const target = byDbId.get(targetDbId)
        let clientTags: string[] = []
        const rawTags = row.values.client_tags
        if (rawTags !== null && rawTags !== undefined && rawTags.trim() !== '') {
          const parsed = parseClientTags(rawTags)
          if (parsed === null) {
            issues.push({ severity: 'error', file: FILE_SELECTORS, line: row.line, column: 'client_tags', code: 'badClientTags', params: { value: rawTags } })
          } else {
            clientTags = parsed
          }
        }
        if (text('selector_resource_estimate') !== '') {
          issues.push({ severity: 'warning', file: FILE_SELECTORS, line: row.line, column: 'selector_resource_estimate', code: 'ignoredColumn', params: {} })
        }
        const selector: Selector = {
          id: newId('s'),
          groupId: target ? target.id : null,
          unresolvedTarget: target ? '' : String(targetDbId),
          priority: text('priority'),
          user: text('user_regex'),
          originalUser: text('original_user_regex'),
          authenticatedUser: text('authenticated_user_regex'),
          userGroup: text('user_group_regex'),
          source: text('source_regex'),
          queryText: text('query_text_regex'),
          queryType: text('query_type'),
          clientTags,
        }
        config.selectors.push(selector)
      }
    }
  }

  if (inputs.globalProperties !== undefined && inputs.globalProperties.trim() !== '') {
    const globalTable = readTable(inputs.globalProperties, FILE_GLOBAL_PROPERTIES, GLOBAL_COLUMNS)
    issues.push(...globalTable.issues)
    if (!hasErrors(globalTable.issues)) {
      for (const row of globalTable.rows) {
        const name = (row.values.name ?? '').trim()
        const value = row.values.value ?? ''
        if (name === 'cpu_quota_period') config.global.cpuQuotaPeriod = value
        else if (name === 'physical_data_scan_quota_period') config.global.physicalDataScanQuotaPeriod = value
        else {
          issues.push({ severity: 'warning', file: FILE_GLOBAL_PROPERTIES, line: row.line, column: 'name', code: 'unknownGlobalProperty', params: { value: name } })
        }
      }
    }
  }

  const warnings = issues.filter((entry) => entry.severity === 'warning')
  const errors = issues.filter((entry) => entry.severity === 'error')
  return errors.length > 0 ? { ok: false, errors, warnings } : { ok: true, config, warnings }
}
