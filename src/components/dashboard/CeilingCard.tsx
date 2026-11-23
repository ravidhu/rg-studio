import { CircleCheck, TriangleAlert } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { ChartList, type ChartListRow } from '@/components/dashboard/ChartList'
import { EMPHASIS_TRANSITION, emphasisStyle, fillOf, type DashboardScope } from '@/components/dashboard/scope'
import { ExplainButton, ExplainRow } from '@/components/ExplainButton'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { ExpandButton } from '@/components/ui/expand-button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EXPANDED_SURFACE, useChartBox, useExpand } from '@/hooks/useExpand'
import { useI18n } from '@/hooks/useI18n'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import type { TopicKey } from '@/i18n/en'
import { ceilingBoxes, ceilingStatus, effectiveCeiling, levelShareSum, squarify, type CeilingBox, type Rect } from '@/utils/ceilings'
import { cn } from '@/utils/cn'
import { NO_BREAK_SPACE } from '@/utils/format'
import { lowestOnPath, parentOf } from '@/utils/resolve'
import { flattenTree, type TreeNode } from '@/utils/tree'

/** Room above the cluster frame for its label. */
const TOP = 18
/** Strip at the top of an opened box that keeps its name readable above its sub-groups. */
const HEADER = 16

interface CeilingCardProps {
  scope: DashboardScope
  title: string
  unit: string
  /** Size of the cluster in the unit of the ceilings. */
  total: number
  /** Ceiling of a group, `null` when it has none. */
  valueOf: (node: TreeNode) => number | null
  /** Soft limit drawn as a line across the box. */
  softOf?: (node: TreeNode) => number | null
  /** Wording for a limit that is set but cannot be converted, `null` when the group has none. */
  unresolvedOf?: (node: TreeNode) => string | null
  /** Shown when no group of the level has a ceiling of this kind. */
  emptyText: string
  /** Reason why the chart cannot be drawn. The card then shows a warning and no box. */
  warning?: string
  topics: readonly TopicKey[]
  /** Help shown when the ceilings add up to more than the cluster. */
  overTopic: TopicKey
}

/**
 * Ceilings as nested boxes on one absolute scale: the area of a box is an
 * amount, GB or vCPU, at every level. The dashed frame is the cluster. The
 * groups of the level are placed inside it at true size, so ceilings that
 * add up to more than the cluster visibly run below the frame, and that part
 * is striped. An expanded group shows its sub-groups inside its own box,
 * with the same rule. The list beside the map gives the exact values.
 */
export function CeilingCard({ scope, title, unit, total, valueOf, softOf, unresolvedOf, emptyText, warning, topics, overTopic }: CeilingCardProps) {
  const { t, fill, num } = useI18n()
  const patternId = useId()
  const { expanded: enlarged, toggle: toggleEnlarged, surface, button: enlargeButton } = useExpand()
  const [chartRef, chartBox] = useChartBox<HTMLDivElement>(enlarged)
  const selected = scope.selectedId === null ? null : scope.tree.byId.get(scope.selectedId) ?? null
  const amount = (value: number): string => `${num(value, 1)}${NO_BREAK_SPACE}${unit}`
  const percent = (part: number, whole: number): string => num(whole > 0 ? (part / whole) * 100 : 0, 1)

  // Without a usable cluster total, as for CPU limits without a quota period, nothing is sized.
  const treemap = ceilingBoxes(scope.tree, scope.level, valueOf, warning ? 0 : total, scope.expanded)
  const hasCeiling = flattenTree(scope.level).some((node) => valueOf(node) !== null)
  const showsChart = !warning && hasCeiling
  const desktop = useMediaQuery('(min-width: 1024px)')
  const shareSum = levelShareSum(scope.level, valueOf, total)
  // A visual status only: oversubscribed ceilings are legal and are not counted as an issue.
  const status = ceilingStatus(shareSum)
  const lowest = selected ? lowestOnPath(selected, scope.tree, valueOf) : null
  const focusCeiling = scope.focus ? valueOf(scope.focus) : null

  /** Exact figures of a group, the same in the list and in the tooltip. */
  const facts = (node: TreeNode): string[] => {
    const own = valueOf(node)
    const parent = parentOf(node, scope.tree)
    const cap = effectiveCeiling(parent ?? null, scope.tree, valueOf, total)
    const holder = lowestOnPath(node, scope.tree, valueOf)
    const soft = softOf?.(node) ?? null
    const lines: string[] = []
    if (own === null) {
      lines.push(fill(t.dashboard.noOwnUpTo, { value: amount(effectiveCeiling(node, scope.tree, valueOf, total)) }))
    } else {
      if (parent) lines.push(fill(t.dashboard.tipParent, { percent: percent(own, cap), parent: parent.group.name }))
      if (own > total) lines.push(t.dashboard.aboveCluster)
      else if (parent && own > cap) lines.push(t.dashboard.aboveParent)
      if (holder && holder.holder === node) lines.push(t.dashboard.effective)
      else if (holder) lines.push(fill(t.dashboard.limitedBy, { holder: holder.holder.group.name, value: amount(holder.value) }))
    }
    if (soft !== null) lines.push(fill(t.dashboard.softTick, { value: amount(soft) }))
    return lines
  }

  const rows: ChartListRow[] = scope.rows.map(({ node, depth }) => {
    const own = valueOf(node)
    return {
      id: node.group.id,
      color: fillOf(scope, node),
      name: node.group.name,
      value: own === null ? unresolvedOf?.(node) ?? t.dashboard.noLimit : amount(own),
      share: own === null || total <= 0 ? undefined : fill(t.dashboard.ofCluster, { percent: percent(own, total) }),
      notes: warning ? [] : facts(node),
      node,
      depth,
    }
  })

  // One scale for the whole map: the cluster frame has the width of the card and a height that
  // stands for the cluster total. Expanded, the height is chosen so that everything fits the window.
  const width = Math.max(200, Math.floor(chartBox.width))
  // Groups without a limit never push the map below the frame: when nothing is left for them,
  // their small boxes are fitted in, at the cost of a few percent of the area of the others.
  const reserved = treemap.boxes.filter((box) => !box.unlimited).reduce((sum, box) => sum + box.amount, 0)
  const asked = Math.max(reserved, Math.min(total, treemap.boxes.reduce((sum, box) => sum + box.amount, 0)))
  const tallest = Math.max(total, asked)
  // In the page the whole map, overflow included, stays within about 70 % of the window: the
  // cluster frame gets the height that the width suggests, less when the stack below it is tall.
  const room = chartBox.height !== null ? chartBox.height - TOP - 4 : Math.max(240, chartBox.viewport * 0.7 - TOP - 4)
  const clusterHeight = chartBox.height !== null
    ? (room * total) / tallest
    : Math.min(Math.min(240, Math.max(110, width * 0.36)), (room * total) / tallest)
  const layoutHeight = total > 0 ? (clusterHeight * asked) / total : 0
  const height = TOP + Math.max(clusterHeight, layoutHeight) + 4

  const marks: ReactNode[] = []
  const draw = (boxes: readonly CeilingBox[], area: Rect, depth: number): void => {
    const rects = squarify(boxes.map((box) => ({ id: box.node.group.id, amount: box.amount })), area)
    for (const box of boxes) {
      const node = box.node
      const id = node.group.id
      const outer = rects.get(id)
      if (!outer) continue
      const rect: Rect = { x: outer.x + 1, y: outer.y + 1, width: Math.max(0, outer.width - 2), height: Math.max(0, outer.height - 2) }
      const color = scope.colors.get(id)
      const isSelected = scope.selectedId === id
      const opened = box.opened
      // An opened box keeps a strip for its name when it is large enough, else only a thin margin.
      const header = opened && rect.height > HEADER + 20 && rect.width > 30 ? HEADER : 3
      const own = box.own
      const value = own === null ? fill(t.dashboard.noOwnUpTo, { value: amount(box.upTo) }) : amount(own)
      const lines = [
        own === null ? t.dashboard.noLimit : `${amount(own)}, ${fill(t.dashboard.ofCluster, { percent: percent(own, total) })}`,
        ...facts(node),
        ...(own !== null && box.subSum > own ? [fill(t.dashboard.aboveOwnTip, { total: amount(box.subSum), ratio: num(box.subSum / own, 1), value: amount(own) })] : []),
      ]
      // A label is printed only when it fits its box: the name, then the value under it when there is room.
      const nameFits = rect.width >= node.group.name.length * 6.6 + 10 && rect.height >= (opened ? HEADER : 18) && (!opened || header === HEADER)
      const valueFits = !opened && nameFits && rect.height >= 34 && rect.width >= value.length * 5.6 + 10
      // A collapsed box is as large as its own ceiling: what its sub-groups ask for beyond it is said on the box.
      const badgeText = !opened && own !== null && box.subSum > own ? fill(t.dashboard.subBadge, { total: amount(box.subSum), ratio: num(box.subSum / own, 1) }) : null
      const badge = badgeText !== null && valueFits && rect.height >= 50 && rect.width >= badgeText.length * 5.7 + 16 ? badgeText : null
      const soft = softOf?.(node) ?? null
      const softY = soft === null || opened || box.amount <= 0 ? null : rect.y + rect.height * Math.min(1, soft / box.amount)
      const activate = (): void => (node.children.length > 0 ? scope.onToggle(node) : scope.onSelect(id))
      marks.push(
        <Tooltip key={id}>
          <TooltipTrigger asChild>
            <g
              data-box=""
              data-depth={depth}
              data-unlimited={box.unlimited || undefined}
              tabIndex={0}
              role="button"
              aria-expanded={node.children.length > 0 ? scope.expanded.has(id) : undefined}
              aria-label={[node.path, ...lines].join('. ')}
              className="cursor-pointer outline-none [&:focus-visible>rect:first-child]:stroke-[var(--ring)] [&:focus-visible>rect:first-child]:[stroke-width:3]"
              onClick={activate}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  activate()
                }
              }}
              onMouseEnter={() => scope.onHover(id)}
              onMouseLeave={() => scope.onHover(null)}
              onFocus={() => scope.onHover(id)}
              onBlur={() => scope.onHover(null)}
            >
              <rect
                x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx={2}
                fill={color?.fill ?? scope.neutral}
                stroke={isSelected ? 'var(--brand)' : 'var(--card)'}
                strokeWidth={isSelected ? 2.5 : 1}
                className={EMPHASIS_TRANSITION}
                style={emphasisStyle(scope, id)}
              />
              {box.unlimited && <rect data-no-own="" x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx={2} fill={`url(#${patternId}-none)`} pointerEvents="none" />}
              {softY !== null && <line x1={rect.x} x2={rect.x + rect.width} y1={softY} y2={softY} stroke={color?.label ?? 'var(--foreground)'} strokeWidth={2} pointerEvents="none" />}
              {nameFits && (
                <text x={rect.x + 5} y={rect.y + 12.5} fontSize={11.5} fontWeight={isSelected ? 700 : 600} fill={color?.label ?? 'currentColor'} pointerEvents="none" style={box.unlimited ? { paintOrder: 'stroke', stroke: color?.fill ?? scope.neutral, strokeWidth: 3 } : undefined}>
                  {node.group.name}
                </text>
              )}
              {badge !== null && (
                <g data-sub-badge="" pointerEvents="none">
                  <rect x={rect.x + 3} y={rect.y + 31} width={badge.length * 5.7 + 8} height={15} rx={3} fill="var(--card)" stroke="var(--border)" />
                  <text x={rect.x + 7} y={rect.y + 42} fontSize={10.5} fill="var(--foreground)">{badge}</text>
                </g>
              )}
              {valueFits && (
                <text x={rect.x + 5} y={rect.y + 26} fontSize={10.5} fill={color?.label ?? 'currentColor'} pointerEvents="none" style={box.unlimited ? { paintOrder: 'stroke', stroke: color?.fill ?? scope.neutral, strokeWidth: 3 } : undefined}>
                  {value}
                </text>
              )}
            </g>
          </TooltipTrigger>
          <TooltipContent>
            <div className="font-medium">{node.path}</div>
            {lines.map((line) => (
              <div key={line} className="text-muted-foreground">{line}</div>
            ))}
          </TooltipContent>
        </Tooltip>,
      )
      if (!opened) continue
      const inner: Rect = { x: rect.x + 3, y: rect.y + header, width: Math.max(0, rect.width - 6), height: Math.max(0, rect.height - header - 3) }
      const inside = box.children.reduce((sum, child) => sum + child.amount, 0)
      // Sub-groups keep the scale of their parent: they fill the part of the box that they ask for.
      draw(box.children, { ...inner, height: inner.height * Math.min(1, inside / box.amount) }, depth + 1)
      if (own !== null && box.excess > own * 1e-9) {
        const lineY = inner.y + (inner.height * own) / box.amount
        // The excess is named in full when the box is wide enough, else by its amount alone.
        const room = inner.y + inner.height - lineY >= 20
        const long = fill(t.dashboard.excessLabel, { value: amount(box.excess), group: node.group.name })
        const short = fill(t.dashboard.aboveOwnBy, { value: amount(box.excess) })
        const excessLabel = !room ? null : inner.width >= long.length * 5.7 + 16 ? long : inner.width >= short.length * 5.7 + 16 ? short : null
        marks.push(
          <g key={`${id}:own`} pointerEvents="none" data-own-line="">
            <rect x={inner.x} y={lineY} width={inner.width} height={Math.max(0, inner.y + inner.height - lineY)} fill={`url(#${patternId}-above)`} />
            <line x1={inner.x} x2={inner.x + inner.width} y1={lineY} y2={lineY} stroke="var(--foreground)" strokeWidth={1.5} strokeDasharray="5 3" />
            {excessLabel !== null && (
              <g data-excess-label="">
                <rect x={inner.x + inner.width - 5 - excessLabel.length * 5.7 - 6} y={lineY + 3} width={excessLabel.length * 5.7 + 8} height={15} rx={3} fill="var(--card)" stroke="var(--border)" />
                <text x={inner.x + inner.width - 7} y={lineY + 14} textAnchor="end" fontSize={10.5} fontWeight={600} fill="var(--foreground)">{excessLabel}</text>
              </g>
            )}
          </g>,
        )
      }
    }
  }
  if (treemap.boxes.length > 0 && chartBox.width > 0) draw(treemap.boxes, { x: 0, y: TOP, width, height: layoutHeight }, 1)
  const overflowLabel = treemap.overflow > 0
    ? fill(t.dashboard.aboveClusterBy, { percent: num((treemap.overflow / total) * 100), value: amount(treemap.overflow) })
    : null

  // What limits the highlighted group, under the list that names it.
  const limitedLine = !warning && selected && lowest ? (
        <p className="mt-1 text-[13px] font-medium">
          {lowest.holder === selected
            ? fill(t.dashboard.limitedByOwn, { group: selected.group.name, value: amount(lowest.value) })
            : fill(t.dashboard.limitedByGroup, { group: selected.group.name, holder: lowest.holder.group.name, value: amount(lowest.value) })}
        </p>
      ) : null

  return (
    <Card ref={surface} data-expanded={enlarged} className={cn(warning && 'border-status-warning', enlarged && EXPANDED_SURFACE)}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <CardTitle>{title}</CardTitle>
          {/* How to read the map, on demand: the rule is not printed under it. */}
          <ExplainButton topic="conceptCeilings" compact />
        </span>
        <ExpandButton expanded={enlarged} onToggle={toggleEnlarged} buttonRef={enlargeButton} title={title} />
      </div>
      {!warning && (
        <CardDescription className="flex items-center gap-1.5 text-[13px]">
          {hasCeiling && status === 'ok' && <CircleCheck className="size-4 shrink-0 text-status-good" aria-hidden="true" />}
          {hasCeiling && status === 'above' && <TriangleAlert className="size-4 shrink-0 text-status-warning" aria-hidden="true" />}
          <span className="min-w-0" data-ceiling-status="">
            {hasCeiling && <span className="sr-only">{status === 'ok' ? t.dashboard.statusWithin : t.dashboard.statusAbove}: </span>}
            {hasCeiling ? fill(t.dashboard.sumCeilings, { percent: num(shareSum * 100) }) : emptyText}
          </span>
          {hasCeiling && status === 'above' && <ExplainButton topic={overTopic} compact />}
        </CardDescription>
      )}
      {warning && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-status-warning bg-background p-2.5 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
          {warning}
        </p>
      )}
      {/* From 1024 px the map is on the left and the list beside it, scrolling on its own when it is the taller one. */}
      <div className={cn('mt-3 grid grid-cols-1 items-start gap-4', showsChart && 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]')}>
        <div
          data-ceiling-list=""
          className={cn('order-2 min-w-0', showsChart && 'lg:overflow-y-auto lg:pr-1', enlarged && 'rounded-lg border bg-card p-3')}
          style={showsChart && desktop ? { maxHeight: Math.max(height + 40, 260) } : undefined}
        >
          <ChartList
            scope={scope}
            label={title}
            heading={
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{scope.focus ? scope.focus.group.name : t.dashboard.cluster}</span>
                {/* The figure belongs to the name beside it: the ceiling of the opened group, or the cluster total. */}
                <span className="text-sm tabular-nums">{scope.focus ? focusCeiling === null ? unresolvedOf?.(scope.focus) ?? t.dashboard.noLimit : amount(focusCeiling) : amount(total)}</span>
              </div>
            }
            rows={rows}
          />
          {limitedLine}
          {!enlarged && <ExplainRow topics={topics} />}
        </div>
        {showsChart && (
          <div className="order-1 min-w-0" data-ceiling-chart="">
            <div ref={chartRef} data-chart-area="">
              {/* Nothing is drawn before the area has been measured: a frame without its boxes would mislead. */}
              {chartBox.width > 0 && <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={title} className="block max-w-full">
                <defs>
                  {/* Both patterns draw lines, never a fill of their own, so they read the same in the two themes. */}
                  <pattern id={`${patternId}-none`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="3" height="7" fill="var(--card)" />
                  </pattern>
                  <pattern id={`${patternId}-above`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                    <rect width="1.5" height="6" fill="var(--foreground)" fillOpacity="0.38" />
                  </pattern>
                </defs>
                {marks}
                {layoutHeight > clusterHeight + 0.5 && (
                  <rect data-above-cluster="" x={0} y={TOP + clusterHeight} width={width} height={layoutHeight - clusterHeight} fill={`url(#${patternId}-above)`} pointerEvents="none" />
                )}
                <rect data-cluster-frame="" x={1} y={TOP} width={width - 2} height={clusterHeight} fill="none" stroke="var(--foreground)" strokeWidth={1.5} strokeDasharray="6 4" pointerEvents="none" />
                <text x={2} y={12} fontSize={11.5} fontWeight={600} fill="currentColor">{fill(t.dashboard.clusterBox, { value: amount(total) })}</text>
                {overflowLabel && (
                  <g pointerEvents="none">
                    {/* A plain plate keeps the label readable over the boxes and the stripes. */}
                    <rect x={Math.max(2, width - 12 - overflowLabel.length * 6.3)} y={TOP + clusterHeight + 3} width={Math.min(width - 4, overflowLabel.length * 6.3 + 10)} height={17} rx={3} fill="var(--card)" stroke="var(--border)" />
                    <text data-overflow-label="" x={width - 7} y={TOP + clusterHeight + 15.5} textAnchor="end" fontSize={11.5} fontWeight={600} fill="var(--foreground)">
                      {overflowLabel}
                    </text>
                  </g>
                )}
              </svg>}
            </div>
            {/* The marks of the map, drawn as in the map, so that no text has to name a colour. */}
            <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-xs text-muted-foreground" data-ceiling-legend="">
              <li className="inline-flex items-center gap-1.5">
                <svg viewBox="0 0 20 10" className="h-2.5 w-5" aria-hidden="true"><line x1="0" x2="20" y1="5" y2="5" stroke="var(--foreground)" strokeWidth="1.5" strokeDasharray="5 3" /></svg>
                {t.dashboard.legendOwn}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <svg viewBox="0 0 20 10" className="h-2.5 w-5" aria-hidden="true"><rect width="20" height="10" fill="var(--chart-track)" /><rect width="20" height="10" fill={`url(#${patternId}-above)`} /></svg>
                {t.dashboard.legendAbove}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <svg viewBox="0 0 20 10" className="h-2.5 w-5" aria-hidden="true"><rect width="20" height="10" fill={scope.neutral} /><rect width="20" height="10" fill={`url(#${patternId}-none)`} /></svg>
                {t.dashboard.legendNoOwn}
              </li>
              {softOf && (
                <li className="inline-flex items-center gap-1.5">
                  <svg viewBox="0 0 20 10" className="h-2.5 w-5" aria-hidden="true"><rect width="20" height="10" fill={scope.neutral} /><line x1="0" x2="20" y1="5" y2="5" stroke="var(--card)" strokeWidth="2" /></svg>
                  {t.dashboard.legendSoft}
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </Card>
  )
}
