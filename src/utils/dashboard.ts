import { effectiveWeight, hardLimitOf, type Allocation } from '@/utils/allocation'
import { parentOf } from '@/utils/resolve'
import type { GroupTree, TreeNode } from '@/utils/tree'

const EPSILON = 1e-6

/** Running-query slots of the whole cluster: root groups share no cap, so their limits add up. */
export function clusterSlots(tree: GroupTree): number {
  return tree.roots.reduce((sum, root) => sum + hardLimitOf(root), 0)
}

/** Share of the cluster slots that a group holds under the current demand, from 0 to 1. */
export function effectiveShare(node: TreeNode, tree: GroupTree, allocation: Allocation): number {
  const total = clusterSlots(tree)
  return total > 0 ? (allocation.slots.get(node.group.id) ?? 0) / total : 0
}

/** Weight of a group as a fraction of the weights of its siblings, or `null` for a root. */
export function weightShare(node: TreeNode, tree: GroupTree): number | null {
  const parent = parentOf(node, tree)
  if (!parent) return null
  const total = parent.children.reduce((sum, sibling) => sum + effectiveWeight(sibling, parent), 0)
  return total > 0 ? effectiveWeight(node, parent) / total : 0
}

/**
 * Why a group does not hold more slots under the current demand.
 * - `noDemand`: neither the group nor its sub-groups ask for anything.
 * - `ownHard`: it runs as many queries as its own hard limit allows.
 * - `demand`: a leaf that got everything it asked for.
 * - `subGroups`: its sub-groups cannot use more (their limits or their demand).
 * - `parentCap`: it takes what is left under an ancestor that is at its hard limit.
 * - `weightShare`: it competes with siblings and gets its weight share of the parent.
 * - `parentShare`: it takes all that its parent receives, and the parent is itself limited.
 */
export type LimitedBy =
  | { kind: 'noDemand' | 'ownHard' | 'demand' | 'subGroups' }
  | { kind: 'parentCap' | 'weightShare' | 'parentShare'; holder: TreeNode }

export function limitedBy(node: TreeNode, tree: GroupTree, allocation: Allocation): LimitedBy {
  const slotsOf = (candidate: TreeNode): number => allocation.slots.get(candidate.group.id) ?? 0
  const usableOf = (candidate: TreeNode): number => allocation.usable.get(candidate.group.id) ?? 0
  const slots = slotsOf(node)
  const usable = usableOf(node)
  if (usable <= EPSILON) return { kind: 'noDemand' }
  if (slots >= hardLimitOf(node) - EPSILON) return { kind: 'ownHard' }
  if (slots >= usable - EPSILON) return { kind: node.children.length === 0 ? 'demand' : 'subGroups' }
  // From here the group wants more than what its parent hands down.
  const parent = parentOf(node, tree)
  if (!parent) return { kind: 'ownHard' }
  const rivals = parent.children.filter((sibling) => sibling !== node && slotsOf(sibling) < usableOf(sibling) - EPSILON)
  if (rivals.length > 0) return { kind: 'weightShare', holder: parent }
  if (slotsOf(parent) >= hardLimitOf(parent) - EPSILON) return { kind: 'parentCap', holder: parent }
  return { kind: 'parentShare', holder: parent }
}

/** The limit above a group that its bar is compared with. */
export interface ParentMarker {
  parent: TreeNode
  value: number
  /** `hard`: the hard limit of the parent. `received`: what the parent receives, when the group takes all of it. */
  kind: 'hard' | 'received'
}

/**
 * Limit of the own parent of a group, for the line drawn across its bar. It
 * is the hard limit of that parent, except when the group is held back by
 * what its parent receives (the `parentShare` case of `limitedBy`): the line
 * is then at that amount. A root group has none.
 */
export function parentMarker(node: TreeNode, tree: GroupTree, allocation: Allocation): ParentMarker | null {
  const parent = parentOf(node, tree)
  if (!parent) return null
  if (limitedBy(node, tree, allocation).kind === 'parentShare') return { parent, value: allocation.slots.get(parent.group.id) ?? 0, kind: 'received' }
  return { parent, value: hardLimitOf(parent), kind: 'hard' }
}
