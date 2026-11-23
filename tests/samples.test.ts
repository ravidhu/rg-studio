import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { RgConfig } from '@/types/model'
import { runChecks } from '@/utils/checks'
import { CONFIG_KEY, loadStored, parseStored, removeStored, saveStored, serializeStored, type StoredConfig } from '@/utils/configStore'
import { exportJson, exportLoaderYaml, exportSql, externalSelectors } from '@/utils/exportConfig'
import { importFiles } from '@/utils/importFiles'
import { parseDbTables } from '@/utils/parseDb'
import { parseResourceGroupsJson } from '@/utils/parseJson'
import { parseResourceGroupsYaml } from '@/utils/parseYaml'
import { orderedSelectors } from '@/utils/selectors'
import { DEFAULT_SIZING } from '@/utils/sizing'
import { buildTree, flattenTree } from '@/utils/tree'

const ENVIRONMENT = 'example'

function fixture(set: string, file: string): string {
  return readFileSync(new URL(`./fixtures/samples/${set}/${file}`, import.meta.url), 'utf8')
}

function ok(result: ReturnType<typeof parseResourceGroupsJson>): RgConfig {
  if (!result.ok) throw new Error(`import failed: ${JSON.stringify(result.errors)}`)
  return result.config
}

function load(set: string): { json: RgConfig; csv: RgConfig; yaml: RgConfig } {
  return {
    json: ok(parseResourceGroupsJson(fixture(set, 'resource-groups.json'))),
    csv: ok(parseDbTables({ resourceGroups: fixture(set, 'resource_groups.csv'), selectors: fixture(set, 'selectors.csv') })),
    yaml: ok(parseResourceGroupsYaml(fixture(set, 'resource_groups.yaml'))),
  }
}

interface ViewOptions {
  /** Compare database ids and environments (formats of the database manager only). */
  db?: boolean
  /** Compare selector priorities (database formats only; the JSON file has none). */
  priority?: boolean
}

/** Format-independent view of a configuration: groups by path in tree order, selectors in evaluation order. */
function view(config: RgConfig, options: ViewOptions = {}) {
  const tree = buildTree(config.groups)
  const groups = flattenTree(tree.roots).map(({ group, path }) => ({
    path,
    softMemoryLimit: group.softMemoryLimit,
    maxQueued: group.maxQueued,
    softConcurrencyLimit: group.softConcurrencyLimit,
    hardConcurrencyLimit: group.hardConcurrencyLimit,
    schedulingPolicy: group.schedulingPolicy,
    schedulingWeight: group.schedulingWeight,
    jmxExport: group.jmxExport,
    softCpuLimit: group.softCpuLimit,
    hardCpuLimit: group.hardCpuLimit,
    hardPhysicalDataScanLimit: group.hardPhysicalDataScanLimit,
    ...(options.db ? { dbId: group.dbId, environment: group.environment } : {}),
  }))
  const selectors = orderedSelectors(config).map((selector) => ({
    target: selector.groupId === null ? selector.unresolvedTarget : tree.byId.get(selector.groupId)?.path,
    user: selector.user,
    source: selector.source,
    queryType: selector.queryType,
    clientTags: selector.clientTags,
    ...(options.priority ? { priority: selector.priority } : {}),
  }))
  return { groups, selectors, global: config.global }
}

function findingCounts(config: RgConfig): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const finding of runChecks(config, DEFAULT_SIZING)) counts[finding.code] = (counts[finding.code] ?? 0) + 1
  return counts
}

function counts(config: RgConfig): { groups: number; roots: number; leaves: number; selectors: number } {
  const tree = buildTree(config.groups)
  const nodes = flattenTree(tree.roots)
  return {
    groups: nodes.length,
    roots: tree.roots.length,
    leaves: nodes.filter((node) => node.children.length === 0).length,
    selectors: config.selectors.length,
  }
}

const EXTERNAL_GROUPS = ['ops', 'refresh', 'shared']

describe.each([
  { set: 'current', yamlCounts: { groups: 12, roots: 4, leaves: 9, selectors: 13 } },
  { set: 'proposal', yamlCounts: { groups: 9, roots: 1, leaves: 6, selectors: 13 } },
])('sample configuration $set', ({ set, yamlCounts }) => {
  const { json, csv, yaml } = load(set)

  it('parses every format with the expected counts', () => {
    expect(json.mode).toBe('file')
    expect(csv.mode).toBe('db')
    expect(yaml.mode).toBe('db')
    expect(counts(json)).toEqual({ groups: 12, roots: 4, leaves: 9, selectors: 13 })
    expect(counts(csv)).toEqual({ groups: 12, roots: 4, leaves: 9, selectors: 13 })
    expect(counts(yaml)).toEqual(yamlCounts)
    expect(csv.selectors.every((selector) => selector.groupId !== null)).toBe(true)
    expect(csv.groups.every((group) => group.environment === ENVIRONMENT)).toBe(true)
  })

  it('has the same content in the JSON file and the CSV dumps', () => {
    expect(view(csv)).toEqual(view(json))
  })

  it('has the same content in the loader YAML, apart from the external groups', () => {
    const fromYaml = view(yaml, { db: true, priority: true })
    const fromCsv = view(csv, { db: true, priority: true })
    if (set === 'proposal') {
      // The loader file declares the three roots outside the ownership range as external: their selectors
      // target them by name, and the groups themselves are only in the JSON and CSV views.
      expect(yaml.externalGroups).toEqual(EXTERNAL_GROUPS)
      expect(yaml.ownership).toEqual({ groupIdMin: 10, selectorPriorityAbove: 77 })
      expect(fromYaml.groups).toEqual(fromCsv.groups.filter((group) => !EXTERNAL_GROUPS.includes(group.path)))
      expect(fromYaml.selectors).toEqual(fromCsv.selectors)
    } else {
      expect(yaml.externalGroups).toEqual([])
      expect(yaml.ownership).toEqual({ groupIdMin: 1, selectorPriorityAbove: 90 })
      expect(fromYaml).toEqual(fromCsv)
    }
  })

  it('round-trips through the JSON export', () => {
    expect(view(ok(parseResourceGroupsJson(exportJson(csv))))).toEqual(view(json))
    // Selectors on external groups cannot be named in a file: the file export leaves them out and
    // loads again with every target resolved, and the SQL export looks the group up by name.
    const external = externalSelectors(yaml)
    expect(external.length).toBe(set === 'proposal' ? 4 : 0)
    const fileAgain = ok(parseResourceGroupsJson(exportJson(yaml)))
    expect(fileAgain.selectors.length).toBe(yaml.selectors.length - external.length)
    expect(fileAgain.selectors.every((selector) => selector.groupId !== null)).toBe(true)
    const sql = exportSql(yaml, ENVIRONMENT)
    expect(sql).not.toContain('skipped selector')
    expect((sql.match(/\(SELECT resource_group_id FROM resource_groups WHERE name = '[a-z]+' AND parent IS NULL AND environment = 'example'\), /g) ?? []).length).toBe(external.length)
  })

  it('round-trips through the loader YAML export', () => {
    const again = ok(parseResourceGroupsYaml(exportLoaderYaml(yaml, ENVIRONMENT)))
    expect(view(again, { db: true, priority: true })).toEqual(view(yaml, { db: true, priority: true }))
    expect(again.externalGroups).toEqual(yaml.externalGroups)
    expect(again.ownership).toEqual(yaml.ownership)
  })

  it('reads a set of files as one import, and names the table that is missing or given twice', () => {
    const groups = { name: 'resource_groups.csv', text: fixture(set, 'resource_groups.csv') }
    const selectors = { name: 'selectors.csv', text: fixture(set, 'selectors.csv') }
    // The file names do not matter: each dump is recognised from its columns, in any order.
    const pair = importFiles([{ ...selectors, name: 'b.csv' }, { ...groups, name: 'a.csv' }])
    expect(pair).toMatchObject({ ok: true, kind: 'csv' })
    if (pair.ok) expect(view(pair.config)).toEqual(view(csv))
    const alone = importFiles([groups])
    expect(alone.ok && alone.config.selectors.length).toBe(0)
    expect(alone.warnings.map((issue) => [issue.code, issue.params.table])).toContainEqual(['tableNotGiven', 'selectors'])
    const noGroups = importFiles([selectors])
    expect(noGroups.ok).toBe(false)
    if (!noGroups.ok) expect(noGroups.errors.map((issue) => [issue.code, issue.params.table])).toEqual([['tableMissing', 'resource_groups']])
    const twice = importFiles([groups, { ...groups, name: 'copy.csv' }])
    if (!twice.ok) expect(twice.errors.map((issue) => issue.code)).toEqual(['tableTwice'])
    expect(importFiles([groups, { name: 'resource-groups.json', text: fixture(set, 'resource-groups.json') }]).ok).toBe(false)
    expect(importFiles([{ name: 'resource-groups.json', text: fixture(set, 'resource-groups.json') }])).toMatchObject({ ok: true, kind: 'json' })
    expect(importFiles([{ name: 'resource_groups.yaml', text: fixture(set, 'resource_groups.yaml') }])).toMatchObject({ ok: true, kind: 'yaml' })
  })

  it('saves the model in the browser and restores it identical, and discards anything else', () => {
    const items = new Map<string, string>()
    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => { items.set(key, value) },
      removeItem: (key: string) => { items.delete(key) },
    }
    for (const config of [json, csv, yaml]) {
      const stored: StoredConfig = { config, source: { origin: 'imported', edited: true, readAs: 'dbCsv', files: ['a.csv', 'b.csv'], managerChosen: true } }
      expect(saveStored(storage, stored)).toBe(true)
      expect([...items.keys()]).toEqual([CONFIG_KEY])
      expect(loadStored(storage)).toEqual({ state: 'restored', stored })
    }
    // Only the model and its source are written: no key beyond those of the model.
    const written = JSON.parse(items.get(CONFIG_KEY) ?? '{}') as Record<string, unknown>
    expect(Object.keys(written).sort()).toEqual(['config', 'source', 'version'])
    const good = serializeStored({ config: yaml, source: { origin: 'created', edited: false, readAs: null, files: [], managerChosen: false } })
    expect(parseStored(good)).not.toBeNull()
    const broken = [
      'not json', '[]', 'null',
      good.replace('"version":1', '"version":2'),
      good.replace('"mode":"db"', '"mode":"other"'),
      good.replace('"hardConcurrencyLimit":"', '"hardConcurrencyLimit":7,"x":"'),
      good.replace('"origin":"created"', '"origin":"demo"'),
      good.replace('"selectors":[', '"selectors":[{"id":"only"},'),
    ]
    // A value saved before the manager question existed has a manager already: it counts as chosen.
    expect(parseStored(good.replace(',"managerChosen":false', ''))?.source.managerChosen).toBe(true)
    for (const raw of broken) {
      expect(raw === good).toBe(false)
      items.set(CONFIG_KEY, raw)
      expect(loadStored(storage)).toEqual({ state: 'discarded' })
      expect(items.has(CONFIG_KEY)).toBe(false)
    }
    // Nothing leaks from the stored text into the prototype of the restored objects.
    items.set(CONFIG_KEY, good.replace('"mode":"db"', '"mode":"db","__proto__":{"polluted":true}'))
    const restored = loadStored(storage)
    expect(restored.state).toBe('restored')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(restored.state === 'restored' && Object.keys(restored.stored.config).sort()).toEqual(['externalGroups', 'global', 'groups', 'mode', 'ownership', 'selectors'])
    // Deleting removes the key, and a storage that refuses access is reported, not thrown.
    removeStored(storage)
    expect(items.size).toBe(0)
    expect(loadStored(storage)).toEqual({ state: 'none' })
    const refusing = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } }
    expect(saveStored(refusing, { config: yaml, source: { origin: 'created', edited: false, readAs: null, files: [], managerChosen: false } })).toBe(false)
    expect(saveStored(null, { config: yaml, source: { origin: 'created', edited: false, readAs: null, files: [], managerChosen: false } })).toBe(false)
    expect(loadStored(refusing)).toEqual({ state: 'none' })
    expect(() => removeStored(refusing)).not.toThrow()
  })

  it('reports the expected findings', () => {
    const found = findingCounts(yaml)
    if (set === 'current') {
      expect(found).toMatchObject({ cpuWithoutPeriod: 3, selectorPriorityTie: 4 })
      expect(found.childHardAboveParent).toBeUndefined()
      expect(found.selectorExternalGroup).toBeUndefined()
    } else {
      expect(found).toMatchObject({ childHardAboveParent: 2, selectorPriorityTie: 4, selectorExternalGroup: 4 })
      expect(found.cpuWithoutPeriod).toBeUndefined()
    }
    // The CSV dumps hold the same limits and priorities, so they raise the same group findings.
    const fromCsv = findingCounts(csv)
    expect(fromCsv.selectorPriorityTie).toBe(4)
    expect(fromCsv.childHardAboveParent).toBe(found.childHardAboveParent)
    expect(fromCsv.cpuWithoutPeriod).toBe(found.cpuWithoutPeriod)
  })
})
