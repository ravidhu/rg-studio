import type { ReactNode } from 'react'
import { GroupLabel } from '@/components/dashboard/GroupLabel'
import { EMPHASIS_TRANSITION, emphasisStyle, type DashboardScope } from '@/components/dashboard/scope'
import { cn } from '@/utils/cn'
import type { TreeNode } from '@/utils/tree'

export interface ChartListRow {
  id: string
  color: string
  name: string
  /** Main figure, for example `64.5 GB`. */
  value: string
  /** Secondary figure, for example `60 %`. */
  share?: string
  /** Short remarks under the name. */
  notes?: string[]
  /** Group of the row: its name highlights it and, when it has sub-groups, a chevron shows them. */
  node: TreeNode
  /** Level of the row in the tree of the card, 0 when absent. */
  depth?: number
  /** `false` for a row that only gives context and cannot be expanded. */
  expandable?: boolean
  /** Longer explanation of the figure of a group row, shown when the name is pointed at. */
  tip?: string
}

interface ChartListProps {
  scope: DashboardScope
  heading: ReactNode
  rows: ChartListRow[]
  label: string
}

/**
 * List beside a chart: one row per group with its colour, name and
 * figures. It carries the same numbers as the chart, so it is also its text
 * alternative. Rows behave as in every list of the page: see `GroupLabel`.
 */
export function ChartList({ scope, heading, rows, label }: ChartListProps) {
  return (
    <div className="min-w-0" data-tree-card="">
      <div className="mb-1.5 border-b pb-1.5">{heading}</div>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0" aria-label={label}>
        {rows.map((row) => {
          const selected = scope.selectedId === row.id
          return (
            <li
              key={row.id}
              className={cn(
                'flex items-start gap-2 rounded-md px-1.5 py-1 text-[13px] text-foreground',
                EMPHASIS_TRANSITION,
                selected && 'outline-2 outline-offset-[-2px] outline-brand',
              )}
              style={emphasisStyle(scope, row.id)}
              onMouseEnter={() => scope.onHover(row.id)}
              onMouseLeave={() => scope.onHover(null)}
            >
              <GroupLabel scope={scope} node={row.node} depth={row.depth ?? 0} color={row.color} name={row.name} notes={row.notes} expandable={row.expandable} tip={row.tip} />
              <span className="ml-auto shrink-0 text-right tabular-nums">
                <span className="block">{row.value}</span>
                {row.share && <span className="block text-xs text-muted-foreground">{row.share}</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
