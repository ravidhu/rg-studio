import { describe, expect, it } from 'vitest'
import type { RgConfig } from '@/types/model'
import { runChecks, type Finding } from '@/utils/checks'
import { demoConfig } from '@/utils/demo'
import { parseDbTables } from '@/utils/parseDb'
import { parseResourceGroupsJson } from '@/utils/parseJson'
import { DEFAULT_SIZING } from '@/utils/sizing'
import { WEIGHTED_TREE_JSON } from './fixtures'

function fromJson(document: unknown): RgConfig {
  const result = parseResourceGroupsJson(typeof document === 'string' ? document : JSON.stringify(document))
  if (!result.ok) throw new Error(`fixture must parse: ${JSON.stringify(result.errors)}`)
  return result.config
}

function codes(findings: Finding[], severity?: Finding['severity']): string[] {
  return findings.filter((finding) => severity === undefined || finding.severity === severity).map((finding) => finding.code)
}

function group(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { name, hardConcurrencyLimit: 10, maxQueued: 10, ...extra }
}

describe('runChecks', () => {
  it('finds no error and no warning in the demo configuration', () => {
    const findings = runChecks(demoConfig(), DEFAULT_SIZING)
    expect(codes(findings, 'error')).toEqual([])
    expect(codes(findings, 'warning')).toEqual([])
    expect(codes(findings)).toContain('independentRoots')
    expect(codes(findings)).toContain('childrenHardSumAbove')
  })

  it('flags soft limits above hard limits and CPU limits without a period', () => {
    const config = fromJson({
      rootGroups: [group('a', { softConcurrencyLimit: 20, softCpuLimit: '3h', hardCpuLimit: '2h' }), group('b', { softCpuLimit: '1h' })],
      selectors: [{ group: 'a' }],
    })
    const findings = runChecks(config, DEFAULT_SIZING)
    expect(codes(findings, 'error')).toEqual(expect.arrayContaining(['softConcurrencyAboveHard', 'softCpuAboveHard', 'cpuWithoutPeriod', 'softCpuWithoutHard']))
    const target = findings.find((finding) => finding.code === 'softConcurrencyAboveHard')
    expect(target?.params.group).toBe('a')
    expect(target?.groupId).toBe(config.groups[0]?.id)
  })

  it('reports a zero hard limit with a zero queue as information, not as a warning', () => {
    const config = fromJson({ rootGroups: [group('a', { hardConcurrencyLimit: 0, maxQueued: 0 })], selectors: [{ group: 'a' }] })
    const findings = runChecks(config, DEFAULT_SIZING)
    const blocked = findings.find((finding) => finding.code === 'groupBlocked')
    expect(blocked?.severity).toBe('info')
    expect(blocked?.params.group).toBe('a')
    expect(codes(findings)).not.toContain('hardConcurrencyZero')
  })

  it('warns about a zero hard limit with a queue that can hold queries', () => {
    const config = fromJson({ rootGroups: [group('a', { hardConcurrencyLimit: 0, maxQueued: 5 })], selectors: [{ group: 'a' }] })
    const findings = runChecks(config, DEFAULT_SIZING)
    expect(codes(findings, 'warning')).toContain('hardConcurrencyZero')
    expect(codes(findings)).not.toContain('groupBlocked')
  })

  it('reports neither code when the hard limit is positive', () => {
    const config = fromJson({ rootGroups: [group('a', { hardConcurrencyLimit: 3, maxQueued: 0 })], selectors: [{ group: 'a' }] })
    const found = codes(runChecks(config, DEFAULT_SIZING))
    expect(found).not.toContain('hardConcurrencyZero')
    expect(found).not.toContain('groupBlocked')
  })

  it('flags unparseable values with the field name', () => {
    const config = fromJson({
      rootGroups: [group('a', { softMemoryLimit: 'lots', hardCpuLimit: '{{ x }}h', schedulingPolicy: 'random', hardPhysicalDataScanLimit: '1 parsec' }), group('b', { softMemoryLimit: '120%' })],
      cpuQuotaPeriod: 'hourly',
    })
    const findings = runChecks(config, DEFAULT_SIZING)
    const fields = findings.filter((finding) => finding.code === 'unparseable').map((finding) => finding.params.field)
    expect(fields).toEqual(expect.arrayContaining(['softMemoryLimit', 'hardCpuLimit', 'schedulingPolicy', 'hardPhysicalDataScanLimit', 'cpuQuotaPeriod']))
    expect(codes(findings)).toContain('memoryAbove100')
  })

  it('compares children with their parent', () => {
    const findings = runChecks(fromJson(WEIGHTED_TREE_JSON), DEFAULT_SIZING)
    const sums = findings.filter((finding) => finding.code === 'childrenHardSumAbove').map((finding) => finding.params.group)
    expect(sums).toEqual(['R', 'R.A', 'R.U'])
    const config = fromJson({
      rootGroups: [group('p', { softMemoryLimit: '50%', subGroups: [group('big', { hardConcurrencyLimit: 50, maxQueued: 99, softMemoryLimit: '80%' })] })],
    })
    expect(codes(runChecks(config, DEFAULT_SIZING), 'warning')).toEqual(expect.arrayContaining(['childHardAboveParent', 'childQueueAboveParent', 'childMemoryAboveParent']))
  })

  it('flags weights that are missing or ignored by the parent policy', () => {
    const weighted = fromJson({
      rootGroups: [group('p', { schedulingPolicy: 'weighted', schedulingWeight: 4, subGroups: [group('x', { schedulingWeight: 3 }), group('y')] })],
    })
    const weightedFindings = runChecks(weighted, DEFAULT_SIZING)
    expect(weightedFindings.find((finding) => finding.code === 'weightMissing')?.params.group).toBe('p.y')
    expect(codes(weightedFindings)).toContain('weightOnRoot')
    const fair = fromJson({ rootGroups: [group('p', { subGroups: [group('x', { schedulingWeight: 3 }), group('y')] })] })
    expect(runChecks(fair, DEFAULT_SIZING).find((finding) => finding.code === 'weightIgnored')?.params).toMatchObject({ group: 'p.x', policy: 'fair' })
  })

  it('requires query_priority on every child of a query_priority group', () => {
    const config = fromJson({ rootGroups: [group('p', { schedulingPolicy: 'query_priority', subGroups: [group('x'), group('y', { schedulingPolicy: 'query_priority' })] })] })
    const flagged = runChecks(config, DEFAULT_SIZING).filter((finding) => finding.code === 'queryPriorityChildren')
    expect(flagged.map((finding) => finding.params.group)).toEqual(['p.x'])
  })

  it('compares the sum of sibling soft CPU limits with the cluster', () => {
    const config = fromJson({
      rootGroups: [group('p', { subGroups: [group('x', { softCpuLimit: '30h', hardCpuLimit: '55h' }), group('y', { softCpuLimit: '25h', hardCpuLimit: '48h' })] })],
      cpuQuotaPeriod: '1h',
    })
    const findings = runChecks(config, DEFAULT_SIZING)
    expect(findings.find((finding) => finding.code === 'siblingSoftCpuSum')?.params).toMatchObject({ sum: 55, ceiling: 48, against: 'cluster' })
    expect(findings.filter((finding) => finding.code === 'hardCpuAboveCluster').map((finding) => finding.params.group)).toEqual(['p.x', 'p.y'])
  })

  it('checks selectors: missing or non-leaf target, no catch-all, unreachable, bad pattern', () => {
    const config = fromJson({
      rootGroups: [group('p', { subGroups: [group('x'), group('y')] })],
      selectors: [{ user: 'a(', group: 'p.x' }, { source: 'x*+', group: 'p' }, { queryType: 'SELEKT', group: 'p.nope' }],
    })
    const findings = runChecks(config, DEFAULT_SIZING)
    expect(codes(findings)).toEqual(expect.arrayContaining(['selectorRegexInvalid', 'selectorNonLeaf', 'selectorMissingGroup', 'selectorQueryType', 'noCatchAll', 'leafWithoutSelector']))
    const withCatchAll = fromJson({ rootGroups: [group('x')], selectors: [{ group: 'x' }, { user: 'bob', group: 'x' }] })
    const unreachable = runChecks(withCatchAll, DEFAULT_SIZING).find((finding) => finding.code === 'selectorUnreachable')
    expect(unreachable?.params).toMatchObject({ position: 2, catchAll: 1 })
    expect(codes(runChecks(withCatchAll, DEFAULT_SIZING))).not.toContain('noCatchAll')
  })

  it('flags duplicate sibling names, orphans, cycles and partial JMX export', () => {
    const duplicate = fromJson({ rootGroups: [group('p', { subGroups: [group('x', { jmxExport: true }), group('x')] })] })
    const duplicateFindings = runChecks(duplicate, DEFAULT_SIZING)
    expect(codes(duplicateFindings, 'error')).toContain('duplicateSiblingName')
    expect(duplicateFindings.find((finding) => finding.code === 'jmxPartial')?.params).toMatchObject({ exported: 1, total: 3 })

    const db = parseDbTables({
      resourceGroups: 'resource_group_id,name,max_queued,hard_concurrency_limit,parent\n1,a,5,5,2\n2,b,5,5,1\n3,c,5,5,77\n4,d,5,5,\n',
      selectors: 'resource_group_id,priority\n4,1\n4,1\n',
    })
    if (!db.ok) throw new Error('must parse')
    const dbFindings = runChecks(db.config, DEFAULT_SIZING)
    expect(dbFindings.filter((finding) => finding.code === 'cycle').map((finding) => finding.params.group)).toEqual(['a', 'b'])
    expect(dbFindings.find((finding) => finding.code === 'orphan')?.params).toMatchObject({ group: 'c', parent: 77 })
    expect(codes(dbFindings)).toContain('selectorPriorityTie')
  })

  it('reports a quota period that no group uses, and nothing when a group uses it', () => {
    const unused = runChecks(fromJson({ rootGroups: [group('a')], selectors: [{ group: 'a' }], cpuQuotaPeriod: '1h', physicalDataScanQuotaPeriod: '1d' }), DEFAULT_SIZING)
    expect(unused.find((finding) => finding.code === 'cpuPeriodUnused')).toMatchObject({ severity: 'info', field: 'cpuQuotaPeriod', params: { value: '1h' } })
    expect(unused.find((finding) => finding.code === 'scanPeriodUnused')).toMatchObject({ severity: 'info', field: 'physicalDataScanQuotaPeriod' })
    const used = runChecks(fromJson({
      rootGroups: [group('a', { softCpuLimit: '1h', hardCpuLimit: '2h', hardPhysicalDataScanLimit: '1TB' })],
      selectors: [{ group: 'a' }], cpuQuotaPeriod: '1h', physicalDataScanQuotaPeriod: '1d',
    }), DEFAULT_SIZING)
    expect(codes(used)).not.toContain('cpuPeriodUnused')
    expect(codes(used)).not.toContain('scanPeriodUnused')
  })
})
