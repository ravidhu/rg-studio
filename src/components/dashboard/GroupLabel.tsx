import { ChevronRight } from 'lucide-react'
import { useId, type KeyboardEvent } from 'react'
import type { DashboardScope } from '@/components/dashboard/scope'
import { TapTooltip } from '@/components/ui/tap-tooltip'
import { useI18n } from '@/hooks/useI18n'
import { cn } from '@/utils/cn'
import type { TreeNode } from '@/utils/tree'

/** Indentation of one level, in pixels. Deeper rows stop at the cap so that a row still fits a phone. */
const INDENT = 16
const MAX_INDENT_LEVELS = 3

interface GroupLabelProps {
  scope: DashboardScope
  node: TreeNode
  /** Level of the row under the groups of the card, 0 for those groups themselves. */
  depth: number
  color: string
  /** Text shown instead of the group name, a full path for example. */
  name?: string
  notes?: string[]
  /** Rows that only give context, like the ancestors of the highlighted group, cannot be expanded. */
  expandable?: boolean
  /** Explanation of the figure of the row, added to the tooltip of the name. */
  tip?: string
}

/**
 * Start of a group row, the same in every list of the page, built like a row
 * of a file tree. The name highlights the group. The chevron after it shows
 * or hides its sub-groups as indented rows, in every card at once, and
 * highlights the group when it opens. Arrow keys work as in a tree: right
 * expands, left collapses or goes to the parent row.
 */
export function GroupLabel({ scope, node, depth, color, name, notes, expandable = true, tip }: GroupLabelProps) {
  const { t, fill } = useI18n()
  const describedBy = useId()
  const id = node.group.id
  const selected = scope.selectedId === id
  const canExpand = expandable && node.children.length > 0
  const open = canExpand && scope.expanded.has(id)
  const toggleLabel = fill(open ? t.dashboard.collapse : t.dashboard.expand, { group: node.group.name })
  const indent = Math.min(depth, MAX_INDENT_LEVELS) * INDENT

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>): void => {
    if (event.key === 'ArrowRight' && canExpand && !open) {
      event.preventDefault()
      scope.onToggle(node)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (open) {
        scope.onToggle(node)
        return
      }
      const parentId = node.group.parentId
      if (parentId === null) return
      const card = event.currentTarget.closest('[data-tree-card]')
      card?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(parentId)}"] [data-row-name]`)?.focus()
    }
  }

  return (
    <span
      data-row-id={id}
      data-depth={depth}
      onKeyDown={onKeyDown}
      // The line on the left is the guide of a file tree: it joins the rows of one parent.
      className={cn('flex min-w-0 items-start gap-1.5', depth > 0 && 'tree-row border-l')}
      style={depth > 0 ? { marginLeft: indent - 10, paddingLeft: 8 } : undefined}
    >
      {/* The full path and the explanation of the figure: on hover, on focus and on tap, and read out as the description of the row. */}
      <TapTooltip tip={tip ? `${node.path}\n${tip}` : node.path}>
        <button
          type="button"
          data-row-name=""
          aria-pressed={selected}
          aria-describedby={tip ? describedBy : undefined}
          onClick={() => scope.onSelect(id)}
          onFocus={() => scope.onHover(id)}
          onBlur={() => scope.onHover(null)}
          className="flex min-w-0 cursor-pointer items-start gap-2 rounded text-left hover:underline"
        >
          <span className="mt-1 size-3 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
          <span className="min-w-0">
            <span className={cn('block truncate', selected && 'font-semibold')}>{name ?? node.group.name}</span>
            {notes?.map((note) => (
              <span key={note} className="block text-xs font-normal text-muted-foreground">{note}</span>
            ))}
          </span>
        </button>
      </TapTooltip>
      {tip && <span id={describedBy} className="sr-only">{tip}</span>}
      {canExpand && (
        <TapTooltip tip={toggleLabel}>
          <button
            type="button"
            data-row-toggle=""
            aria-expanded={open}
            aria-label={toggleLabel}
            className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded border text-muted-foreground hover:bg-muted"
            onClick={() => scope.onToggle(node)}
          >
            <ChevronRight className={cn('size-3.5 transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-90')} aria-hidden="true" />
          </button>
        </TapTooltip>
      )}
    </span>
  )
}
