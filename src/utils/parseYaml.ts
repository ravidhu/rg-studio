import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument, type Document, type Node } from 'yaml'
import type { ImportErrorCode } from '@/i18n/en'
import type { ImportIssue, ImportResult, ResourceGroup, RgConfig, Selector } from '@/types/model'
import { MAX_INPUT_BYTES, MAX_ROWS } from '@/utils/csv'
import { parseResourceGroupsJson } from '@/utils/parseJson'
import { buildTree, emptyConfig, emptyGroup, newId, resolvePath } from '@/utils/tree'

export const FILE_YAML = 'YAML'

/** Aliases followed in one document before it is refused: a guard against exponential expansion. */
export const MAX_ALIASES = 50
const MAX_DEPTH = 50
/** Keys that could reach the prototype of an object. They are never accepted. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const TEMPLATE = /\{\{|\{%|\{#/

type Scalar = string | number | boolean | null

/** YAML value with the line it starts on, so that every problem can be located. */
type YamlValue =
  | { kind: 'scalar'; value: Scalar; line: number }
  | { kind: 'seq'; items: YamlValue[]; line: number }
  | { kind: 'map'; entries: Map<string, { value: YamlValue; line: number }>; line: number }

class YamlRefusal extends Error {
  readonly code: ImportErrorCode
  readonly line: number | null
  readonly params: ImportIssue['params']

  constructor(code: ImportErrorCode, line: number | null, params: ImportIssue['params'] = {}) {
    super(code)
    this.code = code
    this.line = line
    this.params = params
  }
}

/**
 * Reads YAML text into plain values. Safe by construction: the core schema
 * only (no custom tags, no merge keys), duplicate keys refused, keys that
 * could touch a prototype refused, and a cap on the aliases followed.
 */
function readYaml(text: string): { root: YamlValue } | { issue: ImportIssue } {
  const fail = (code: ImportErrorCode, line: number | null, column: string | null, params: ImportIssue['params'] = {}) => ({
    issue: { severity: 'error' as const, file: FILE_YAML, line, column, code, params },
  })
  if (text.length > MAX_INPUT_BYTES) return fail('tooLarge', null, null, { maxMb: MAX_INPUT_BYTES / 1024 / 1024 })
  const lineCounter = new LineCounter()
  let document: Document
  try {
    document = parseDocument(text, { schema: 'core', version: '1.2', merge: false, uniqueKeys: true, lineCounter, prettyErrors: true })
  } catch (error) {
    return fail('yamlSyntax', null, null, { message: error instanceof Error ? error.message : String(error) })
  }
  const first = document.errors[0]
  if (first) {
    const position = first.linePos?.[0]
    return fail('yamlSyntax', position?.line ?? null, position ? `col ${position.col}` : null, { message: first.message.split('\n')[0] ?? '' })
  }
  // An unknown tag, such as a custom type, is reported as a warning by the parser: refuse it.
  const tagWarning = document.warnings[0]
  if (tagWarning) {
    const position = tagWarning.linePos?.[0]
    return fail('yamlTag', position?.line ?? null, position ? `col ${position.col}` : null, { message: tagWarning.message.split('\n')[0] ?? '' })
  }

  let aliases = 0
  const lineOf = (node: Node | null | undefined): number => (node?.range ? lineCounter.linePos(node.range[0]).line : 1)
  const convert = (node: Node | null, depth: number): YamlValue => {
    if (depth > MAX_DEPTH) throw new YamlRefusal('tooManyGroups', lineOf(node), { max: MAX_ROWS, depth: MAX_DEPTH })
    if (node === null) return { kind: 'scalar', value: null, line: 1 }
    if (isAlias(node)) {
      aliases += 1
      if (aliases > MAX_ALIASES) throw new YamlRefusal('yamlAliasLimit', lineOf(node), { max: MAX_ALIASES })
      const target = node.resolve(document)
      if (!target) throw new YamlRefusal('yamlSyntax', lineOf(node), { message: `unresolved alias ${node.source}` })
      return convert(target, depth + 1)
    }
    const line = lineOf(node)
    if (isScalar(node)) {
      const value: unknown = node.value
      if (value === null || typeof value === 'string' || typeof value === 'boolean') return { kind: 'scalar', value, line }
      if (typeof value === 'number' && Number.isFinite(value)) return { kind: 'scalar', value, line }
      throw new YamlRefusal('yamlUnsupportedValue', line)
    }
    if (isSeq(node)) return { kind: 'seq', items: node.items.map((item) => convert(item as Node | null, depth + 1)), line }
    if (isMap(node)) {
      const entries = new Map<string, { value: YamlValue; line: number }>()
      for (const pair of node.items) {
        const keyNode = pair.key as Node | null
        const keyLine = lineOf(keyNode)
        if (!isScalar(keyNode) || typeof keyNode.value !== 'string') throw new YamlRefusal('yamlKeyNotText', keyLine)
        const key = keyNode.value
        if (FORBIDDEN_KEYS.has(key)) throw new YamlRefusal('yamlForbiddenKey', keyLine, { key })
        entries.set(key, { value: convert(pair.value as Node | null, depth + 1), line: keyLine })
      }
      return { kind: 'map', entries, line }
    }
    throw new YamlRefusal('yamlUnsupportedValue', line)
  }
  try {
    return { root: convert(document.contents, 0) }
  } catch (error) {
    if (error instanceof YamlRefusal) return fail(error.code, error.line, null, error.params)
    throw error
  }
}

/** Plain JSON-like copy of a value, with the line of every path, to reuse the JSON reader. */
function toPlain(value: YamlValue, path: string, lines: Map<string, number>): unknown {
  lines.set(path, value.line)
  if (value.kind === 'scalar') return value.value
  if (value.kind === 'seq') return value.items.map((item, index) => toPlain(item, `${path}[${index}]`, lines))
  const out: Record<string, unknown> = {}
  for (const [key, entry] of value.entries) {
    const childPath = path === '' ? key : `${path}.${key}`
    out[key] = toPlain(entry.value, childPath, lines)
    lines.set(childPath, entry.line)
  }
  return out
}

/** Reports templating left in the text: it is not evaluated, and the value is kept as written. */
function templateWarnings(value: YamlValue, issues: ImportIssue[]): void {
  if (value.kind === 'scalar') {
    if (typeof value.value === 'string' && TEMPLATE.test(value.value)) {
      issues.push({ severity: 'warning', file: FILE_YAML, line: value.line, column: null, code: 'yamlTemplate', params: {} })
    }
  } else if (value.kind === 'seq') {
    value.items.forEach((item) => templateWarnings(item, issues))
  } else {
    for (const entry of value.entries.values()) templateWarnings(entry.value, issues)
  }
}

const LOADER_ROOT_KEYS = new Set(['environment', 'ownership', 'global_properties', 'external_groups', 'groups', 'selectors'])
const LOADER_GROUP_TEXT: Record<string, keyof ResourceGroup> = {
  soft_memory_limit: 'softMemoryLimit',
  scheduling_policy: 'schedulingPolicy',
  soft_cpu_limit: 'softCpuLimit',
  hard_cpu_limit: 'hardCpuLimit',
  hard_physical_data_scan_limit: 'hardPhysicalDataScanLimit',
}
const LOADER_GROUP_INTEGER: Record<string, keyof ResourceGroup> = {
  max_queued: 'maxQueued',
  hard_concurrency_limit: 'hardConcurrencyLimit',
  soft_concurrency_limit: 'softConcurrencyLimit',
  scheduling_weight: 'schedulingWeight',
}
const LOADER_SELECTOR_TEXT: Record<string, keyof Selector> = {
  user_regex: 'user',
  source_regex: 'source',
  query_type: 'queryType',
  user_group_regex: 'userGroup',
  original_user_regex: 'originalUser',
  authenticated_user_regex: 'authenticatedUser',
  query_text_regex: 'queryText',
}

/** Reads the loader format: groups nested under `subgroups` with explicit ids, selectors by group path. */
function readLoader(root: YamlValue & { kind: 'map' }, issues: ImportIssue[]): RgConfig {
  const config: RgConfig = { ...emptyConfig(), mode: 'db' }
  const add = (severity: 'error' | 'warning', code: ImportErrorCode, line: number, column: string | null, params: ImportIssue['params'] = {}): void => {
    issues.push({ severity, file: FILE_YAML, line, column, code, params })
  }
  const text = (value: YamlValue | undefined, line: number, column: string): string | null => {
    if (value === undefined || (value.kind === 'scalar' && value.value === null)) return null
    if (value.kind === 'scalar' && typeof value.value === 'string') return value.value
    add('error', 'expectedString', value.line || line, column)
    return null
  }
  const integer = (value: YamlValue | undefined, line: number, column: string): number | null => {
    if (value === undefined || (value.kind === 'scalar' && value.value === null)) return null
    if (value.kind === 'scalar' && typeof value.value === 'number' && Number.isInteger(value.value)) return value.value
    add('error', 'expectedInteger', value.line || line, column)
    return null
  }

  for (const [key, entry] of root.entries) {
    if (!LOADER_ROOT_KEYS.has(key)) add('warning', 'unknownKeyIgnored', entry.line, key)
  }
  const environment = text(root.entries.get('environment')?.value, root.line, 'environment') ?? ''

  const ownership = root.entries.get('ownership')
  if (ownership) {
    if (ownership.value.kind !== 'map') add('error', 'expectedObject', ownership.line, 'ownership')
    else {
      const low = integer(ownership.value.entries.get('group_id_min')?.value, ownership.line, 'ownership.group_id_min')
      const above = integer(ownership.value.entries.get('selector_priority_above')?.value, ownership.line, 'ownership.selector_priority_above')
      if (low !== null && above !== null) config.ownership = { groupIdMin: low, selectorPriorityAbove: above }
      add('warning', 'yamlOwnership', ownership.line, 'ownership')
    }
  }

  const globals = root.entries.get('global_properties')
  if (globals) {
    if (globals.value.kind !== 'map') add('error', 'expectedObject', globals.line, 'global_properties')
    else {
      for (const [key, entry] of globals.value.entries) {
        const value = text(entry.value, entry.line, `global_properties.${key}`)
        if (key === 'cpu_quota_period') config.global.cpuQuotaPeriod = value ?? ''
        else if (key === 'physical_data_scan_quota_period') config.global.physicalDataScanQuotaPeriod = value ?? ''
        else add('warning', 'unknownGlobalProperty', entry.line, `global_properties.${key}`, { value: key })
      }
    }
  }

  const external = root.entries.get('external_groups')
  if (external) {
    if (external.value.kind !== 'seq') add('error', 'expectedArray', external.line, 'external_groups')
    else {
      external.value.items.forEach((item, index) => {
        const name = text(item, item.line, `external_groups[${index}]`)
        if (name !== null) config.externalGroups.push(name)
      })
    }
  }

  const seenIds = new Set<number>()
  let count = 0
  const readGroup = (value: YamlValue, path: string, parentId: string | null, depth: number): void => {
    if (value.kind !== 'map') {
      add('error', 'expectedObject', value.line, path)
      return
    }
    count += 1
    if (count > MAX_ROWS || depth > MAX_DEPTH) {
      if (count === MAX_ROWS + 1 || depth === MAX_DEPTH + 1) add('error', 'tooManyGroups', value.line, path, { max: MAX_ROWS, depth: MAX_DEPTH })
      return
    }
    const name = text(value.entries.get('name')?.value, value.line, `${path}.name`)
    if (name === null || name === '') add('error', 'missingKey', value.line, `${path}.name`)
    const group = emptyGroup(name ?? '', parentId)
    group.environment = environment
    const id = integer(value.entries.get('id')?.value, value.line, `${path}.id`)
    if (!value.entries.has('id')) add('error', 'missingKey', value.line, `${path}.id`)
    else if (id !== null) {
      if (seenIds.has(id)) add('error', 'duplicateId', value.entries.get('id')?.line ?? value.line, `${path}.id`, { value: id })
      seenIds.add(id)
      group.dbId = id
    }
    for (const [key, entry] of value.entries) {
      const column = `${path}.${key}`
      const textField = LOADER_GROUP_TEXT[key]
      const integerField = LOADER_GROUP_INTEGER[key]
      if (key === 'name' || key === 'id' || key === 'subgroups') continue
      if (textField) {
        const read = text(entry.value, entry.line, column)
        if (read !== null) Object.assign(group, { [textField]: read })
      } else if (integerField) {
        const read = integer(entry.value, entry.line, column)
        if (read !== null) Object.assign(group, { [integerField]: String(read) })
      } else if (key === 'jmx_export') {
        if (entry.value.kind === 'scalar' && typeof entry.value.value === 'boolean') group.jmxExport = String(entry.value.value)
        else if (!(entry.value.kind === 'scalar' && entry.value.value === null)) add('error', 'expectedBoolean', entry.line, column)
      } else {
        add('warning', 'unknownKeyIgnored', entry.line, column)
      }
    }
    for (const required of ['max_queued', 'hard_concurrency_limit']) {
      if (!value.entries.has(required)) add('error', 'missingKey', value.line, `${path}.${required}`)
    }
    config.groups.push(group)
    const subgroups = value.entries.get('subgroups')
    if (!subgroups || (subgroups.value.kind === 'scalar' && subgroups.value.value === null)) return
    if (subgroups.value.kind !== 'seq') {
      add('error', 'expectedArray', subgroups.line, `${path}.subgroups`)
      return
    }
    subgroups.value.items.forEach((child, index) => readGroup(child, `${path}.subgroups[${index}]`, group.id, depth + 1))
  }
  const groups = root.entries.get('groups')
  if (!groups) add('error', 'missingKey', root.line, 'groups')
  else if (groups.value.kind !== 'seq') add('error', 'expectedArray', groups.line, 'groups')
  else {
    groups.value.items.forEach((item, index) => readGroup(item, `groups[${index}]`, null, 0))
    if (groups.value.items.length === 0) add('error', 'noGroups', groups.line, 'groups')
  }

  const tree = buildTree(config.groups)
  const selectors = root.entries.get('selectors')
  if (selectors && selectors.value.kind !== 'seq' && !(selectors.value.kind === 'scalar' && selectors.value.value === null)) {
    add('error', 'expectedArray', selectors.line, 'selectors')
  } else if (selectors && selectors.value.kind === 'seq') {
    selectors.value.items.slice(0, MAX_ROWS).forEach((item, index) => {
      const path = `selectors[${index}]`
      if (item.kind !== 'map') {
        add('error', 'expectedObject', item.line, path)
        return
      }
      const target = text(item.entries.get('group')?.value, item.line, `${path}.group`)
      if (target === null || target === '') add('error', 'missingKey', item.line, `${path}.group`)
      const priority = integer(item.entries.get('priority')?.value, item.line, `${path}.priority`)
      if (!item.entries.has('priority')) add('error', 'missingKey', item.line, `${path}.priority`)
      const node = target === null ? null : resolvePath(tree, target)
      const selector: Selector = {
        id: newId('s'), groupId: node ? node.group.id : null, unresolvedTarget: node ? '' : target ?? '',
        priority: priority === null ? '' : String(priority),
        user: '', originalUser: '', authenticatedUser: '', userGroup: '', source: '', queryText: '', queryType: '', clientTags: [],
      }
      for (const [key, entry] of item.entries) {
        const column = `${path}.${key}`
        const field = LOADER_SELECTOR_TEXT[key]
        if (key === 'group' || key === 'priority') continue
        if (field) {
          const read = text(entry.value, entry.line, column)
          if (read !== null) Object.assign(selector, { [field]: read })
        } else if (key === 'client_tags') {
          if (entry.value.kind === 'seq' && entry.value.items.every((tag) => tag.kind === 'scalar' && typeof tag.value === 'string')) {
            selector.clientTags = entry.value.items.map((tag) => (tag.kind === 'scalar' ? String(tag.value) : ''))
          } else if (!(entry.value.kind === 'scalar' && entry.value.value === null)) {
            add('error', 'expectedStringArray', entry.line, column)
          }
        } else if (key === 'selector_resource_estimate') {
          add('warning', 'ignoredKey', entry.line, column)
        } else {
          add('warning', 'unknownKeyIgnored', entry.line, column)
        }
      }
      config.selectors.push(selector)
    })
  }
  return config
}

/**
 * Builds a configuration from YAML. Two shapes are recognised by their top
 * keys: the YAML form of `resource-groups.json` (`rootGroups`) and the
 * database loader format (`groups` with `subgroups` and explicit ids).
 * Fails closed: a syntax problem, an unsafe key, too many aliases, a wrong
 * type or a missing required key rejects the whole input.
 */
export function parseResourceGroupsYaml(text: string): ImportResult {
  const read = readYaml(text)
  if ('issue' in read) return { ok: false, errors: [read.issue], warnings: [] }
  const root = read.root
  const issues: ImportIssue[] = []
  const finish = (config: RgConfig): ImportResult => {
    const errors = issues.filter((issue) => issue.severity === 'error')
    const warnings = issues.filter((issue) => issue.severity === 'warning')
    return errors.length > 0 ? { ok: false, errors, warnings } : { ok: true, config, warnings }
  }
  if (root.kind !== 'map') {
    issues.push({ severity: 'error', file: FILE_YAML, line: root.line, column: null, code: 'yamlNotMap', params: {} })
    return finish(emptyConfig())
  }
  templateWarnings(root, issues)
  if (root.entries.has('rootGroups')) {
    // Same content as the JSON file: reuse its reader, then give every problem its line in the YAML text.
    const lines = new Map<string, number>()
    const result = parseResourceGroupsJson(JSON.stringify(toPlain(root, '', lines)))
    const locate = (issue: ImportIssue): ImportIssue => ({
      ...issue,
      file: FILE_YAML,
      line: issue.column === null ? issue.line : lines.get(issue.column.replace(/^\$\./, '')) ?? lines.get(issue.column.replace(/\.[^.[\]]+$/, '')) ?? issue.line,
    })
    issues.push(...(result.ok ? [] : result.errors.map(locate)), ...result.warnings.map(locate))
    return finish(result.ok ? result.config : emptyConfig())
  }
  if (root.entries.has('groups')) return finish(readLoader(root, issues))
  issues.push({ severity: 'error', file: FILE_YAML, line: root.line, column: null, code: 'yamlUnknownShape', params: {} })
  return finish(emptyConfig())
}

export type InputFormat = 'json' | 'yaml' | 'csv'

/** Guesses the format of pasted or uploaded text from its first meaningful characters. */
export function detectFormat(text: string): InputFormat {
  const trimmed = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).trimStart()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json'
  const firstLine = (trimmed.split(/\r?\n/, 1)[0] ?? '').toLowerCase()
  // A header line of the resource_groups table: column names separated by a delimiter, no YAML key.
  if (/(^|[",;\t])\s*"?resource_group_id"?\s*([",;\t]|$)/.test(firstLine) && !/^[\w-]+\s*:/.test(firstLine)) return 'csv'
  return 'yaml'
}
