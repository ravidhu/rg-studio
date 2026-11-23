import { describe, expect, it } from 'vitest'
import { runChecks } from '@/utils/checks'
import { switchManager } from '@/utils/configReducer'
import { demoConfig } from '@/utils/demo'
import { exportJson, exportSql } from '@/utils/exportConfig'
import { parseDbTables } from '@/utils/parseDb'
import { parseResourceGroupsJson } from '@/utils/parseJson'
import { compileJavaRegex, isCatchAll, orderedSelectors, routeQuery, tiedMatches, type QueryContext } from '@/utils/selectors'
import { DEFAULT_SIZING } from '@/utils/sizing'
import { buildTree } from '@/utils/tree'

function query(overrides: Partial<QueryContext>): QueryContext {
  const user = overrides.user ?? 'alice'
  return {
    user, originalUser: user, authenticatedUser: user, userGroups: [], source: '', clientTags: [],
    queryType: 'SELECT', queryText: '', ...overrides,
  }
}

describe('compileJavaRegex', () => {
  it('matches the whole value only', () => {
    const compiled = compileJavaRegex('bob')
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) return
    expect(compiled.regex.test('bob')).toBe(true)
    expect(compiled.regex.test('bobby')).toBe(false)
    expect(compiled.regex.test('xbob')).toBe(false)
  })

  it('keeps alternations inside the anchors', () => {
    const compiled = compileJavaRegex('a|b')
    if (!compiled.ok) throw new Error('must compile')
    expect(compiled.regex.test('ab')).toBe(false)
    expect(compiled.regex.test('b')).toBe(true)
  })

  it('translates a leading (?i) and accepts escapes that Java accepts', () => {
    const insensitive = compileJavaRegex('(?i)etl-.*')
    if (!insensitive.ok) throw new Error('must compile')
    expect(insensitive.regex.test('ETL-nightly')).toBe(true)
    const escaped = compileJavaRegex('jdbc\\#tool')
    if (!escaped.ok) throw new Error('must compile')
    expect(escaped.regex.test('jdbc#tool')).toBe(true)
  })

  it('reports Java-only syntax and invalid patterns instead of guessing', () => {
    expect(compileJavaRegex('\\p{Alpha}+')).toMatchObject({ ok: false, reason: 'javaOnly' })
    expect(compileJavaRegex('\\Qa.b\\E')).toMatchObject({ ok: false, reason: 'javaOnly' })
    expect(compileJavaRegex('(?x) a b')).toMatchObject({ ok: false, reason: 'javaOnly' })
    expect(compileJavaRegex('a(')).toMatchObject({ ok: false, reason: 'invalid' })
    expect(compileJavaRegex('a'.repeat(2001))).toMatchObject({ ok: false, reason: 'tooLong' })
  })
})

describe('routeQuery', () => {
  const config = demoConfig()
  const tree = buildTree(config.groups)

  it('uses the first matching selector in file order', () => {
    expect(routeQuery(config, tree, query({ userGroups: ['dev', 'admin'], source: 'etl' })).groupPath).toBe('admin')
    expect(routeQuery(config, tree, query({ source: 'nightly-etl-job' })).groupPath).toBe('global.etl')
    expect(routeQuery(config, tree, query({ source: 'Dashboard-sales' })).groupPath).toBe('global.bi.dashboards')
    expect(routeQuery(config, tree, query({ clientTags: ['report', 'x'] })).groupPath).toBe('global.bi.reports')
    expect(routeQuery(config, tree, query({})).groupPath).toBe('global.adhoc')
  })

  it('combines the conditions of one selector with AND and explains each one', () => {
    const result = parseResourceGroupsJson(JSON.stringify({
      rootGroups: [{ name: 'g', hardConcurrencyLimit: 1, maxQueued: 1 }],
      selectors: [{ user: 'svc_.*', source: 'tool', queryType: 'insert', clientTags: ['a', 'b'], group: 'g' }],
    }))
    if (!result.ok) throw new Error('must parse')
    const local = buildTree(result.config.groups)
    const hit = routeQuery(result.config, local, query({ user: 'svc_x', source: 'tool', queryType: 'INSERT', clientTags: ['b', 'a', 'c'] }))
    expect(hit.groupPath).toBe('g')
    const miss = routeQuery(result.config, local, query({ user: 'svc_x', source: 'tool', queryType: 'INSERT', clientTags: ['a'] }))
    expect(miss.matched).toBeNull()
    expect(miss.groupPath).toBeNull()
    expect(miss.traces[0]?.conditions.map((condition) => `${condition.field}:${condition.outcome}`)).toEqual([
      'user:match', 'source:match', 'queryType:match', 'clientTags:noMatch',
    ])
  })

  it('expands ${USER}, ${SOURCE} and named groups in the target', () => {
    const result = parseResourceGroupsJson(JSON.stringify({
      rootGroups: [{ name: 'top', hardConcurrencyLimit: 1, maxQueued: 1, subGroups: [
        { name: 'bi-${toolname}', hardConcurrencyLimit: 1, maxQueued: 1, subGroups: [{ name: '${USER}', hardConcurrencyLimit: 1, maxQueued: 1 }] },
      ] }],
      selectors: [{ source: 'jdbc#(?<toolname>.*)', group: 'top.bi-${toolname}.${USER}' }],
    }))
    if (!result.ok) throw new Error('must parse')
    const routed = routeQuery(result.config, buildTree(result.config.groups), query({ user: 'kim', source: 'jdbc#viz' }))
    expect(routed.groupPath).toBe('top.bi-viz.kim')
  })

  it('orders database selectors by descending priority', () => {
    const db = parseDbTables({
      resourceGroups: 'resource_group_id,name,max_queued,hard_concurrency_limit\n1,low,5,5\n2,high,5,5\n',
      selectors: 'resource_group_id,priority,user_regex\n1,1,\n2,50,al.*\n',
    })
    if (!db.ok) throw new Error('must parse')
    expect(orderedSelectors(db.config).map((selector) => selector.priority)).toEqual(['50', '1'])
    const local = buildTree(db.config.groups)
    expect(routeQuery(db.config, local, query({ user: 'alice' })).groupPath).toBe('high')
    expect(routeQuery(db.config, local, query({ user: 'bob' })).groupPath).toBe('low')
  })

  it('keeps the routing when the manager changes, in both directions', () => {
    const file = parseResourceGroupsJson(JSON.stringify({
      rootGroups: [{ name: 'a', hardConcurrencyLimit: 5, maxQueued: 5 }, { name: 'b', hardConcurrencyLimit: 5, maxQueued: 5 }, { name: 'c', hardConcurrencyLimit: 5, maxQueued: 5 }],
      selectors: [{ user: 'al.*', group: 'a' }, { source: 'etl', group: 'b' }, { group: 'c' }],
    }))
    if (!file.ok) throw new Error('must parse')
    const queries = [query({ user: 'alice', source: 'etl' }), query({ user: 'bob', source: 'etl' }), query({ user: 'bob' })]
    const routes = (candidate: typeof file.config): (string | null)[] => queries.map((one) => routeQuery(candidate, buildTree(candidate.groups), one).groupPath)
    expect(routes(file.config)).toEqual(['a', 'b', 'c'])
    // File to database: strictly descending priorities in list order, no finding about priorities.
    const toDb = switchManager(file.config, 'db')
    expect(toDb.note).toBe('prioritiesSet')
    expect(toDb.config.selectors.map((selector) => selector.priority)).toEqual(['30', '20', '10'])
    expect(routes(toDb.config)).toEqual(['a', 'b', 'c'])
    expect(runChecks(toDb.config, DEFAULT_SIZING).filter((finding) => finding.code.startsWith('selectorPriority'))).toEqual([])
    // Priorities that already give the list order are kept.
    const custom = { ...file.config, selectors: file.config.selectors.map((selector, index) => ({ ...selector, priority: String(90 - index * 7) })) }
    expect(switchManager(custom, 'db')).toMatchObject({ note: null, config: { selectors: [{ priority: '90' }, { priority: '83' }, { priority: '76' }] } })
    // Database to file: the list is sorted by descending priority, equal ones keeping their order.
    const shuffled = { ...toDb.config, selectors: [toDb.config.selectors[2], toDb.config.selectors[0], toDb.config.selectors[1]].flatMap((selector) => (selector ? [selector] : [])) }
    expect(routes(shuffled)).toEqual(['a', 'b', 'c'])
    const toFile = switchManager(shuffled, 'file')
    expect(toFile.note).toBe('sorted')
    expect(toFile.config.selectors.map((selector) => selector.priority)).toEqual(['30', '20', '10'])
    expect(routes(toFile.config)).toEqual(['a', 'b', 'c'])
    // An export for the other manager converts the output only: the model keeps its manager, its order and its priorities.
    const sqlPriorities = [...exportSql(switchManager(file.config, 'db').config, 'env').matchAll(/INSERT INTO selectors \([^)]*\) VALUES \(\d+, (\d+),/g)].map((match) => match[1])
    expect(sqlPriorities).toEqual(['30', '20', '10'])
    expect(file.config.mode).toBe('file')
    expect(file.config.selectors.map((selector) => selector.priority)).toEqual(['', '', ''])
    const written = JSON.parse(exportJson(switchManager(shuffled, 'file').config)) as { selectors: { group: string }[] }
    expect(written.selectors.map((selector) => selector.group)).toEqual(['a', 'b', 'c'])
    expect(shuffled.mode).toBe('db')
    expect(shuffled.selectors.map((selector) => selector.priority)).toEqual(['10', '30', '20'])
    // The example is coherent under either manager.
    const demoDb = switchManager(demoConfig(), 'db')
    expect(demoDb.note).toBeNull()
    expect(runChecks(demoDb.config, DEFAULT_SIZING).filter((finding) => finding.severity !== 'info')).toEqual([])
  })

  it('leaves an imported database configuration with its own priorities and its ties', () => {
    const db = parseDbTables({
      resourceGroups: 'resource_group_id,name,max_queued,hard_concurrency_limit\n1,low,5,5\n2,high,5,5\n',
      selectors: 'resource_group_id,priority,user_regex\n1,7,bo.*\n2,7,al.*\n',
    })
    if (!db.ok) throw new Error('must parse')
    expect(db.config.selectors.map((selector) => selector.priority)).toEqual(['7', '7'])
    expect(runChecks(db.config, DEFAULT_SIZING).filter((finding) => finding.code === 'selectorPriorityTie')).toHaveLength(1)
    expect(switchManager(db.config, 'file').note).toBe('sortedTies')
  })

  it('warns when the winner shares its priority with another matching selector, unless both target the same group', () => {
    const db = parseDbTables({
      resourceGroups: 'resource_group_id,name,max_queued,hard_concurrency_limit\n1,one,5,5\n2,two,5,5\n',
      selectors: 'resource_group_id,priority,user_regex,source_regex\n1,40,al.*,\n2,40,,cli\n1,40,,batch\n2,5,,\n',
    })
    if (!db.ok) throw new Error('must parse')
    const local = buildTree(db.config.groups)
    const ties = (overrides: Partial<QueryContext>) => tiedMatches(db.config, routeQuery(db.config, local, query(overrides)))
    // alice from cli matches the first two selectors, both at 40, towards different groups.
    expect(ties({ user: 'alice', source: 'cli' })).toEqual([{ position: 2, sameTarget: false }])
    // alice from batch matches the first and the third, both towards the group one: no effect.
    expect(ties({ user: 'alice', source: 'batch' })).toEqual([{ position: 3, sameTarget: true }])
    // One match at the winning priority, or a lower one that also matches: no tie.
    expect(ties({ user: 'alice' })).toEqual([])
    expect(ties({ user: 'bob' })).toEqual([])
    // The file manager reads the list in order: equal priorities mean nothing there.
    const asFile = { ...db.config, mode: 'file' as const }
    expect(tiedMatches(asFile, routeQuery(asFile, local, query({ user: 'alice', source: 'cli' })))).toEqual([])
  })

  it('marks the result uncertain when an earlier pattern cannot be evaluated', () => {
    const result = parseResourceGroupsJson(JSON.stringify({
      rootGroups: [{ name: 'g', hardConcurrencyLimit: 1, maxQueued: 1 }],
      selectors: [{ user: '\\p{Alpha}+', group: 'g' }, { group: 'g' }],
    }))
    if (!result.ok) throw new Error('must parse')
    const routed = routeQuery(result.config, buildTree(result.config.groups), query({}))
    expect(routed.uncertain).toBe(true)
    expect(routed.traces[0]?.outcome).toBe('unsupported')
  })

  it('recognises catch-all selectors', () => {
    expect(config.selectors.map(isCatchAll)).toEqual([false, false, false, false, true])
  })
})
