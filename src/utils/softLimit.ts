import { parentOf } from '@/utils/resolve'
import type { GroupTree, TreeNode } from '@/utils/tree'

/** Groups a soft concurrency limit is weighed against: the other sub-groups of the same parent. */
export type SoftLimitRivals =
  | { kind: 'root' }
  | { kind: 'alone'; parent: string }
  | { kind: 'siblings'; parent: string; siblings: string[] }

export function softLimitRivals(node: TreeNode, tree: GroupTree): SoftLimitRivals {
  const parent = parentOf(node, tree)
  // Root groups do not compete with each other: nothing is shared between them.
  if (!parent) return { kind: 'root' }
  const siblings = parent.children.filter((child) => child !== node).map((child) => child.group.name)
  return siblings.length === 0 ? { kind: 'alone', parent: parent.group.name } : { kind: 'siblings', parent: parent.group.name, siblings }
}

/**
 * Names in a sentence: `a`, `a and b`, `a, b and c`, then the first three
 * followed by the number of others. `others` receives that number.
 */
export function listNames(names: readonly string[], and: string, others: (count: number) => string): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length > 3) return `${names.slice(0, 3).join(', ')} ${others(names.length - 3)}`
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1] ?? ''}`
}
