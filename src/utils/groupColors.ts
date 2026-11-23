import { labelColorOn, shiftColor } from '@/utils/color'
import type { GroupTree, TreeNode } from '@/utils/tree'

export interface GroupColor {
  fill: string
  /** Ink to use for text printed on the fill. */
  label: string
}

/**
 * One colour per group, the same in every chart, list and table.
 * - The sub-groups of a root (and a root without sub-groups) take the hues of
 *   the categorical palette in tree order, so a colour never depends on the
 *   demand scenario or on the zoom level.
 * - Deeper groups take a variant of their parent: lighter, with the hue
 *   turned a little differently for each sibling.
 * - A root that has sub-groups is the whole, not a part: it is neutral.
 */
export function assignGroupColors(tree: GroupTree, palette: readonly string[], neutral: string): Map<string, GroupColor> {
  const colors = new Map<string, GroupColor>()
  const set = (node: TreeNode, fill: string): void => {
    colors.set(node.group.id, { fill, label: labelColorOn(fill) })
  }
  let next = 0
  const hue = (): string => {
    const color = palette.length > 0 ? palette[next % palette.length] ?? neutral : neutral
    next += 1
    return color
  }
  const descend = (parent: TreeNode, parentFill: string): void => {
    const count = parent.children.length
    const step = Math.min(26, Math.max(8, 60 / Math.max(1, count)))
    parent.children.forEach((child, index) => {
      // Neighbours also alternate in lightness, which keeps them apart when hue is hard to see.
      const fill = shiftColor(parentFill, (index - (count - 1) / 2) * step, index % 2 === 0 ? 0.045 : 0.09)
      set(child, fill)
      descend(child, fill)
    })
  }
  for (const root of tree.roots) {
    if (root.children.length === 0) {
      set(root, hue())
      continue
    }
    set(root, neutral)
    for (const child of root.children) {
      const fill = hue()
      set(child, fill)
      descend(child, fill)
    }
  }
  return colors
}
