import { effectiveWeight, type Allocation } from '@/utils/allocation'
import { parentOf } from '@/utils/resolve'
import type { GroupTree, TreeNode } from '@/utils/tree'

const EPSILON = 1e-9

/** `slots`: running-query slots under the current demand. `weight`: weight share multiplied down the tree. */
export type SunburstMetric = 'slots' | 'weight'

export interface SunburstArc {
  id: string
  /** Group drawn by the arc. */
  node: TreeNode
  parentId: string
  /** Ring, starting at 1 for the children of the centre. */
  depth: number
  /** Start and end as fractions of the full circle, from 0 to 1. */
  start: number
  end: number
  value: number
  /** Position, from 1, of the first-ring ancestor of the arc. It picks the hue. */
  branch: number
}

export interface Sunburst {
  /** Value of the centre: slots the focused group receives, or 1 for weights. */
  total: number
  arcs: SunburstArc[]
}

/**
 * Lays out the descendants of `focus` as rings. One denominator is used at
 * every level: the slots that the parent receives. Each ring splits the arc
 * of its parent, so the arcs under a parent add up exactly to the arc of that
 * parent, and the centre is what the focused group itself receives. A group
 * without sub-groups is drawn as one full ring: it uses all that it receives.
 * Children keep the order of the tree.
 */
export function buildSunburst(focus: TreeNode, metric: SunburstMetric, allocation: Allocation, maxDepth = 3): Sunburst {
  const slotsOf = (node: TreeNode): number => allocation.slots.get(node.group.id) ?? 0
  const total = metric === 'slots' ? slotsOf(focus) : 1
  const arcs: SunburstArc[] = []
  if (total <= 0) return { total, arcs }
  if (focus.children.length === 0) {
    arcs.push({ id: focus.group.id, node: focus, parentId: focus.group.id, depth: 1, start: 0, end: 1, value: total, branch: 1 })
    return { total, arcs }
  }

  const place = (parent: TreeNode, start: number, end: number, depth: number, branch: number, whole: number): void => {
    if (depth > maxDepth || parent.children.length === 0 || whole <= EPSILON) return
    const weightSum = parent.children.reduce((sum, child) => sum + effectiveWeight(child, parent), 0)
    let cursor = start
    parent.children.forEach((child, index) => {
      const value =
        metric === 'slots'
          ? slotsOf(child)
          : weightSum > 0 ? (whole * effectiveWeight(child, parent)) / weightSum : whole / parent.children.length
      const width = ((end - start) * value) / whole
      if (width <= EPSILON) return
      const childBranch = depth === 1 ? index + 1 : branch
      arcs.push({ id: child.group.id, node: child, parentId: parent.group.id, depth, start: cursor, end: cursor + width, value, branch: childBranch })
      place(child, cursor, cursor + width, depth + 1, childBranch, value)
      cursor += width
    })
  }
  place(focus, 0, 1, 1, 0, total)
  return { total, arcs }
}

/** Path from the root down to a group, both included. */
export function pathTo(node: TreeNode, tree: GroupTree): TreeNode[] {
  const path: TreeNode[] = []
  for (let current: TreeNode | undefined = node; current && path.length < 100; current = parentOf(current, tree)) path.unshift(current)
  return path
}
