import { parentOf } from '@/utils/resolve'
import type { GroupTree, TreeNode } from '@/utils/tree'

const EPSILON = 1e-9

/**
 * Whether the ceilings of a level fit in the cluster together. `ok` up to
 * exactly 100 %, `above` beyond. Going above is legal: it is a status to
 * read, not a problem to fix.
 */
export type CeilingStatus = 'ok' | 'above'

export function ceilingStatus(levelShareSum: number): CeilingStatus {
  return levelShareSum > 1 + EPSILON ? 'above' : 'ok'
}

/** Sum of the own ceilings of a level as a share of the cluster. Groups without a ceiling add nothing. */
export function levelShareSum(level: readonly TreeNode[], valueOf: (node: TreeNode) => number | null, clusterTotal: number): number {
  if (clusterTotal <= 0) return 0
  return level.reduce((sum, node) => sum + (valueOf(node) ?? 0) / clusterTotal, 0)
}

/**
 * Ceiling that really applies to a group: its own, capped by the ceilings of
 * its ancestors and by the cluster. A group without a ceiling of its own
 * inherits the one that applies to its parent.
 */
export function effectiveCeiling(node: TreeNode | null, tree: GroupTree, valueOf: (node: TreeNode) => number | null, clusterTotal: number): number {
  let lowest = clusterTotal
  for (let current: TreeNode | undefined = node ?? undefined, guard = 0; current && guard < 100; current = parentOf(current, tree), guard += 1) {
    const value = valueOf(current)
    if (value !== null && value < lowest) lowest = value
  }
  return Math.max(0, lowest)
}

export interface CeilingBox {
  node: TreeNode
  /** Own ceiling of the group, `null` when it has none. */
  own: number | null
  /**
   * Amount that the box stands for, on the scale of the cluster.
   * - Collapsed group with a ceiling: exactly that ceiling.
   * - Opened group: the larger of its ceiling and what its sub-groups hold
   *   together, so that they are drawn inside at their true size.
   * - Group without a ceiling: an equal share of what its parent leaves
   *   unreserved, or a small fixed share when nothing is left.
   */
  amount: number
  /** The group has no ceiling of its own: its box does not count in any overflow. */
  unlimited: boolean
  /** Ceiling that applies to a group without its own one: the lowest of its ancestors, or the cluster. */
  upTo: number
  /** Sum of the own ceilings of the direct sub-groups: what they ask for together. */
  subSum: number
  /** The sub-groups are drawn inside the box. */
  opened: boolean
  /** Part of an opened box beyond the own ceiling of the group, 0 when the sub-groups fit. */
  excess: number
  /** Boxes of the sub-groups, when the group is opened. */
  children: CeilingBox[]
}

export interface CeilingTreemap {
  /** Boxes of the level, in tree order. Empty when there is no cluster total to measure against. */
  boxes: CeilingBox[]
  /** Own ceilings of the level beyond the cluster total, 0 when they fit. Same count as `levelShareSum`. */
  overflow: number
}

/** Share of its parent given to a group without a ceiling when the parent has nothing left unreserved. */
const MINIMAL_SHARE = 0.05

/**
 * Sizes the boxes of a nested treemap of ceilings (memory, CPU). Every
 * amount is on one scale, that of the cluster, at every level.
 *
 * - A collapsed group is exactly as large as its own ceiling, whatever its
 *   sub-groups ask for: with everything collapsed, what runs beyond the
 *   cluster is the sum of the ceilings of the level minus the cluster.
 * - A group listed in `expanded` holds its sub-groups at their true size, to
 *   `maxDepth` levels. It grows when they ask for more than its ceiling, and
 *   that growth is its `excess`.
 * - Groups without a ceiling share equally what their parent leaves
 *   unreserved. They never add to an overflow.
 *
 * A cluster total of zero or less, as for CPU limits without a usable quota
 * period, gives no box at all.
 */
export function ceilingBoxes(
  tree: GroupTree,
  level: readonly TreeNode[],
  valueOf: (node: TreeNode) => number | null,
  clusterTotal: number,
  expanded: ReadonlySet<string> = new Set(),
  maxDepth = 3,
): CeilingTreemap {
  if (clusterTotal <= 0) return { boxes: [], overflow: 0 }
  const subSumOf = (node: TreeNode): number => node.children.reduce((sum, child) => sum + (valueOf(child) ?? 0), 0)
  const opens = (node: TreeNode, depth: number): boolean => node.children.length > 0 && depth < maxDepth && expanded.has(node.group.id)

  /** @param offered amount that the parent can hand out: its ceiling, or its own share when it has none */
  const build = (nodes: readonly TreeNode[], offered: number, depth: number): CeilingBox[] => {
    const limited = new Map<TreeNode, CeilingBox>()
    for (const node of nodes) {
      const own = valueOf(node)
      if (own === null) continue
      const opened = opens(node, depth)
      const children = opened ? build(node.children, own, depth + 1) : []
      const held = children.filter((child) => !child.unlimited).reduce((sum, child) => sum + child.amount, 0)
      const amount = Math.max(own, held)
      limited.set(node, { node, own, amount, unlimited: false, upTo: own, subSum: subSumOf(node), opened, excess: amount - own, children })
    }
    const reserved = [...limited.values()].reduce((sum, box) => sum + box.amount, 0)
    const withoutLimit = nodes.length - limited.size
    const left = Math.max(0, offered - reserved)
    const share = withoutLimit > 0 && left / withoutLimit > offered * MINIMAL_SHARE ? left / withoutLimit : offered * MINIMAL_SHARE
    return nodes.map((node) => {
      const known = limited.get(node)
      if (known) return known
      const opened = opens(node, depth)
      const children = opened ? build(node.children, share, depth + 1) : []
      const held = children.filter((child) => !child.unlimited).reduce((sum, child) => sum + child.amount, 0)
      return {
        node, own: null, amount: Math.max(share, held), unlimited: true, upTo: effectiveCeiling(node, tree, valueOf, clusterTotal),
        subSum: subSumOf(node), opened, excess: 0, children,
      }
    })
  }

  const first = level[0]
  const levelParent = first ? parentOf(first, tree) ?? null : null
  const boxes = build(level, effectiveCeiling(levelParent, tree, valueOf, clusterTotal), 1)
  const ownSum = level.reduce((sum, node) => sum + (valueOf(node) ?? 0), 0)
  return { boxes, overflow: Math.max(0, ownSum - clusterTotal) }
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Squarified treemap: fills `rect` with one rectangle per item, each with an
 * area proportional to its amount, keeping the rectangles close to squares.
 * Items are placed largest first, in rows along the shorter side of what is
 * left. Items without a positive amount get no rectangle.
 */
export function squarify(items: readonly { id: string; amount: number }[], rect: Rect): Map<string, Rect> {
  const out = new Map<string, Rect>()
  const sorted = items.filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount)
  const total = sorted.reduce((sum, item) => sum + item.amount, 0)
  if (total <= 0 || rect.width <= 0 || rect.height <= 0) return out
  const scale = (rect.width * rect.height) / total
  let free = { ...rect }
  let index = 0
  /** Worst width to height ratio of a row of areas laid along a side of the given length. */
  const worst = (areas: readonly number[], side: number): number => {
    const sum = areas.reduce((a, b) => a + b, 0)
    return Math.max(...areas.map((area) => Math.max((side * side * area) / (sum * sum), (sum * sum) / (side * side * area))))
  }
  while (index < sorted.length) {
    const side = Math.min(free.width, free.height)
    const row: number[] = []
    let end = index
    while (end < sorted.length) {
      const area = (sorted[end]?.amount ?? 0) * scale
      if (row.length > 0 && worst([...row, area], side) > worst(row, side)) break
      row.push(area)
      end += 1
    }
    const rowArea = row.reduce((a, b) => a + b, 0)
    const thickness = rowArea / side
    let offset = 0
    for (let position = index; position < end; position += 1) {
      const item = sorted[position]
      const length = (row[position - index] ?? 0) / thickness
      if (item) {
        out.set(item.id, free.width >= free.height
          ? { x: free.x, y: free.y + offset, width: thickness, height: length }
          : { x: free.x + offset, y: free.y, width: length, height: thickness })
      }
      offset += length
    }
    free = free.width >= free.height
      ? { x: free.x + thickness, y: free.y, width: free.width - thickness, height: free.height }
      : { x: free.x, y: free.y + thickness, width: free.width, height: free.height - thickness }
    index = end
  }
  return out
}
