import type { CSSProperties } from 'react'
import type { RgConfig } from '@/types/model'
import type { Allocation } from '@/utils/allocation'
import type { GroupColor } from '@/utils/groupColors'
import type { ClusterTotals } from '@/utils/sizing'
import type { GroupTree, TreeNode } from '@/utils/tree'

/** What every card of the dashboard reads: data, drill level, colours and the highlighted group. */
export interface DashboardScope {
  config: RgConfig
  tree: GroupTree
  totals: ClusterTotals
  allocation: Allocation
  /** Whole number of simultaneous queries shown for each group: sub-groups add up to their parent. */
  shown: ReadonlyMap<string, number>
  /** Group whose sub-groups are listed, `null` at cluster level. */
  focus: TreeNode | null
  /** Groups listed by the cards: sub-groups of the focus, or the roots. */
  level: TreeNode[]
  /** Rows of the cards: the groups of the level, each followed by its sub-groups when it is expanded. */
  rows: LevelRow[]
  /** Expanded groups, shared by every card. */
  expanded: ReadonlySet<string>
  colors: ReadonlyMap<string, GroupColor>
  neutral: string
  /** Highlighted group: stays until its name is selected again or the level changes. */
  selectedId: string | null
  /** Group to emphasise now: the hovered one, else the highlighted one. */
  activeId: string | null
  /** Identifiers that belong with the emphasised group: itself, its ancestors and descendants. */
  related: ReadonlySet<string>
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
  onDrill: (node: TreeNode) => void
  /** Goes one level up, to the parent of the focus or to the cluster. */
  onZoomOut: () => void
  /** Shows or hides the sub-groups of a group in every card. Showing them also highlights the group. */
  onToggle: (node: TreeNode) => void
}

export interface LevelRow {
  node: TreeNode
  /** 0 for a group of the level, 1 for its sub-groups, and so on. */
  depth: number
}

/** Rows of a file tree: each group, then the rows of its sub-groups when it is expanded. */
export function expandRows(nodes: readonly TreeNode[], expanded: ReadonlySet<string>, depth = 0): LevelRow[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...(expanded.has(node.group.id) ? expandRows(node.children, expanded, depth + 1) : []),
  ])
}

export function fillOf(scope: DashboardScope, node: TreeNode): string {
  return scope.colors.get(node.group.id)?.fill ?? scope.neutral
}

/**
 * Opacity of a mark or a row while a group is emphasised: that group and
 * its sub-groups at full opacity, the others stepped back. Both values are theme tokens.
 */
export function emphasisStyle(scope: DashboardScope, id: string): CSSProperties {
  if (scope.activeId === null) return {}
  return { opacity: scope.related.has(id) ? 'var(--opacity-focus)' : 'var(--opacity-dim)' }
}

export const EMPHASIS_TRANSITION = 'transition-opacity duration-200 motion-reduce:transition-none'
