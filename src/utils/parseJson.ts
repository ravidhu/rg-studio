import type { ImportErrorCode } from '@/i18n/en'
import type { ImportIssue, ImportResult, RgConfig, Selector } from '@/types/model'
import { SELECTOR_REGEX_FIELDS } from '@/types/model'
import { MAX_INPUT_BYTES, MAX_ROWS } from '@/utils/csv'
import { findJsonErrorOffset, lineAndColumn } from '@/utils/jsonLocate'
import { buildTree, emptyConfig, emptyGroup, newId, resolvePath } from '@/utils/tree'

export const FILE_JSON = 'resource-groups.json'
const MAX_DEPTH = 50

const GROUP_KEYS = new Set([
  'name', 'maxQueued', 'hardConcurrencyLimit', 'softConcurrencyLimit', 'softMemoryLimit',
  'softCpuLimit', 'hardCpuLimit', 'hardPhysicalDataScanLimit', 'schedulingPolicy',
  'schedulingWeight', 'jmxExport', 'subGroups',
])
const SELECTOR_KEYS = new Set<string>([...SELECTOR_REGEX_FIELDS, 'queryType', 'clientTags', 'group'])
const ROOT_KEYS = new Set(['rootGroups', 'selectors', 'cpuQuotaPeriod', 'physicalDataScanQuotaPeriod'])

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Builds a configuration from the file-based `resource-groups.json`. Fails
 * closed: a syntax error, a wrong type or a missing required key rejects the
 * whole file. Unknown keys are reported as warnings.
 */
export function parseResourceGroupsJson(text: string): ImportResult {
  const issues: ImportIssue[] = []
  const add = (severity: 'error' | 'warning', code: ImportErrorCode, path: string | null, params: ImportIssue['params'] = {}, line: number | null = null): void => {
    issues.push({ severity, file: FILE_JSON, line, column: path, code, params })
  }
  const fail = (): ImportResult => ({
    ok: false,
    errors: issues.filter((entry) => entry.severity === 'error'),
    warnings: issues.filter((entry) => entry.severity === 'warning'),
  })

  if (text.length > MAX_INPUT_BYTES) {
    add('error', 'tooLarge', null, { maxMb: MAX_INPUT_BYTES / 1024 / 1024 })
    return fail()
  }
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const offset = findJsonErrorOffset(text)
    const where = offset === null ? null : lineAndColumn(text, offset)
    add('error', 'jsonSyntax', where ? `col ${where.column}` : null, { message }, where ? where.line : null)
    return fail()
  }
  if (!isObject(document)) {
    add('error', 'jsonNotObject', '$')
    return fail()
  }
  for (const key of Object.keys(document)) {
    if (!ROOT_KEYS.has(key)) add('warning', 'unknownKey', key)
  }

  const config: RgConfig = emptyConfig()
  let groupCount = 0

  const readString = (source: JsonObject, key: string, path: string): string => {
    const value = source[key]
    if (value === undefined || value === null) return ''
    if (typeof value !== 'string') {
      add('error', 'expectedString', `${path}.${key}`)
      return ''
    }
    return value
  }
  const readInteger = (source: JsonObject, key: string, path: string, required: boolean): string => {
    const value = source[key]
    if (value === undefined || value === null) {
      if (required) add('error', 'missingKey', `${path}.${key}`)
      return ''
    }
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      add('error', 'expectedInteger', `${path}.${key}`)
      return ''
    }
    return String(value)
  }

  const readGroup = (value: unknown, path: string, parentId: string | null, depth: number): void => {
    if (!isObject(value)) {
      add('error', 'expectedObject', path)
      return
    }
    groupCount += 1
    if (depth > MAX_DEPTH || groupCount > MAX_ROWS) {
      if (groupCount === MAX_ROWS + 1 || depth === MAX_DEPTH + 1) add('error', 'tooManyGroups', path, { max: MAX_ROWS, depth: MAX_DEPTH })
      return
    }
    for (const key of Object.keys(value)) {
      if (!GROUP_KEYS.has(key)) add('warning', 'unknownKey', `${path}.${key}`)
    }
    const name = readString(value, 'name', path)
    if (name === '') add('error', 'missingKey', `${path}.name`)
    const group = emptyGroup(name, parentId)
    group.maxQueued = readInteger(value, 'maxQueued', path, true)
    group.hardConcurrencyLimit = readInteger(value, 'hardConcurrencyLimit', path, true)
    group.softConcurrencyLimit = readInteger(value, 'softConcurrencyLimit', path, false)
    group.schedulingWeight = readInteger(value, 'schedulingWeight', path, false)
    group.softMemoryLimit = readString(value, 'softMemoryLimit', path)
    group.softCpuLimit = readString(value, 'softCpuLimit', path)
    group.hardCpuLimit = readString(value, 'hardCpuLimit', path)
    group.hardPhysicalDataScanLimit = readString(value, 'hardPhysicalDataScanLimit', path)
    group.schedulingPolicy = readString(value, 'schedulingPolicy', path)
    const jmx = value.jmxExport
    if (typeof jmx === 'boolean') group.jmxExport = String(jmx)
    else if (jmx !== undefined && jmx !== null) add('error', 'expectedBoolean', `${path}.jmxExport`)
    config.groups.push(group)
    const subGroups = value.subGroups
    if (subGroups === undefined || subGroups === null) return
    if (!Array.isArray(subGroups)) {
      add('error', 'expectedArray', `${path}.subGroups`)
      return
    }
    subGroups.forEach((child: unknown, index) => {
      readGroup(child, `${path}.subGroups[${index}]`, group.id, depth + 1)
    })
  }

  const rootGroups = document.rootGroups
  if (!Array.isArray(rootGroups)) {
    add('error', rootGroups === undefined ? 'missingKey' : 'expectedArray', 'rootGroups')
  } else {
    rootGroups.forEach((group: unknown, index) => {
      readGroup(group, `rootGroups[${index}]`, null, 0)
    })
    if (rootGroups.length === 0) add('error', 'noGroups', 'rootGroups')
  }

  config.global.cpuQuotaPeriod = readString(document, 'cpuQuotaPeriod', '$')
  config.global.physicalDataScanQuotaPeriod = readString(document, 'physicalDataScanQuotaPeriod', '$')

  const tree = buildTree(config.groups)
  const selectors = document.selectors
  if (selectors !== undefined && selectors !== null && !Array.isArray(selectors)) {
    add('error', 'expectedArray', 'selectors')
  } else if (Array.isArray(selectors)) {
    if (selectors.length > MAX_ROWS) add('error', 'tooManyGroups', 'selectors', { max: MAX_ROWS, depth: MAX_DEPTH })
    selectors.slice(0, MAX_ROWS).forEach((value: unknown, index) => {
      const path = `selectors[${index}]`
      if (!isObject(value)) {
        add('error', 'expectedObject', path)
        return
      }
      for (const key of Object.keys(value)) {
        if (!SELECTOR_KEYS.has(key)) add('warning', 'unknownKey', `${path}.${key}`)
      }
      const target = readString(value, 'group', path)
      if (target === '') add('error', 'missingKey', `${path}.group`)
      const node = resolvePath(tree, target)
      let clientTags: string[] = []
      const tags = value.clientTags
      if (Array.isArray(tags) && tags.every((tag) => typeof tag === 'string')) clientTags = tags as string[]
      else if (tags !== undefined && tags !== null) add('error', 'expectedStringArray', `${path}.clientTags`)
      const selector: Selector = {
        id: newId('s'),
        groupId: node ? node.group.id : null,
        unresolvedTarget: node ? '' : target,
        priority: '',
        user: readString(value, 'user', path),
        originalUser: readString(value, 'originalUser', path),
        authenticatedUser: readString(value, 'authenticatedUser', path),
        userGroup: readString(value, 'userGroup', path),
        source: readString(value, 'source', path),
        queryText: readString(value, 'queryText', path),
        queryType: readString(value, 'queryType', path),
        clientTags,
      }
      config.selectors.push(selector)
    })
  }

  if (issues.some((entry) => entry.severity === 'error')) return fail()
  return { ok: true, config, warnings: issues.filter((entry) => entry.severity === 'warning') }
}
