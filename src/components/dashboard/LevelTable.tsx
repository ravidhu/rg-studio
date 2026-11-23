import { GroupLabel } from '@/components/dashboard/GroupLabel'
import { EMPHASIS_TRANSITION, emphasisStyle, fillOf, type DashboardScope } from '@/components/dashboard/scope'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/hooks/useI18n'
import { useLimitedText } from '@/hooks/useLimitedText'
import { effectiveWeight } from '@/utils/allocation'
import { cn } from '@/utils/cn'
import { effectiveShare, limitedBy, weightShare } from '@/utils/dashboard'
import { parentOf } from '@/utils/resolve'
import { cpuLimitToVcpus, resolveMemory } from '@/utils/sizing'
import { flattenTree } from '@/utils/tree'
import { parseDuration } from '@/utils/units'

/**
 * One row per group of the current level, with what it gets and what holds
 * it back. An expanded group is followed by its sub-groups, as in a file
 * tree, and one button expands or collapses every group at once.
 */
export function LevelTable({ scope, onExpandAll }: { scope: DashboardScope; onExpandAll: (expand: boolean) => void }) {
  const { t, num } = useI18n()
  const limitedText = useLimitedText()
  const headers = [
    t.dashboard.colGroup, t.dashboard.colWeight, t.dashboard.colWeightShare, t.dashboard.colShare, t.dashboard.colSlots,
    t.dashboard.colMemory, t.dashboard.colCpu, t.dashboard.colQueue, t.dashboard.colLimited,
  ]
  const dash = '-'
  const periodValid = (parseDuration(scope.config.global.cpuQuotaPeriod) ?? 0) > 0
  const rows = scope.rows
  const expandable = flattenTree(scope.level).filter((node) => node.children.length > 0)
  const allExpanded = expandable.length > 0 && expandable.every((node) => scope.expanded.has(node.group.id))
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{t.dashboard.tableTitle}</CardTitle>
        {expandable.length > 0 && (
          <Button size="sm" data-expand-all="" aria-pressed={allExpanded} onClick={() => onExpandAll(!allExpanded)}>
            {allExpanded ? t.dashboard.collapseAll : t.dashboard.expandAll}
          </Button>
        )}
      </div>
      <div className="mt-3 max-w-full overflow-x-auto">
        <table className="w-full border-collapse text-[13px]" data-tree-card="">
          <thead>
            <tr>
              {headers.map((header, index) => (
                <th key={header} scope="col" className={cn('whitespace-nowrap border-b px-2 py-1.5 font-semibold text-muted-foreground', index === 0 || index === headers.length - 1 ? 'text-left' : 'text-right')}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ node, depth }) => {
              const id = node.group.id
              const parent = parentOf(node, scope.tree)
              const share = weightShare(node, scope.tree)
              const memory = resolveMemory(node.group.softMemoryLimit, scope.totals.queryMemoryGb)
              const cpu = cpuLimitToVcpus(node.group.hardCpuLimit, scope.config.global.cpuQuotaPeriod)
              const selected = scope.selectedId === id
              const cells = [
                parent ? num(effectiveWeight(node, parent)) : dash,
                share === null ? dash : `${num(share * 100, 1)} %`,
                `${num(effectiveShare(node, scope.tree, scope.allocation) * 100, 1)} %`,
                num(scope.shown.get(id) ?? 0),
                memory ? num(memory.gb, 1) : dash,
                // Without a valid quota period a CPU limit has no vCPU value: say so instead of showing the raw duration.
                cpu !== null ? num(cpu, 1) : node.group.hardCpuLimit.trim() === '' ? dash : periodValid ? node.group.hardCpuLimit : t.dashboard.cpuPeriodMissing,
                node.group.maxQueued || dash,
              ]
              return (
                <tr
                  key={id}
                  className={cn(EMPHASIS_TRANSITION, selected && 'outline-2 outline-offset-[-2px] outline-brand')}
                  style={emphasisStyle(scope, id)}
                  onMouseEnter={() => scope.onHover(id)}
                  onMouseLeave={() => scope.onHover(null)}
                >
                  <th scope="row" className="border-b px-2 py-1 text-left font-normal">
                    <GroupLabel scope={scope} node={node} depth={depth} color={fillOf(scope, node)} />
                  </th>
                  {cells.map((cell, index) => (
                    <td key={index} className="whitespace-nowrap border-b px-2 py-1 text-right tabular-nums">{cell}</td>
                  ))}
                  <td className="min-w-40 border-b px-2 py-1">{limitedText(limitedBy(node, scope.tree, scope.allocation))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="mt-3 text-sm text-muted-foreground">{t.dashboard.levelEmpty}</p>}
    </Card>
  )
}
