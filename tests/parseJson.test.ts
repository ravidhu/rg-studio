import { describe, expect, it } from 'vitest'
import { DEMO_JSON } from '@/utils/demo'
import { exportJson, exportSql } from '@/utils/exportConfig'
import { parseResourceGroupsJson } from '@/utils/parseJson'
import { buildTree, flattenTree } from '@/utils/tree'

describe('parseResourceGroupsJson', () => {
  it('reads groups, sub-groups, selectors and the quota period', () => {
    const result = parseResourceGroupsJson(DEMO_JSON)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings).toEqual([])
    const tree = buildTree(result.config.groups)
    expect(flattenTree(tree.roots).map((node) => node.path)).toEqual([
      'global', 'global.etl', 'global.bi', 'global.bi.dashboards', 'global.bi.reports', 'global.adhoc', 'admin',
    ])
    expect(result.config.mode).toBe('file')
    expect(result.config.global.cpuQuotaPeriod).toBe('1h')
    expect(result.config.selectors).toHaveLength(5)
    expect(result.config.selectors.every((selector) => selector.groupId !== null)).toBe(true)
    expect(result.config.selectors[3]?.clientTags).toEqual(['report'])
  })

  it('round-trips through the JSON export', () => {
    const first = parseResourceGroupsJson(DEMO_JSON)
    if (!first.ok) throw new Error('demo must parse')
    const exported = exportJson(first.config)
    expect(JSON.parse(exported)).toEqual(JSON.parse(DEMO_JSON))
  })

  it('exports SQL with parents before children and escaped quotes', () => {
    const result = parseResourceGroupsJson(JSON.stringify({
      rootGroups: [{ name: "o'top", hardConcurrencyLimit: 1, maxQueued: 1, subGroups: [{ name: 'kid', hardConcurrencyLimit: 1, maxQueued: 1 }] }],
      selectors: [{ user: 'a', group: "o'top.kid" }, { group: "o'top.kid" }],
      cpuQuotaPeriod: '1h',
    }))
    if (!result.ok) throw new Error('must parse')
    const sql = exportSql(result.config, 'test')
    expect(sql).toContain("VALUES ('cpu_quota_period', '1h');")
    expect(sql).toContain("VALUES (1, 'o''top',")
    expect(sql).toMatch(/VALUES \(2, 'kid',.*, 1, 'test'\);/)
    expect(sql).toMatch(/INSERT INTO selectors .* VALUES \(2, 2, 'a',/)
    expect(sql).toMatch(/INSERT INTO selectors .* VALUES \(2, 1, NULL,/)
  })

  it('fails closed on wrong types and missing required keys, naming the path', () => {
    const result = parseResourceGroupsJson(JSON.stringify({
      rootGroups: [
        { name: 'a', maxQueued: '10', hardConcurrencyLimit: 5, subGroups: [{ name: 'b', maxQueued: 1 }] },
        { maxQueued: 1, hardConcurrencyLimit: 1, jmxExport: 'yes' },
      ],
      selectors: [{ user: 5, group: 'a.b' }, { clientTags: 'x' }],
    }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.map((error) => `${error.column}:${error.code}`)).toEqual([
      'rootGroups[0].maxQueued:expectedInteger',
      'rootGroups[0].subGroups[0].hardConcurrencyLimit:missingKey',
      'rootGroups[1].name:missingKey',
      'rootGroups[1].jmxExport:expectedBoolean',
      'selectors[0].user:expectedString',
      'selectors[1].group:missingKey',
      'selectors[1].clientTags:expectedStringArray',
    ])
  })

  it('rejects a document that is not an object or has no root groups', () => {
    expect(parseResourceGroupsJson('[]').ok).toBe(false)
    expect(parseResourceGroupsJson('{"rootGroups": []}').ok).toBe(false)
    expect(parseResourceGroupsJson('{}').ok).toBe(false)
  })

  it('warns about unknown keys and keeps an unresolved selector target', () => {
    const result = parseResourceGroupsJson(JSON.stringify({
      rootGroups: [{ name: 'a', maxQueued: 1, hardConcurrencyLimit: 1, colour: 'red' }],
      selectors: [{ group: 'a.missing' }],
    }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings.map((warning) => warning.column)).toEqual(['rootGroups[0].colour'])
    expect(result.config.selectors[0]).toMatchObject({ groupId: null, unresolvedTarget: 'a.missing' })
  })
})
