import type { TreeNode } from '@/utils/tree'
import { parseNonNegativeInteger } from '@/utils/units'

/**
 * Steady-state estimate of how the running-query slots of one root group are
 * shared when the selected leaf groups all have more queries than they can run.
 *
 * Model: weighted water-filling, applied recursively from the root.
 * - A group never holds more slots than its hard concurrency limit, than what
 *   its parent hands down, or than what its own descendants can use.
 * - A parent shares its slots between the children that have demand in
 *   proportion to their weight. A child that reaches its ceiling keeps that
 *   amount and the surplus is shared again between the remaining children.
 *
 * The weight is `schedulingWeight` (default 1) when the parent policy is
 * `weighted` or `weighted_fair`. Under `fair` and `query_priority` the model
 * uses equal weights.
 *
 * Not modelled: soft concurrency limits, CPU and memory limits, query
 * priorities, arrival order, query duration and the randomness of `weighted`.
 */

export interface Allocation {
  /** Slots per group identifier, not rounded. */
  slots: Map<string, number>
  /** Most slots each group could use given the current demand. */
  usable: Map<string, number>
}

/** Hard concurrency limit of a group. An unreadable value counts as zero. */
export function hardLimitOf(node: TreeNode): number {
  return parseNonNegativeInteger(node.group.hardConcurrencyLimit) ?? 0
}

/** Whether a parent shares by the weights of its sub-groups. Under the other policies the shares are equal. */
export function sharesByWeight(parent: TreeNode): boolean {
  const policy = parent.group.schedulingPolicy.trim().toLowerCase()
  return policy === 'weighted' || policy === 'weighted_fair'
}

/** Weight the parent applies to this child when sharing its slots. */
export function effectiveWeight(child: TreeNode, parent: TreeNode): number {
  if (!sharesByWeight(parent)) return 1
  if (child.group.schedulingWeight.trim() === '') return 1
  return parseNonNegativeInteger(child.group.schedulingWeight) ?? 1
}

/**
 * @param root   root of the tree to share
 * @param demand queries each leaf wants to run, by group identifier. Use
 *               `Infinity` for a saturated leaf. A missing leaf has no demand.
 */
export function allocate(root: TreeNode, demand: ReadonlyMap<string, number>): Allocation {
  const usable = new Map<string, number>()
  const computeUsable = (node: TreeNode): number => {
    let value: number
    if (node.children.length === 0) {
      value = Math.min(hardLimitOf(node), Math.max(0, demand.get(node.group.id) ?? 0))
    } else {
      let sum = 0
      for (const child of node.children) sum += computeUsable(child)
      value = Math.min(hardLimitOf(node), sum)
    }
    usable.set(node.group.id, value)
    return value
  }
  computeUsable(root)

  const slots = new Map<string, number>()
  const share = (node: TreeNode, handed: number): void => {
    const granted = Math.min(handed, usable.get(node.group.id) ?? 0)
    slots.set(node.group.id, granted)
    if (node.children.length === 0) return

    const given = new Map<string, number>()
    let pending = node.children.filter((child) => (usable.get(child.group.id) ?? 0) > 0)
    let left = granted
    while (pending.length > 0 && left > 1e-9) {
      let totalWeight = 0
      for (const child of pending) totalWeight += effectiveWeight(child, node)
      // When every remaining weight is zero the remainder is split evenly.
      const portion = (child: TreeNode): number =>
        totalWeight > 0 ? (left * effectiveWeight(child, node)) / totalWeight : left / pending.length
      const saturated = pending.filter((child) => (usable.get(child.group.id) ?? 0) <= portion(child) + 1e-9)
      if (saturated.length === 0) {
        for (const child of pending) given.set(child.group.id, portion(child))
        break
      }
      for (const child of saturated) {
        const ceiling = usable.get(child.group.id) ?? 0
        given.set(child.group.id, ceiling)
        left -= ceiling
      }
      pending = pending.filter((child) => !saturated.includes(child))
    }
    for (const child of node.children) share(child, given.get(child.group.id) ?? 0)
  }
  share(root, Infinity)
  return { slots, usable }
}

/**
 * Rounds shares to whole numbers that still add up to `total`: each value is
 * rounded down, then the units left over go to the largest remainders. Used
 * for display, so that the rounded sub-groups of a group sum to the rounded
 * figure shown for that group.
 */
export function roundKeepingSum(values: readonly number[], total: number): number[] {
  const floors = values.map((value) => Math.max(0, Math.floor(value + 1e-9)))
  let left = Math.round(total) - floors.reduce((sum, value) => sum + value, 0)
  const byRemainder = values
    .map((value, index) => ({ index, remainder: value - (floors[index] ?? 0) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  const out = [...floors]
  for (let turn = 0; left > 0 && turn < byRemainder.length; turn += 1, left -= 1) {
    const index = byRemainder[turn]?.index ?? 0
    out[index] = (out[index] ?? 0) + 1
  }
  return out
}

/**
 * Whole number of simultaneous queries shown for every group: a root is
 * rounded on its own, then the sub-groups of each group share its rounded
 * figure, level by level, so every list adds up.
 */
export function displaySlots(roots: readonly TreeNode[], allocation: Allocation): Map<string, number> {
  const shown = new Map<string, number>()
  const visit = (node: TreeNode, own: number): void => {
    shown.set(node.group.id, own)
    const shares = roundKeepingSum(node.children.map((child) => allocation.slots.get(child.group.id) ?? 0), own)
    node.children.forEach((child, index) => visit(child, shares[index] ?? 0))
  }
  for (const root of roots) visit(root, Math.round(allocation.slots.get(root.group.id) ?? 0))
  return shown
}

/** One sub-group in the sharing of its parent. */
export interface ShareMember {
  node: TreeNode
  weight: number
  /** Simultaneous queries it receives. */
  slots: number
}

/**
 * How a parent shared its simultaneous queries between its sub-groups: the
 * steps of the weighted sharing, read back from its result.
 */
export interface ShareExplanation {
  parent: TreeNode
  /** What the parent had to share. */
  total: number
  /** Sub-groups that take part, with their weights, in tree order. */
  members: ShareMember[]
  /** Those that cannot use their weight share: they keep their ceiling. `hard` tells whether that ceiling is their own hard limit. */
  capped: (ShareMember & { hard: boolean })[]
  /** What is left once the capped sub-groups are served, shared by weight between `sharers`. */
  remainder: number
  sharers: ShareMember[]
}

/** Explains the shares of the sub-groups of `parent`, for a tooltip. */
export function explainShares(parent: TreeNode, allocation: Allocation): ShareExplanation {
  const slotsOf = (node: TreeNode): number => allocation.slots.get(node.group.id) ?? 0
  const usableOf = (node: TreeNode): number => allocation.usable.get(node.group.id) ?? 0
  const members = parent.children
    .filter((child) => usableOf(child) > 0)
    .map((child) => ({ node: child, weight: effectiveWeight(child, parent), slots: slotsOf(child) }))
  const total = slotsOf(parent)
  // A sub-group that got all it can use was served first; the others split what is left by weight.
  const capped = members
    .filter((member) => member.slots >= usableOf(member.node) - 1e-6)
    .map((member) => ({ ...member, hard: member.slots >= hardLimitOf(member.node) - 1e-6 }))
  const sharers = members.filter((member) => !capped.some((other) => other.node === member.node))
  // When every sub-group is served in full there is nothing left to share: no one is singled out.
  if (sharers.length === 0) return { parent, total, members, capped, remainder: 0, sharers }
  return { parent, total, members, capped, remainder: total - capped.reduce((sum, member) => sum + member.slots, 0), sharers }
}

/** One sub-group in the worked example of a level. */
export interface WalkMember {
  node: TreeNode
  weight: number
  /** What its weight alone would give it, before any ceiling. */
  first: number
  /** What it receives in the end: the figure shown for it. */
  final: number
  /** Why it keeps less than, or exactly, what it can use: its own hard limit, or what its sub-groups can run. `null` when it shares what is left. */
  cap: 'hard' | 'sub' | null
}

/**
 * The sharing of one group between its sub-groups as a worked example, in
 * the whole numbers shown on screen (`shown`, from `displaySlots`), so that
 * a text built from it quotes the same figures as the chart and its list.
 */
export interface LevelWalk {
  /** Figure shown for the group itself. */
  total: number
  /** The policy of the group uses the weights. Otherwise the shares are equal. */
  weighted: boolean
  /** Sub-groups that take part, in tree order. */
  members: WalkMember[]
  /** Sub-groups that can run nothing. */
  idle: TreeNode[]
  /** What the capped sub-groups leave to the others, on top of their first share. */
  surplus: number
}

export function walkLevel(parent: TreeNode, allocation: Allocation, shown: ReadonlyMap<string, number>): LevelWalk {
  const steps = explainShares(parent, allocation)
  const shownOf = (node: TreeNode): number => shown.get(node.group.id) ?? 0
  const total = shownOf(parent)
  const weightSum = steps.members.reduce((sum, member) => sum + member.weight, 0)
  // Same rule as `allocate`: by weight, or evenly when every weight is zero.
  const firsts = roundKeepingSum(
    steps.members.map((member) => (weightSum > 0 ? (total * member.weight) / weightSum : total / steps.members.length)),
    total,
  )
  const members: WalkMember[] = steps.members.map((member, index) => {
    const capped = steps.capped.find((other) => other.node === member.node)
    return { node: member.node, weight: member.weight, first: firsts[index] ?? 0, final: shownOf(member.node), cap: capped ? (capped.hard ? 'hard' : 'sub') : null }
  })
  const surplus = members.filter((member) => member.cap === null).reduce((sum, member) => sum + member.final - member.first, 0)
  return {
    total,
    weighted: sharesByWeight(parent),
    members,
    idle: parent.children.filter((child) => !steps.members.some((member) => member.node === child)),
    surplus: Math.max(0, surplus),
  }
}
