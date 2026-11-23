import { CircleHelp } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { GroupLabel } from '@/components/dashboard/GroupLabel'
import { EMPHASIS_TRANSITION, emphasisStyle, fillOf, type DashboardScope } from '@/components/dashboard/scope'
import { ExplainRow } from '@/components/ExplainButton'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { ExpandButton } from '@/components/ui/expand-button'
import { EXPANDED_SURFACE, useChartBox, useExpand } from '@/hooks/useExpand'
import { TapTooltip } from '@/components/ui/tap-tooltip'
import { useI18n } from '@/hooks/useI18n'
import type { TopicKey } from '@/i18n/en'
import { cn } from '@/utils/cn'
import type { TreeNode } from '@/utils/tree'

export interface LevelBarRow {
  node: TreeNode
  /** Level of the row in the tree of the card: 0 for a group of the level, more for the sub-groups of an expanded one. */
  depth: number
  /** End of the bar: the limit of the group. `null` when the bar is the filled part only. */
  track: number | null
  /** Filled part. */
  fill: number | null
  /** Tick across the bar, the soft limit for example. */
  tick?: number | null
  valueText: string
  /** Explanations of each part, with the live values. */
  fillTip: string
  restTip?: string
  tickTip?: string
  /** Limit of the own parent of the group, drawn as a line across the row, with its explanation. */
  reference?: { value: number; tip: string }
}

export interface LevelBarLegend {
  fill: string
  track?: string
  tick?: string
  reference?: string
}

interface LevelBarsProps {
  scope: DashboardScope
  title: string
  /** Short names of the parts of a bar, shown as a legend drawn like the bars. */
  legend: LevelBarLegend
  /** Plain explanation of each part of a bar, one per line, opened from the "?" beside the legend. It is the only place that explains them. */
  legendHelp: string
  rows: LevelBarRow[]
  /** Limit of the group whose sub-groups are listed, said under the title. */
  subtitle?: string
  topics: readonly TopicKey[]
}

interface PartProps {
  /** Which part of the bar this is, for the tests and the styles. */
  kind?: 'fill' | 'rest' | 'tick' | 'reference'
  tip: string
  className: string
  style: CSSProperties
  children?: ReactNode
}

/** One part of a bar: it explains itself on hover, on keyboard focus and on tap. */
function Part({ kind, tip, className, style, children }: PartProps) {
  return (
    <TapTooltip tip={tip}>
      <span tabIndex={0} role="img" data-part={kind} aria-label={tip} className={cn('absolute outline-offset-2', className)} style={style}>
        {children}
      </span>
    </TapTooltip>
  )
}

/**
 * Horizontal bars for the groups of the current level, against the limit of
 * their parent. The legend is drawn with the same marks as the bars, so no
 * text has to name a colour.
 */
export function LevelBars({ scope, title, legend, legendHelp, rows, subtitle, topics }: LevelBarsProps) {
  const { t } = useI18n()
  const { expanded: enlarged, toggle: toggleEnlarged, surface, button: enlargeButton } = useExpand()
  const [chartRef, chartBox] = useChartBox<HTMLUListElement>(enlarged)
  // One scale for every row, whatever its depth: it reaches the largest limit drawn, parents included.
  const max = Math.max(...rows.map((row) => Math.max(row.track ?? 0, row.fill ?? 0, row.reference?.value ?? 0)), 1) * 1.02
  const anyReference = rows.some((row) => row.reference !== undefined)
  const width = (value: number): string => `${Math.min(100, (value / max) * 100)}%`
  return (
    <Card ref={surface} data-expanded={enlarged} className={cn(enlarged && EXPANDED_SURFACE)}>
      <div className="flex items-start justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        <ExpandButton expanded={enlarged} onToggle={toggleEnlarged} buttonRef={enlargeButton} title={title} />
      </div>
      {subtitle && <CardDescription>{subtitle}</CardDescription>}
      <ul className="m-0 mt-2 flex list-none flex-wrap items-center gap-x-3 gap-y-1 p-0 text-xs text-muted-foreground" data-bar-legend="">
        <li className="inline-flex items-center gap-1.5">
          {/* The filled part takes the colour of each group: the swatch shows several of them, not the one of a single group. */}
          <span className="flex h-2.5 w-7 overflow-hidden rounded-r-[3px]" aria-hidden="true" data-legend-fill="">
            {[1, 2, 3, 4].map((hue) => <span key={hue} className="h-full flex-1" style={{ backgroundColor: `var(--series-${hue})` }} />)}
          </span>
          {legend.fill}
        </li>
        {legend.track && (
          <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-r-[3px] border border-chart-axis bg-chart-track" aria-hidden="true" />{legend.track}</li>
        )}
        {legend.tick && (
          <li className="inline-flex items-center gap-1.5"><span className="h-3.5 w-[3px] bg-foreground" aria-hidden="true" />{legend.tick}</li>
        )}
        {anyReference && legend.reference && (
          <li className="inline-flex items-center gap-1.5"><span className="h-3.5 w-px bg-foreground" aria-hidden="true" />{legend.reference}</li>
        )}
        <li className="inline-flex">
          <TapTooltip tip={legendHelp}>
            <button
              type="button"
              data-legend-help=""
              aria-label={`${t.dashboard.legendHelpLabel}. ${legendHelp.replace(/\n/g, ' ')}`}
              className="inline-flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <CircleHelp className="size-4" aria-hidden="true" />
            </button>
          </TapTooltip>
        </li>
      </ul>
      {rows.length === 0 && <p className="mt-3 text-sm text-muted-foreground">{t.dashboard.levelEmpty}</p>}
      {/* Expanded, the rows share the height of the window and the bars grow with them. */}
      <ul
        ref={chartRef}
        data-tree-card=""
        data-chart-area=""
        className={cn('m-0 mt-2 list-none p-0', enlarged && 'flex flex-col')}
        style={enlarged && chartBox.height !== null ? { minHeight: chartBox.height } : undefined}
      >
        {rows.map((row) => {
          const id = row.node.group.id
          const selected = scope.selectedId === id
          const rest = row.track !== null && row.fill !== null && row.track > row.fill
          return (
            <li
              key={id}
              onMouseEnter={() => scope.onHover(id)}
              onMouseLeave={() => scope.onHover(null)}
              className={cn(
                'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-md border-t px-1.5 py-1.5 text-foreground sm:grid-cols-[11rem_minmax(0,1fr)_6.5rem]',
                EMPHASIS_TRANSITION,
                selected && 'outline-2 outline-offset-[-2px] outline-brand',
                enlarged && 'flex-1',
              )}
              style={emphasisStyle(scope, id)}
            >
              <span className="order-1 min-w-0 text-[13px]">
                <GroupLabel scope={scope} node={row.node} depth={row.depth} color={fillOf(scope, row.node)} />
              </span>
              <span className="order-2 text-right text-[13px] tabular-nums sm:order-3">{row.valueText}</span>
              {/* The bar area has the same origin and the same width on every row: only the name is indented. */}
              <span data-bar-area="" className="relative order-3 col-span-2 h-5 sm:order-2 sm:col-span-1">
                {row.fill !== null && (
                  <Part kind="fill" tip={row.fillTip} className="left-0 top-1 h-3 rounded-r-[4px]" style={{ width: width(row.fill), backgroundColor: fillOf(scope, row.node) }} />
                )}
                {rest && row.track !== null && row.fill !== null && row.restTip && (
                  <Part
                    kind="rest"
                    tip={row.restTip}
                    className="top-1 h-3 rounded-r-[4px] border border-l-0 border-chart-axis bg-chart-track"
                    style={{ left: width(row.fill), width: `calc(${width(row.track)} - ${width(row.fill)})` }}
                  />
                )}
                {row.tick !== null && row.tick !== undefined && row.tickTip && (
                  <Part tip={row.tickTip} className="inset-y-0 w-2.5 -translate-x-1/2" style={{ left: width(row.tick) }}>
                    <span className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-foreground shadow-[0_0_0_1.5px_var(--card)]" />
                  </Part>
                )}
                {row.reference && (
                  <Part kind="reference" tip={row.reference.tip} className="inset-y-0 w-2.5 -translate-x-1/2" style={{ left: width(row.reference.value) }}>
                    <span className="absolute inset-y-0 left-1/2 w-px bg-foreground" />
                  </Part>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      {!enlarged && <ExplainRow topics={topics} />}
    </Card>
  )
}
