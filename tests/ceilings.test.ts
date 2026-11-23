import { describe, expect, it } from 'vitest'
import { ceilingBoxes, ceilingStatus, effectiveCeiling, levelShareSum, squarify, type CeilingBox } from '@/utils/ceilings'
import { parseResourceGroupsJson } from '@/utils/parseJson'
import { lowestOnPath } from '@/utils/resolve'
import { cpuLimitToVcpus, resolveMemory } from '@/utils/sizing'
import { buildTree, flattenTree, type GroupTree, type TreeNode } from '@/utils/tree'

const TREE_JSON = JSON.stringify({
  rootGroups: [
    {
      name: 'top', hardConcurrencyLimit: 10, maxQueued: 1, softMemoryLimit: '80%',
      subGroups: [
        {
          name: 'mid', hardConcurrencyLimit: 10, maxQueued: 1, softMemoryLimit: '50%', softCpuLimit: '12h', hardCpuLimit: '24h',
          subGroups: [
            { name: 'wide', hardConcurrencyLimit: 10, maxQueued: 1, softMemoryLimit: '70%' },
            { name: 'small', hardConcurrencyLimit: 10, maxQueued: 1, softMemoryLimit: '20GB' },
            { name: 'free', hardConcurrencyLimit: 10, maxQueued: 1 },
          ],
        },
        { name: 'side', hardConcurrencyLimit: 10, maxQueued: 1, softMemoryLimit: '90%', hardCpuLimit: '96h' },
      ],
    },
    { name: 'solo', hardConcurrencyLimit: 10, maxQueued: 1, softMemoryLimit: '150GB' },
  ],
  cpuQuotaPeriod: '1h',
})

function load(): GroupTree {
  const result = parseResourceGroupsJson(TREE_JSON)
  if (!result.ok) throw new Error('fixture must parse')
  return buildTree(result.config.groups)
}

describe('ceiling gauges', () => {
  const tree = load()
  const byName = (name: string): TreeNode => {
    const node = flattenTree(tree.roots).find((candidate) => candidate.group.name === name)
    if (!node) throw new Error(`no group ${name}`)
    return node
  }
  const clusterGb = 100
  const memoryOf = (node: TreeNode): number | null => resolveMemory(node.group.softMemoryLimit, clusterGb)?.gb ?? null

  const boxOf = (boxes: readonly CeilingBox[], name: string): CeilingBox => {
    for (const box of boxes) {
      if (box.node.group.name === name) return box
      if (box.children.some((child) => flattenTree([child.node]).some((node) => node.group.name === name))) return boxOf(box.children, name)
    }
    throw new Error(`no box ${name}`)
  }

  const ids = (...names: string[]): Set<string> => new Set(names.map((name) => byName(name).group.id))

  it('sizes a collapsed box by its own ceiling, so that the overflow drawn is the one of the status line', () => {
    const map = ceilingBoxes(tree, tree.roots, memoryOf, clusterGb)
    // top keeps its 80 GB although its sub-groups ask for 50 + 90: that total is only reported.
    expect(boxOf(map.boxes, 'top')).toMatchObject({ own: 80, amount: 80, subSum: 140, opened: false, excess: 0, children: [] })
    expect(boxOf(map.boxes, 'solo')).toMatchObject({ own: 150, amount: 150, subSum: 0 })
    // 80 + 150 on a 100 GB cluster: 130 GB below the cluster line, the 230 % of the status line.
    const drawn = map.boxes.reduce((sum, box) => sum + box.amount, 0)
    expect(drawn - clusterGb).toBeCloseTo(130)
    expect(map.overflow).toBeCloseTo(130)
    expect(drawn / clusterGb).toBeCloseTo(levelShareSum(tree.roots, memoryOf, clusterGb))
    expect(effectiveCeiling(byName('wide'), tree, memoryOf, clusterGb)).toBe(50)
    expect(lowestOnPath(byName('wide'), tree, memoryOf)).toMatchObject({ value: 50, holder: { group: { name: 'mid' } } })
  })

  it('grows an opened box by exactly what its sub-groups ask for beyond its ceiling', () => {
    // top opened: mid 50 + side 90 = 140 GB inside a ceiling of 80 GB. The box grows by 60 GB,
    // and its own ceiling sits at 80 / 140 of its height.
    const opened = ceilingBoxes(tree, tree.roots, memoryOf, clusterGb, ids('top'))
    const top = boxOf(opened.boxes, 'top')
    expect(top).toMatchObject({ own: 80, amount: 140, excess: 60, opened: true })
    expect((top.own ?? 0) / top.amount).toBeCloseTo(80 / 140)
    expect(top.children.map((child) => [child.node.group.name, child.amount])).toEqual([['mid', 50], ['side', 90]])
    // The label at the cluster line does not move: it counts the ceilings of the level only.
    expect(opened.overflow).toBeCloseTo(130)
    // mid opened as well: wide 70 + small 20 inside 50 GB, so mid is 90 GB and top 180 GB.
    const both = ceilingBoxes(tree, tree.roots, memoryOf, clusterGb, ids('top', 'mid'))
    expect(boxOf(both.boxes, 'mid')).toMatchObject({ amount: 90, excess: 40 })
    expect(boxOf(both.boxes, 'top')).toMatchObject({ amount: 180, excess: 100 })
    // Sub-groups are drawn to three levels: a fourth level stays closed.
    expect(ceilingBoxes(tree, tree.roots, memoryOf, clusterGb, ids('top', 'mid'), 2).boxes.map((box) => box.amount)).toEqual([140, 150])
  })

  it('lets groups without a limit share what their parent leaves, outside any overflow', () => {
    // Without the ceiling of wide: mid has 50 GB, small reserves 20, wide and free share the other 30.
    const withoutWide = (node: TreeNode): number | null => (node.group.name === 'wide' ? null : memoryOf(node))
    const shared = ceilingBoxes(tree, tree.roots, withoutWide, clusterGb, ids('top', 'mid'))
    expect(boxOf(shared.boxes, 'wide')).toMatchObject({ own: null, unlimited: true, amount: 15, upTo: 50, excess: 0 })
    expect(boxOf(shared.boxes, 'free')).toMatchObject({ unlimited: true, amount: 15 })
    expect(boxOf(shared.boxes, 'mid')).toMatchObject({ amount: 50, excess: 0 })
    // With it, nothing is left under mid: free keeps a small box and adds nothing to the 40 GB beyond.
    const full = ceilingBoxes(tree, tree.roots, memoryOf, clusterGb, ids('top', 'mid'))
    expect(boxOf(full.boxes, 'free')).toMatchObject({ unlimited: true, amount: 2.5, upTo: 50 })
    expect(boxOf(full.boxes, 'mid').excess).toBe(40)
    expect(lowestOnPath(byName('free'), tree, memoryOf)?.holder.group.name).toBe('mid')
  })

  it('draws areas proportional to the amounts, inside the given rectangle', () => {
    const items = [{ id: 'a', amount: 60 }, { id: 'b', amount: 30 }, { id: 'c', amount: 10 }, { id: 'none', amount: 0 }]
    const rects = squarify(items, { x: 0, y: 10, width: 200, height: 100 })
    const area = (id: string): number => (rects.get(id)?.width ?? 0) * (rects.get(id)?.height ?? 0)
    expect(area('a')).toBeCloseTo(12000)
    expect(area('b')).toBeCloseTo(6000)
    expect(area('c')).toBeCloseTo(2000)
    expect(rects.has('none')).toBe(false)
    for (const rect of rects.values()) {
      expect(rect.x).toBeGreaterThanOrEqual(-1e-9)
      expect(rect.y).toBeGreaterThanOrEqual(10 - 1e-9)
      expect(rect.x + rect.width).toBeLessThanOrEqual(200 + 1e-9)
      expect(rect.y + rect.height).toBeLessThanOrEqual(110 + 1e-9)
    }
  })

  it('is ok at exactly 100 % of the cluster and above from 100.1 %, for memory and CPU', () => {
    expect(ceilingStatus(1)).toBe('ok')
    expect(ceilingStatus(1.001)).toBe('above')
    expect(ceilingStatus(0)).toBe('ok')
    const pair = (first: string, second: string, cpu: boolean): GroupTree => {
      const key = cpu ? 'hardCpuLimit' : 'softMemoryLimit'
      const result = parseResourceGroupsJson(JSON.stringify({
        rootGroups: [
          { name: 'a', hardConcurrencyLimit: 1, maxQueued: 1, [key]: first },
          { name: 'b', hardConcurrencyLimit: 1, maxQueued: 1, [key]: second },
        ],
        cpuQuotaPeriod: '1h',
      }))
      if (!result.ok) throw new Error('fixture must parse')
      return buildTree(result.config.groups)
    }
    const levelSum = (pairTree: GroupTree, valueOf: (node: TreeNode) => number | null): number => levelShareSum(pairTree.roots, valueOf, 1000)
    const memorySum = (first: string, second: string): number =>
      levelSum(pair(first, second, false), (node) => resolveMemory(node.group.softMemoryLimit, 1000)?.gb ?? null)
    expect(ceilingStatus(memorySum('60%', '40%'))).toBe('ok')
    expect(ceilingStatus(memorySum('60%', '40.1%'))).toBe('above')
    const cpuSum = (first: string, second: string): number =>
      levelSum(pair(first, second, true), (node) => cpuLimitToVcpus(node.group.hardCpuLimit, '1h'))
    expect(ceilingStatus(cpuSum('600h', '400h'))).toBe('ok')
    expect(ceilingStatus(cpuSum('600h', '401h'))).toBe('above')
  })

  it('converts CPU limits to vCPUs per quota period', () => {
    expect(cpuLimitToVcpus('48h', '1h')).toBe(48)
    expect(cpuLimitToVcpus('30m', '1h')).toBe(0.5)
    expect(cpuLimitToVcpus('2d', '1d')).toBe(2)
    expect(cpuLimitToVcpus('24h', '')).toBeNull()
    expect(cpuLimitToVcpus('', '1h')).toBeNull()
    const cpuOf = (node: TreeNode): number | null => cpuLimitToVcpus(node.group.hardCpuLimit, '1h')
    // mid 24 vCPUs and side 96 vCPUs under top, on a 48 vCPU cluster: 72 vCPUs beyond it.
    const cpu = ceilingBoxes(tree, byName('top').children, cpuOf, 48)
    expect(cpu.boxes.map((box) => [box.node.group.name, box.amount])).toEqual([['mid', 24], ['side', 96]])
    expect(cpu.overflow).toBe(72)
    // Without a quota period no limit converts and there is no cluster total to measure against: no box.
    const noPeriod = (node: TreeNode): number | null => cpuLimitToVcpus(node.group.hardCpuLimit, '')
    expect(flattenTree(tree.roots).every((node) => noPeriod(node) === null)).toBe(true)
    expect(ceilingBoxes(tree, tree.roots, noPeriod, 0).boxes).toEqual([])
  })
})
