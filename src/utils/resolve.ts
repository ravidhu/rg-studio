import type { GroupTree, TreeNode } from '@/utils/tree'

/** Number of validated categorical colours. Further series are drawn neutral. */
export const SERIES_COUNT = 10

export interface PathMinimum {
  value: number
  /** Group, the node itself or an ancestor, that holds the lowest value. */
  holder: TreeNode
}

/**
 * Lowest value of a limit between a group and its root. A query counts in
 * every ancestor, so this is the limit that is reached first.
 */
export function lowestOnPath(node: TreeNode, tree: GroupTree, valueOf: (candidate: TreeNode) => number | null): PathMinimum | null {
  let best: PathMinimum | null = null
  let current: TreeNode | undefined = node
  for (let guard = 0; current && guard < 100; guard += 1) {
    const value = valueOf(current)
    if (value !== null && (best === null || value < best.value)) best = { value, holder: current }
    const parentId: string | null = current.group.parentId
    current = parentId === null ? undefined : tree.byId.get(parentId)
  }
  return best
}

export function parentOf(node: TreeNode, tree: GroupTree): TreeNode | undefined {
  return node.group.parentId === null ? undefined : tree.byId.get(node.group.parentId)
}

export function seriesColor(slot: number): string {
  return slot >= 1 && slot <= SERIES_COUNT ? `var(--series-${slot})` : 'var(--chart-neutral)'
}

export function onSeriesColor(slot: number): string {
  return slot >= 1 && slot <= SERIES_COUNT ? `var(--on-series-${slot})` : 'var(--card)'
}
