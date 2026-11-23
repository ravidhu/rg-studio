import { Cpu, MemoryStick } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { SeverityIcon } from '@/components/config/GroupEditor'
import { CeilingCard } from '@/components/dashboard/CeilingCard'
import { LevelBars, type LevelBarRow } from '@/components/dashboard/LevelBars'
import { LevelTable } from '@/components/dashboard/LevelTable'
import { expandRows, type DashboardScope } from '@/components/dashboard/scope'
import { SunburstCard } from '@/components/dashboard/SunburstCard'
import { ExplainButton } from '@/components/ExplainButton'
import { MemoryChainBar } from '@/components/SizingPanel'
import { Card } from '@/components/ui/card'
import { TapTooltip } from '@/components/ui/tap-tooltip'
import { useI18n } from '@/hooks/useI18n'
import { useLimitedText } from '@/hooks/useLimitedText'
import { useSeriesPalette } from '@/hooks/useSeriesPalette'
import { useSoftLimitText } from '@/hooks/useSoftLimitText'
import type { ClusterSizing, RgConfig } from '@/types/model'
import type { Allocation } from '@/utils/allocation'
import { displaySlots, hardLimitOf } from '@/utils/allocation'
import { cn } from '@/utils/cn'
import { clusterSlots, limitedBy, parentMarker } from '@/utils/dashboard'
import { assignGroupColors } from '@/utils/groupColors'
import { clusterTotals, cpuLimitToVcpus, resolveMemory } from '@/utils/sizing'
import { softLimitRivals } from '@/utils/softLimit'
import { pathTo } from '@/utils/sunburst'
import { flattenTree, type GroupTree, type TreeNode } from '@/utils/tree'
import { parseDuration, parseNonNegativeInteger } from '@/utils/units'

interface KpiTileProps {
  icon?: ReactNode
  label: string
  value: ReactNode
  note?: string
  /** Longer explanation of the note, shown on hover, on focus and on tap. */
  noteHint?: string
  /** Small visual under the note. */
  extra?: ReactNode
  /** Control at the end of the label line. */
  action?: ReactNode
  onClick?: () => void
  actionLabel?: string
}

/** Headline number: a label, the value, and a short note when the value needs one. */
function KpiTile({ icon, label, value, note, noteHint, extra, action, onClick, actionLabel }: KpiTileProps) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}<span className="min-w-0 flex-1">{label}</span>{action}</span>
      <span className="mt-0.5 block text-2xl font-semibold leading-tight">{value}</span>
      {note && !noteHint && <span className="mt-0.5 block text-xs text-muted-foreground">{note}</span>}
      {note && noteHint && (
        <TapTooltip tip={noteHint}>
          <span tabIndex={0} className="mt-0.5 block rounded text-xs text-muted-foreground underline decoration-dotted underline-offset-2" aria-label={`${note}. ${noteHint}`}>{note}</span>
        </TapTooltip>
      )}
      {extra}
    </>
  )
  const className = 'block min-w-0 rounded-lg border bg-card px-3 py-2.5 text-left'
  return onClick ? (
    <button type="button" className={cn(className, 'cursor-pointer hover:border-brand')} onClick={onClick} title={actionLabel}>{body}</button>
  ) : (
    <div className={className}>{body}</div>
  )
}

interface DashboardViewProps {
  config: RgConfig
  tree: GroupTree
  sizing: ClusterSizing
  /** Slots of every group when every leaf group has queries waiting. */
  allocation: Allocation
  errorCount: number
  warningCount: number
  onOpenChecks: () => void
}

interface History {
  /** Visited drill levels: a group identifier, or `null` for the cluster. */
  entries: (string | null)[]
  index: number
}

function largestRoot(tree: GroupTree): TreeNode | undefined {
  let best: TreeNode | undefined
  let bestSize = -1
  for (const root of tree.roots) {
    const size = flattenTree([root]).length
    if (size > bestSize) {
      best = root
      bestSize = size
    }
  }
  return best
}

/**
 * One screen that shows how the cluster is shared between groups: headline
 * numbers, the slot sunburst, the memory and CPU ceilings, concurrency and
 * queue limits, and a table. Every card follows the same drill level and
 * the same highlighted group. Slots are those of the contention case, when
 * every leaf group has queries waiting.
 */
export function DashboardView({ config, tree, sizing, allocation, errorCount, warningCount, onOpenChecks }: DashboardViewProps) {
  const { t, fill, plural, num, gb, unit } = useI18n()
  const limitedText = useLimitedText()
  const softLimitText = useSoftLimitText()
  const totals = clusterTotals(sizing)
  const { palette, neutral } = useSeriesPalette()
  const colors = useMemo(() => assignGroupColors(tree, palette, neutral), [tree, palette, neutral])

  const startRoot = largestRoot(tree)
  const [history, setHistory] = useState<History>(() => ({
    entries: [startRoot && startRoot.children.length > 0 ? startRoot.group.id : null],
    index: 0,
  }))
  const [lastRootId, setLastRootId] = useState<string | null>(startRoot?.group.id ?? null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  // Groups whose sub-groups are shown under them, in every card at once.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())

  const focusId = history.entries[history.index] ?? null
  const focus = focusId === null ? null : tree.byId.get(focusId) ?? null
  const focusPath = focus ? pathTo(focus, tree) : []
  const root = focusPath[0] ?? tree.roots.find((candidate) => candidate.group.id === lastRootId) ?? startRoot
  const level = focus ? focus.children : tree.roots
  const selected = selectedId === null ? null : tree.byId.get(selectedId) ?? null
  const activeId = hoverId ?? (selected ? selected.group.id : null)

  const related = new Set<string>()
  const active = activeId === null ? undefined : tree.byId.get(activeId)
  if (active) {
    // The emphasised group and its sub-groups stay at full opacity, every other row steps back.
    for (const node of flattenTree([active])) related.add(node.group.id)
  }

  const navigate = (id: string | null): void => {
    if (id === focusId) return
    setHistory((current) => ({ entries: [...current.entries.slice(0, current.index + 1), id], index: current.index + 1 }))
    setSelectedId(null)
    setHoverId(null)
    const target = id === null ? undefined : tree.byId.get(id)
    if (target) setLastRootId(pathTo(target, tree)[0]?.group.id ?? null)
  }
  const step = (delta: number): void => {
    setHistory((current) => ({ ...current, index: Math.min(current.entries.length - 1, Math.max(0, current.index + delta)) }))
    setSelectedId(null)
  }

  // Figures are shown as whole queries; the exact average shares stay in the tooltips.
  const shown = useMemo(() => displaySlots(tree.roots, allocation), [tree, allocation])
  const scope: DashboardScope = {
    config, tree, totals, allocation, focus, level, colors, neutral,
    shown,
    rows: expandRows(level, expanded),
    expanded,
    selectedId: selected ? selected.group.id : null,
    activeId,
    related,
    onHover: setHoverId,
    onSelect: (id) => setSelectedId((current) => (current === id ? null : id)),
    onDrill: (node) => navigate(node.group.id),
    onZoomOut: () => navigate(focusPath.length > 1 ? focusPath[focusPath.length - 2]?.group.id ?? null : null),
    onToggle: (node) => {
      const opening = !expanded.has(node.group.id)
      setExpanded((current) => {
        const next = new Set(current)
        if (opening) next.add(node.group.id)
        else next.delete(node.group.id)
        return next
      })
      // Opening a group also highlights it: its rows then stand out from the rest.
      if (opening) setSelectedId(node.group.id)
    },
  }
  const expandAll = (expand: boolean): void => {
    const inLevel = flattenTree(level).map((node) => node.group.id)
    setExpanded((current) => {
      const next = new Set(current)
      for (const id of inLevel) {
        if (expand) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const nodes = flattenTree(tree.roots)
  const leaves = nodes.filter((node) => node.children.length === 0)
  const queueTotal = tree.roots.reduce((sum, node) => sum + (parseNonNegativeInteger(node.group.maxQueued) ?? 0), 0)
  const period = config.global.cpuQuotaPeriod.trim()
  const periodValid = (parseDuration(period) ?? 0) > 0
  const anyCpuLimit = nodes.some((node) => node.group.hardCpuLimit.trim() !== '' || node.group.softCpuLimit.trim() !== '')
  const slotsOf = (node: TreeNode): number => allocation.slots.get(node.group.id) ?? 0

  const concurrencyRows: LevelBarRow[] = scope.rows.map(({ node, depth }) => {
    const slots = slotsOf(node)
    const hard = hardLimitOf(node)
    const soft = parseNonNegativeInteger(node.group.softConcurrencyLimit)
    const marker = parentMarker(node, tree, allocation)
    return {
      node,
      depth,
      track: hard,
      fill: slots,
      tick: soft,
      valueText: fill(t.dashboard.slotsOfHard, { slots: num(shown.get(node.group.id) ?? 0), hard: num(hard) }),
      fillTip: fill(t.dashboard.tipFilled, { group: node.path, slots: num(slots, 2), hard: num(hard), reason: limitedText(limitedBy(node, tree, allocation)) }),
      restTip: fill(t.dashboard.tipRest, { rest: num(Math.max(0, hard - slots), 1) }),
      tickTip:
        soft === null
          ? undefined
          : softLimitText('lower', { group: node.group.name, soft: num(soft), hard: num(hard), queued: node.group.maxQueued }, softLimitRivals(node, tree)),      // The line of a row is the limit of its own parent, whatever the level shown.
      reference: marker ? { value: marker.value, tip: fill(marker.kind === 'hard' ? t.dashboard.tipCap : t.dashboard.tipReceived, { parent: marker.parent.group.name, value: num(marker.value, marker.kind === 'hard' ? 0 : 1) }) } : undefined,
    }
  })
  const queueRows: LevelBarRow[] = scope.rows.map(({ node, depth }) => {
    const queued = parseNonNegativeInteger(node.group.maxQueued)
    const parent = node.group.parentId === null ? undefined : tree.byId.get(node.group.parentId)
    const parentQueue = parent ? parseNonNegativeInteger(parent.group.maxQueued) : null
    return {
      node,
      depth,
      track: null,
      fill: queued,
      valueText: queued === null ? t.common.notSet : num(queued),
      fillTip: fill(t.dashboard.tipQueue, { group: node.path, queued: queued === null ? t.common.notSet : num(queued) }),      reference: parentQueue !== null && parent ? { value: parentQueue, tip: fill(t.dashboard.tipQueueCap, { parent: parent.group.name, value: num(parentQueue) }) } : undefined,
    }
  })
  const focusQueue = focus ? parseNonNegativeInteger(focus.group.maxQueued) : null

  if (tree.roots.length === 0 || !root) {
    return <Card><p className="text-sm text-muted-foreground">{t.overview.empty}</p></Card>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <KpiTile label={t.dashboard.kpiSlots} value={num(clusterSlots(tree))} note={tree.roots.length > 1 ? t.dashboard.kpiSlotsNote : undefined} noteHint={t.dashboard.rootsStatement} />
        <KpiTile
          icon={<MemoryStick className="size-4 shrink-0 text-primary" aria-hidden="true" />}
          label={t.sizing.queryMemory}
          value={gb(totals.queryMemoryGb)}
          note={t.dashboard.kpiMemoryNote}
          action={<ExplainButton topic="conceptSizing" compact />}
          extra={<span className="mt-1.5 block"><MemoryChainBar sizing={sizing} /></span>}
        />
        <KpiTile icon={<Cpu className="size-4 shrink-0 text-primary" aria-hidden="true" />} label={t.sizing.totalVcpus} value={num(totals.vcpus)} />
        <KpiTile label={t.dashboard.kpiGroups} value={num(nodes.length)} note={plural(leaves.length, t.dashboard.kpiLeaves)} />
        <KpiTile label={t.dashboard.kpiQueue} value={num(queueTotal)} note={tree.roots.length > 1 ? t.dashboard.kpiQueueNote : undefined} noteHint={t.dashboard.rootsStatement} />
        <KpiTile
          label={t.dashboard.kpiIssues}
          onClick={onOpenChecks}
          actionLabel={t.dashboard.kpiIssuesLink}
          note={`${plural(errorCount, t.dashboard.errorsCount)}, ${plural(warningCount, t.dashboard.warningsCount)}`}
          value={
            <span className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1"><SeverityIcon severity="error" className="size-5" />{errorCount}</span>
              <span className="inline-flex items-center gap-1"><SeverityIcon severity="warning" className="size-5" />{warningCount}</span>
            </span>
          }
        />
      </div>

      <SunburstCard
        scope={scope}
        centre={focus && focus.children.length > 0 ? focus : root}
        root={root}
        atCluster={focus === null}
        canGoBack={history.index > 0}
        canGoForward={history.index < history.entries.length - 1}
        onBack={() => step(-1)}
        onForward={() => step(1)}
        onHome={() => navigate(root.group.id)}
        onSelectRoot={navigate}
        path={focusPath}
        onNavigate={navigate}
        onZoomOut={scope.onZoomOut}
      />

      {/* The two ceiling maps can differ a lot in height: each gets the full width, one above the other. */}
      <CeilingCard
          scope={scope}
          title={t.dashboard.memoryTitle}
          unit={unit()}
          total={totals.queryMemoryGb}
          valueOf={(node) => resolveMemory(node.group.softMemoryLimit, totals.queryMemoryGb)?.gb ?? null}
          emptyText={t.dashboard.memoryNone}
          topics={['softMemoryLimit', 'conceptClusterMemory']}
          overTopic="conceptMemoryOver"
        />
        <CeilingCard
          scope={scope}
          title={t.dashboard.cpuTitle}
          unit="vCPU"
          total={totals.vcpus}
          valueOf={(node) => cpuLimitToVcpus(node.group.hardCpuLimit, period)}
          softOf={(node) => cpuLimitToVcpus(node.group.softCpuLimit, period)}
          unresolvedOf={(node) => (!periodValid && node.group.hardCpuLimit.trim() !== '' ? t.dashboard.cpuPeriodMissing : null)}
          emptyText={t.dashboard.cpuNone}
          warning={anyCpuLimit && !periodValid ? t.dashboard.cpuNoPeriod : undefined}
          topics={['conceptCpu', 'cpuQuotaPeriod']}
          overTopic="conceptCpuOver"
        />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <LevelBars
          scope={scope}
          title={t.dashboard.concurrencyTitle}
          legend={{ fill: t.dashboard.legendSlots, track: t.dashboard.legendHard, tick: t.dashboard.legendSoft, reference: t.dashboard.legendParent }}
          legendHelp={t.dashboard.legendHelpConcurrency}
          rows={concurrencyRows}
          subtitle={focus ? fill(t.dashboard.parentLine, { parent: focus.group.name, value: num(hardLimitOf(focus)) }) : undefined}
          topics={['conceptSoftHard', 'hardConcurrencyLimit', 'schedulingWeight']}
        />
        <LevelBars
          scope={scope}
          title={t.dashboard.queuesTitle}
          legend={{ fill: t.dashboard.legendQueue, reference: t.dashboard.legendParentQueue }}
          legendHelp={t.dashboard.legendHelpQueue}
          rows={queueRows}
          subtitle={focus && focusQueue !== null ? fill(t.dashboard.parentLine, { parent: focus.group.name, value: num(focusQueue) }) : undefined}
          topics={['maxQueued', 'conceptAncestors']}
        />
      </div>

      <LevelTable scope={scope} onExpandAll={expandAll} />
    </div>
  )
}
