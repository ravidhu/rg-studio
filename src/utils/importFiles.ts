import type { ImportIssue, ImportResult } from '@/types/model'
import { parseDbTables, type DbInputs } from '@/utils/parseDb'
import { parseResourceGroupsJson } from '@/utils/parseJson'
import { detectFormat, parseResourceGroupsYaml } from '@/utils/parseYaml'

/** A file picked or dropped, already read as text in the browser. */
export interface PickedFile {
  name: string
  text: string
}

/** Tables of the database manager, by the name of their dump. */
export type DbTable = 'resource_groups' | 'selectors' | 'resource_groups_global_properties'

/** What a set of files was read as, to be said back to the reader. */
export type FileSetKind = 'json' | 'yaml' | 'csv'

/** Kind of configuration that an import gave: for which manager, and from which files. */
export type ReadAs = 'fileJson' | 'fileYaml' | 'dbCsv' | 'dbYaml'

export type FileSetResult = ImportResult & { kind: FileSetKind | null }

/** What a successful import was read as. The loader form of YAML gives a database configuration. */
export function readAsOf(result: FileSetResult): ReadAs | null {
  if (result.kind === 'csv') return 'dbCsv'
  if (!result.ok || result.kind === null) return null
  if (result.kind === 'json') return 'fileJson'
  return result.config.mode === 'db' ? 'dbYaml' : 'fileYaml'
}

function problem(code: ImportIssue['code'], file: string, params: ImportIssue['params'] = {}, severity: ImportIssue['severity'] = 'error'): ImportIssue {
  return { severity, file, line: null, column: null, code, params }
}

/**
 * Table that a CSV dump holds, from the column names of its first line:
 * the groups table has an identifier and a name, the selectors table an
 * identifier without a name, the global properties a name and a value.
 */
export function tableOfCsv(text: string): DbTable | null {
  const firstLine = ((text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).trimStart().split(/\r?\n/, 1)[0] ?? '').toLowerCase()
  const columns = new Set(firstLine.split(/[,;\t]/).map((column) => column.trim().replace(/^"|"$/g, '')))
  if (columns.has('resource_group_id')) return columns.has('name') ? 'resource_groups' : 'selectors'
  if (columns.has('name') && columns.has('value')) return 'resource_groups_global_properties'
  return null
}

function isCsv(file: PickedFile): boolean {
  return /\.(csv|tsv)$/i.test(file.name) || (!/\.(json|ya?ml)$/i.test(file.name) && tableOfCsv(file.text) !== null)
}

/**
 * Reads the files of one import: a single JSON or YAML file, or the CSV
 * dumps of the database tables picked together. Fails closed, and names the
 * file or the table at fault: a set that mixes formats, a table given twice,
 * a dump that is no known table or a missing groups table import nothing.
 */
export function importFiles(files: readonly PickedFile[]): FileSetResult {
  const first = files[0]
  if (!first) return { ok: false, kind: null, errors: [problem('filesNone', '')], warnings: [] }
  const tables = files.filter(isCsv)
  if (tables.length === 0) {
    if (files.length > 1) return { ok: false, kind: null, errors: [problem('filesMixed', files.map((file) => file.name).join(', '))], warnings: [] }
    const kind = detectFormat(first.text) === 'json' ? 'json' : 'yaml'
    return { ...(kind === 'json' ? parseResourceGroupsJson(first.text) : parseResourceGroupsYaml(first.text)), kind }
  }
  if (tables.length !== files.length) return { ok: false, kind: null, errors: [problem('filesMixed', files.map((file) => file.name).join(', '))], warnings: [] }

  const errors: ImportIssue[] = []
  const found = new Map<DbTable, PickedFile>()
  for (const file of tables) {
    const table = tableOfCsv(file.text)
    if (table === null) {
      errors.push(problem('tableUnknown', file.name))
      continue
    }
    const earlier = found.get(table)
    if (earlier) errors.push(problem('tableTwice', file.name, { table, other: earlier.name }))
    else found.set(table, file)
  }
  const groups = found.get('resource_groups')
  if (!groups) errors.push(problem('tableMissing', tables.map((file) => file.name).join(', '), { table: 'resource_groups' }))
  if (errors.length > 0 || !groups) return { ok: false, kind: 'csv', errors, warnings: [] }

  const inputs: DbInputs = { resourceGroups: groups.text }
  const selectors = found.get('selectors')
  const globals = found.get('resource_groups_global_properties')
  if (selectors) inputs.selectors = selectors.text
  if (globals) inputs.globalProperties = globals.text
  const result = parseDbTables(inputs)
  // Selectors are optional for the parser, but a configuration without them routes nothing: say that the table was not given.
  const warnings = selectors ? result.warnings : [...result.warnings, problem('tableNotGiven', groups.name, { table: 'selectors' }, 'warning')]
  return { ...result, warnings, kind: 'csv' }
}
