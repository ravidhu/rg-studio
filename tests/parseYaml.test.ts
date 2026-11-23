import { describe, expect, it } from 'vitest'
import { runChecks } from '@/utils/checks'
import { DEMO_JSON } from '@/utils/demo'
import { exportFileYaml, exportJson, exportLoaderYaml } from '@/utils/exportConfig'
import { parseResourceGroupsJson } from '@/utils/parseJson'
import { detectFormat, MAX_ALIASES, parseResourceGroupsYaml } from '@/utils/parseYaml'
import { orderedSelectors } from '@/utils/selectors'
import { DEFAULT_SIZING } from '@/utils/sizing'
import { buildTree, flattenTree } from '@/utils/tree'

/** Invented file in the YAML form of resource-groups.json. */
const FILE_YAML = `
rootGroups:
  - name: global
    softMemoryLimit: 90%
    hardConcurrencyLimit: 100
    maxQueued: 500
    schedulingPolicy: weighted_fair
    subGroups:
      - name: etl
        hardConcurrencyLimit: 40
        maxQueued: 200
        schedulingWeight: 3
        softCpuLimit: 10h
        hardCpuLimit: 20h
      - name: adhoc
        hardConcurrencyLimit: 30
        maxQueued: 100
        schedulingWeight: 1
        jmxExport: true
selectors:
  - source: ".*etl.*"
    group: global.etl
  - clientTags: [report, fast]
    group: global.adhoc
  - group: global.adhoc
cpuQuotaPeriod: 1h
`

/** Invented file in the database loader format. */
const LOADER_YAML = `
environment: test_env
ownership:
  group_id_min: 10
  selector_priority_above: 0
global_properties:
  cpu_quota_period: 1h
external_groups: [system]
groups:
  - name: global
    id: 10
    scheduling_policy: weighted_fair
    soft_memory_limit: "90%"
    hard_concurrency_limit: 100
    max_queued: 500
    subgroups:
      - name: etl
        id: 11
        hard_concurrency_limit: 40
        max_queued: 200
        scheduling_weight: 3
        soft_cpu_limit: 10h
        hard_cpu_limit: 20h
        jmx_export: true
      - name: bi
        id: 12
        hard_concurrency_limit: 30
        max_queued: 100
        scheduling_weight: 1
selectors:
  - group: system
    priority: 50
    user_group_regex: "ops"
  - group: global.etl
    priority: 20
    source_regex: ".*etl.*"
    client_tags: [nightly]
  - group: global.bi
    priority: 1
`

describe('parseResourceGroupsYaml', () => {
  it('reads the YAML form of resource-groups.json like the JSON file', () => {
    const result = parseResourceGroupsYaml(FILE_YAML)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings).toEqual([])
    expect(result.config.mode).toBe('file')
    expect(flattenTree(buildTree(result.config.groups).roots).map((node) => node.path)).toEqual(['global', 'global.etl', 'global.adhoc'])
    expect(result.config.groups[1]).toMatchObject({ hardConcurrencyLimit: '40', schedulingWeight: '3', softCpuLimit: '10h' })
    expect(result.config.groups[2]?.jmxExport).toBe('true')
    expect(result.config.selectors.map((selector) => selector.clientTags)).toEqual([[], ['report', 'fast'], []])
    expect(result.config.global.cpuQuotaPeriod).toBe('1h')
  })

  it('reads the loader format: nested groups with ids, selectors by path and priority, external groups', () => {
    const result = parseResourceGroupsYaml(LOADER_YAML)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const config = result.config
    expect(config.mode).toBe('db')
    expect(config.ownership).toEqual({ groupIdMin: 10, selectorPriorityAbove: 0 })
    expect(config.externalGroups).toEqual(['system'])
    expect(config.global.cpuQuotaPeriod).toBe('1h')
    const nodes = flattenTree(buildTree(config.groups).roots)
    expect(nodes.map((node) => `${node.path}:${node.group.dbId}`)).toEqual(['global:10', 'global.etl:11', 'global.bi:12'])
    expect(config.groups[1]).toMatchObject({ environment: 'test_env', softCpuLimit: '10h', hardCpuLimit: '20h', jmxExport: 'true', schedulingWeight: '3' })
    expect(orderedSelectors(config).map((selector) => selector.priority)).toEqual(['50', '20', '1'])
    expect(config.selectors[0]).toMatchObject({ groupId: null, unresolvedTarget: 'system', userGroup: 'ops' })
    expect(config.selectors[1]).toMatchObject({ source: '.*etl.*', clientTags: ['nightly'] })
    expect(config.selectors[1]?.groupId).toBe(config.groups[1]?.id)
    // The ownership block is kept but not interpreted: the import says so, with its line.
    expect(result.warnings).toEqual([{ severity: 'warning', file: 'YAML', line: 3, column: 'ownership', code: 'yamlOwnership', params: {} }])
    // A selector on a declared external group is a note, not a missing group.
    const codes = runChecks(config, DEFAULT_SIZING).map((finding) => finding.code)
    expect(codes).toContain('selectorExternalGroup')
    expect(codes).not.toContain('selectorMissingGroup')
  })

  it('round-trips the file shape through the YAML export', () => {
    const first = parseResourceGroupsJson(DEMO_JSON)
    if (!first.ok) throw new Error('demo must parse')
    const again = parseResourceGroupsYaml(exportFileYaml(first.config))
    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(JSON.parse(exportJson(again.config))).toEqual(JSON.parse(DEMO_JSON))
  })

  it('round-trips the loader shape through the YAML export', () => {
    const first = parseResourceGroupsYaml(LOADER_YAML)
    if (!first.ok) throw new Error('fixture must parse')
    const exported = exportLoaderYaml(first.config, 'test_env')
    const again = parseResourceGroupsYaml(exported)
    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(exportLoaderYaml(again.config, 'test_env')).toBe(exported)
    expect(again.config.ownership).toEqual(first.config.ownership)
    expect(again.config.externalGroups).toEqual(['system'])
    expect(again.config.groups.map((group) => [group.name, group.dbId, group.hardConcurrencyLimit])).toEqual(
      first.config.groups.map((group) => [group.name, group.dbId, group.hardConcurrencyLimit]),
    )
    expect(again.config.selectors.map((selector) => [selector.priority, selector.unresolvedTarget, selector.source])).toEqual(
      first.config.selectors.map((selector) => [selector.priority, selector.unresolvedTarget, selector.source]),
    )
  })

  it('writes ids and descending priorities when a file configuration is exported in the loader format', () => {
    const first = parseResourceGroupsYaml(FILE_YAML)
    if (!first.ok) throw new Error('fixture must parse')
    const again = parseResourceGroupsYaml(exportLoaderYaml({ ...first.config, mode: 'db' }, 'test_env'))
    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(again.config.groups.map((group) => group.dbId)).toEqual([1, 2, 3])
    expect(again.config.selectors.map((selector) => selector.priority)).toEqual(['3', '2', '1'])
    expect(again.config.ownership).toEqual({ groupIdMin: 1, selectorPriorityAbove: 0 })
  })

  it('locates wrong types and missing keys by line, in both shapes', () => {
    const file = parseResourceGroupsYaml('rootGroups:\n  - name: a\n    maxQueued: many\n    hardConcurrencyLimit: 5\n')
    expect(file.ok).toBe(false)
    if (!file.ok) expect(file.errors[0]).toMatchObject({ code: 'expectedInteger', column: 'rootGroups[0].maxQueued', line: 3 })
    const loader = parseResourceGroupsYaml('environment: e\ngroups:\n  - name: a\n    id: 1\n    max_queued: 5\n  - name: b\n    id: 1\n    max_queued: x\n    hard_concurrency_limit: 2\n')
    expect(loader.ok).toBe(false)
    if (loader.ok) return
    expect(loader.errors.map((error) => `${error.line}:${error.column}:${error.code}`)).toEqual([
      '3:groups[0].hard_concurrency_limit:missingKey',
      '7:groups[1].id:duplicateId',
      '8:groups[1].max_queued:expectedInteger',
    ])
  })

  it('refuses a document that follows too many aliases', () => {
    const anchors = ['a0: &a0 [x, x]']
    for (let level = 1; level <= 8; level += 1) anchors.push(`a${level}: &a${level} [*a${level - 1}, *a${level - 1}, *a${level - 1}]`)
    const bomb = parseResourceGroupsYaml(`${anchors.join('\n')}\nrootGroups: *a8\n`)
    expect(bomb.ok).toBe(false)
    if (!bomb.ok) expect(bomb.errors[0]).toMatchObject({ code: 'yamlAliasLimit', params: { max: MAX_ALIASES } })
    const few = parseResourceGroupsYaml('defaults: &limits\n  hardConcurrencyLimit: 5\nrootGroups:\n  - name: a\n    maxQueued: 1\n    hardConcurrencyLimit: 5\n')
    expect(few.ok).toBe(true)
  })

  it('refuses keys that could reach a prototype, custom tags and merge keys', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      const result = parseResourceGroupsYaml(`rootGroups:\n  - name: a\n    ${key}:\n      polluted: true\n`)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.errors[0]).toMatchObject({ code: 'yamlForbiddenKey', line: 3, params: { key } })
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    const tagged = parseResourceGroupsYaml('rootGroups: !!js/function "x"\n')
    expect(tagged.ok).toBe(false)
    const duplicate = parseResourceGroupsYaml('rootGroups: []\nrootGroups: []\n')
    expect(duplicate.ok).toBe(false)
  })

  it('warns about templating and unknown keys with their lines, and imports the rest', () => {
    const result = parseResourceGroupsYaml(`environment: e
colour: blue
groups:
  - name: a
    id: 1
    max_queued: 5
    hard_concurrency_limit: 2
    hard_cpu_limit: "{{ cpu_hours }}h"
    owner_team: someone
selectors:
  - group: a
    priority: 1
    selector_resource_estimate:
      peakMemory:
        max: 10GB
`)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.groups[0]?.hardCpuLimit).toBe('{{ cpu_hours }}h')
    expect(result.warnings.map((warning) => `${warning.line}:${warning.code}:${warning.column ?? ''}`)).toEqual([
      '8:yamlTemplate:',
      '2:unknownKeyIgnored:colour',
      '9:unknownKeyIgnored:groups[0].owner_team',
      '13:ignoredKey:selectors[0].selector_resource_estimate',
    ])
    // The templated value is kept and flagged by the checks instead of being guessed.
    expect(runChecks(result.config, DEFAULT_SIZING).some((finding) => finding.code === 'unparseable' && finding.params.field === 'hardCpuLimit')).toBe(true)
  })

  it('refuses a shape it does not recognise, a non-mapping document and an oversized input', () => {
    expect(parseResourceGroupsYaml('something: 1\n')).toMatchObject({ ok: false, errors: [{ code: 'yamlUnknownShape' }] })
    expect(parseResourceGroupsYaml('- a\n- b\n')).toMatchObject({ ok: false, errors: [{ code: 'yamlNotMap' }] })
    expect(parseResourceGroupsYaml(`a: ${'x'.repeat(2 * 1024 * 1024)}`)).toMatchObject({ ok: false, errors: [{ code: 'tooLarge' }] })
  })
})

describe('detectFormat', () => {
  it('tells JSON, YAML and a CSV export of the groups table apart', () => {
    expect(detectFormat('  {"rootGroups": []}')).toBe('json')
    expect(detectFormat(FILE_YAML)).toBe('yaml')
    expect(detectFormat(LOADER_YAML)).toBe('yaml')
    expect(detectFormat('"resource_group_id","name","max_queued"\n1,a,5\n')).toBe('csv')
    expect(detectFormat('name;resource_group_id;max_queued\n')).toBe('csv')
    expect(detectFormat('resource_group_id: 4\n')).toBe('yaml')
  })
})
