import { describe, expect, it } from 'vitest'
import { parseCsv } from '@/utils/csv'
import { parseDbTables } from '@/utils/parseDb'
import { buildTree } from '@/utils/tree'

const HEADER = '"resource_group_id","name","soft_memory_limit","max_queued","soft_concurrency_limit","hard_concurrency_limit","scheduling_policy","scheduling_weight","jmx_export","soft_cpu_limit","hard_cpu_limit","parent","environment","hard_physical_data_scan_limit"'

describe('parseCsv', () => {
  it('reads quoted fields, doubled quotes, embedded delimiters and line breaks', () => {
    const table = parseCsv('a,b\n"x, y","say ""hi"""\n"line1\nline2",z\n')
    expect(table.errors).toEqual([])
    expect(table.header).toEqual(['a', 'b'])
    expect(table.rows[0]?.cells.map((cell) => cell.value)).toEqual(['x, y', 'say "hi"'])
    expect(table.rows[1]?.cells[0]?.value).toBe('line1\nline2')
    expect(table.rows[1]?.line).toBe(3)
  })

  it('accepts CRLF, a byte order mark and a missing final line break', () => {
    const table = parseCsv('﻿A,B\r\n1,2\r\n3,')
    expect(table.errors).toEqual([])
    expect(table.header).toEqual(['a', 'b'])
    expect(table.rows).toHaveLength(2)
    expect(table.rows[1]?.cells[1]?.value).toBeNull()
  })

  it('treats unquoted empty and NULL as null but keeps a quoted empty string', () => {
    const table = parseCsv('a,b,c\n,NULL,""\n')
    expect(table.rows[0]?.cells.map((cell) => cell.value)).toEqual([null, null, ''])
  })

  it('detects a semicolon delimiter', () => {
    const table = parseCsv('a;b\n1;2\n')
    expect(table.header).toEqual(['a', 'b'])
  })

  it('reports the line of a row with the wrong number of fields', () => {
    const table = parseCsv('a,b\n1,2\n1,2,3\n')
    expect(table.errors).toEqual([{ code: 'csvFieldCount', line: 3, params: { found: 3, expected: 2 } }])
    expect(table.rows).toEqual([])
  })
})

describe('parseDbTables', () => {
  const rows = [
    HEADER,
    '"2","child_b","40%","50","8","10","fair","3","true","1h","2h","1","prod",',
    '"1","top","90%","100",,"20","weighted_fair",,,,,,"prod","10TB"',
    '"3","child_a","10GB","50",,"10",,"1",,,,"1","prod",',
  ]

  it('builds the tree from parent ids, whatever the row order, with CRLF line ends', () => {
    const result = parseDbTables({ resourceGroups: rows.join('\r\n') + '\r\n' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.mode).toBe('db')
    const tree = buildTree(result.config.groups)
    expect(tree.roots.map((node) => node.group.name)).toEqual(['top'])
    expect(tree.roots[0]?.children.map((node) => node.path)).toEqual(['top.child_b', 'top.child_a'])
    const childB = tree.roots[0]?.children[0]?.group
    expect(childB).toMatchObject({
      dbId: 2, softMemoryLimit: '40%', softConcurrencyLimit: '8', hardConcurrencyLimit: '10',
      schedulingWeight: '3', jmxExport: 'true', softCpuLimit: '1h', hardCpuLimit: '2h', environment: 'prod',
    })
    expect(tree.roots[0]?.group.hardPhysicalDataScanLimit).toBe('10TB')
  })

  it('accepts reordered columns and missing optional columns', () => {
    const csv = 'hard_concurrency_limit,name,max_queued,resource_group_id,parent\n5,root,10,7,\n2,leaf,4,9,7\n'
    const result = parseDbTables({ resourceGroups: csv })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const tree = buildTree(result.config.groups)
    expect(tree.roots[0]?.children[0]?.group).toMatchObject({ name: 'leaf', hardConcurrencyLimit: '2', maxQueued: '4', softMemoryLimit: '' })
  })

  it('fails closed on a missing required column', () => {
    const result = parseDbTables({ resourceGroups: 'resource_group_id,name,max_queued\n1,a,5\n' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual([
      { severity: 'error', file: 'resource_groups', line: 1, column: 'hard_concurrency_limit', code: 'missingColumn', params: {} },
    ])
  })

  it('reports file, line and column of bad cells and rejects the whole import', () => {
    const csv = 'resource_group_id,name,max_queued,hard_concurrency_limit,parent,jmx_export\n1,a,5,ten,,\n2,,5,5,x,maybe\n1,c,1,1,,\n'
    const result = parseDbTables({ resourceGroups: csv })
    expect(result.ok).toBe(false)
    if (result.ok) return
    const located = result.errors.map((error) => `${error.file}:${error.line}:${error.column}:${error.code}`)
    expect(located).toEqual([
      'resource_groups:2:hard_concurrency_limit:notInteger',
      'resource_groups:3:name:missingValue',
      'resource_groups:3:parent:notInteger',
      'resource_groups:3:jmx_export:notBoolean',
    ])
  })

  it('rejects duplicate identifiers', () => {
    const csv = 'resource_group_id,name,max_queued,hard_concurrency_limit\n1,a,5,5\n1,b,5,5\n'
    const result = parseDbTables({ resourceGroups: csv })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toMatchObject({ code: 'duplicateId', line: 3, column: 'resource_group_id' })
  })

  it('keeps an orphan loadable so that the checks can point at it', () => {
    const csv = 'resource_group_id,name,max_queued,hard_concurrency_limit,parent\n1,a,5,5,42\n'
    const result = parseDbTables({ resourceGroups: csv })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.groups[0]?.missingParentDbId).toBe(42)
  })

  it('reads selectors and global properties, and warns about unknown columns', () => {
    const result = parseDbTables({
      resourceGroups: rows.join('\n'),
      selectors: 'resource_group_id,priority,user_regex,client_tags,extra\n2,10,"svc_.*","[""fast"",""etl""]",x\n99,1,,,\n',
      globalProperties: 'name,value\ncpu_quota_period,1h\nsomething_else,3\n',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.selectors[0]).toMatchObject({ user: 'svc_.*', priority: '10', clientTags: ['fast', 'etl'] })
    expect(result.config.selectors[0]?.groupId).not.toBeNull()
    expect(result.config.selectors[1]).toMatchObject({ groupId: null, unresolvedTarget: '99' })
    expect(result.config.global.cpuQuotaPeriod).toBe('1h')
    expect(result.warnings.map((warning) => warning.code)).toEqual(['unknownColumn', 'unknownGlobalProperty'])
  })

  it('rejects everything when an optional table is invalid', () => {
    const result = parseDbTables({
      resourceGroups: rows.join('\n'),
      selectors: 'resource_group_id,client_tags\n2,not-json\n',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toMatchObject({ file: 'selectors', line: 2, column: 'client_tags', code: 'badClientTags' })
  })

  it('rejects an oversized input', () => {
    const result = parseDbTables({ resourceGroups: 'x'.repeat(2 * 1024 * 1024 + 1) })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]?.code).toBe('tooLarge')
  })
})
