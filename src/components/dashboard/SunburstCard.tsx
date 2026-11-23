import { ArrowLeft, ArrowRight, ChevronRight, House } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChartList, type ChartListRow } from '@/components/dashboard/ChartList'
import { EMPHASIS_TRANSITION, emphasisStyle, fillOf, type DashboardScope } from '@/components/dashboard/scope'
import { ExplainButton, ExplainRow } from '@/components/ExplainButton'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { ExpandButton } from '@/components/ui/expand-button'
import { EXPANDED_SURFACE, useChartBox, useExpand } from '@/hooks/useExpand'
import { Label, NativeSelect } from '@/components/ui/input'
import { TapTooltip } from '@/components/ui/tap-tooltip'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useChartWalk } from '@/hooks/useChartWalk'
import { useI18n } from '@/hooks/useI18n'
import { useLimitedText } from '@/hooks/useLimitedText'
import { useTweenedArcs } from '@/hooks/useTweenedArcs'
import { effectiveWeight, explainShares, hardLimitOf } from '@/utils/allocation'
import { boxFitsSector, polar, ringSector } from '@/utils/arcs'
import { cn } from '@/utils/cn'
import { clusterSlots, limitedBy, weightShare } from '@/utils/dashboard'
import { parentOf } from '@/utils/resolve'
import { buildSunburst, type SunburstArc, type SunburstMetric } from '@/utils/sunburst'
import type { TreeNode } from '@/utils/tree'

const SIZE = 320
const CENTER = SIZE / 2
const HOLE = 62
const OUTER = 156

interface SunburstCardProps {
  scope: DashboardScope
  /** Group at the centre of the chart. */
  centre: TreeNode
  /** Root group the centre belongs to. */
  root: TreeNode
  /** The level is the whole cluster: every root group side by side, and no group at the centre. */
  atCluster: boolean
  canGoBack: boolean
  canGoForward: boolean
  onBack: () => void
  onForward: () => void
  onHome: () => void
  /** Opens a root group, or the whole cluster with `null`. */
  onSelectRoot: (id: string | null) => void
  onZoomOut: () => void
  /** Groups from the root to the drill level: the breadcrumb. */
  path: TreeNode[]
  /** Goes to the drill level of a group of the breadcrumb. */
  onNavigate: (id: string) => void
}

/**
 * Headline chart: slots under the selected demand as a sunburst. The centre
 * is the focused group, the first ring its sub-groups, each further ring the
 * next level. A list beside it gives the same numbers as text. At the level
 * of the whole cluster there is no chart: root groups share nothing with
 * each other, and one circle split between them would say that they do. The
 * card then lists the root groups with their own limit, each one a way in.
 */
export function SunburstCard({ scope, centre, root, atCluster, canGoBack, canGoForward, onBack, onForward, onHome, onSelectRoot, onZoomOut, path, onNavigate }: SunburstCardProps) {
  const { t, fill, plural, num } = useI18n()
  const limitedText = useLimitedText()
  const chartWalk = useChartWalk()
  const { expanded: enlarged, toggle: toggleEnlarged, surface, button: enlargeButton } = useExpand()
  const [chartRef, chartBox] = useChartBox<HTMLDivElement>(enlarged)
  const [metric, setMetric] = useState<SunburstMetric>('slots')
  const sunburst = useMemo(() => buildSunburst(centre, metric, scope.allocation), [centre, metric, scope.allocation])
  const arcs = useTweenedArcs(sunburst.arcs)
  const rings = Math.max(1, ...sunburst.arcs.map((arc) => arc.depth))
  const thickness = Math.min(44, (OUTER - HOLE) / rings)
  const slotsOf = (node: TreeNode): number => scope.allocation.slots.get(node.group.id) ?? 0
  const cluster = clusterSlots(scope.tree)
  const percent = (part: number, whole: number): string => num(whole > 0 ? (part / whole) * 100 : 0, 1)

  // Opening a group removes the arc or the list row that had the focus. The focus then
  // goes to the new centre, or to the first arc when the centre cannot be activated.
  const svgRef = useRef<SVGSVGElement | null>(null)
  const centreId = atCluster ? 'cluster' : centre.group.id
  const shownCentre = useRef(centreId)
  useEffect(() => {
    if (shownCentre.current === centreId) return
    shownCentre.current = centreId
    // The arcs are replaced on the next frames: look once the new ones are drawn.
    const timer = window.setTimeout(() => {
      if (document.activeElement !== null && document.activeElement !== document.body) return
      const svg = svgRef.current
      ;(svg?.querySelector<SVGGElement>('[data-centre][tabindex]') ?? svg?.querySelector<SVGGElement>('[data-arc]'))?.focus()
    }, 120)
    return () => window.clearTimeout(timer)
  }, [centreId])

  const activate = (node: TreeNode): void => {
    if (node.children.length > 0) scope.onDrill(node)
    else scope.onSelect(node.group.id)
  }

  const tooltipLines = (arc: SunburstArc): string[] => {
    const node = arc.node
    const parent = parentOf(node, scope.tree)
    if (metric === 'weight') {
      const own = weightShare(node, scope.tree)
      return [
        ...(own === null ? [] : [fill(t.dashboard.tipWeight, { percent: num(own * 100, 1) })]),
        fill(t.dashboard.tipParent, { percent: num(arc.value * 100, 1), parent: centre.group.name }),
      ]
    }
    return [
      // The exact figure: an average share, which the lists show rounded to whole queries.
      fill(t.dashboard.tipSlots, { slots: num(slotsOf(node), 2) }),
      // Same denominator as the drawing and the list: the slots that the parent receives.
      ...(parent ? [fill(t.dashboard.tipParent, { percent: percent(slotsOf(node), slotsOf(parent)), parent: parent.group.name })] : []),
      fill(t.dashboard.ofCluster, { percent: percent(slotsOf(node), cluster) }),
      fill(t.dashboard.tipHard, { hard: num(hardLimitOf(node)) }),
      explanation(node) ?? fill(t.dashboard.tipLimited, { reason: limitedText(limitedBy(node, scope.tree, scope.allocation)) }),
    ]
  }

  const valueOf = (node: TreeNode): number => (metric === 'slots' ? slotsOf(node) : weightShare(node, scope.tree) ?? 0)
  const capacity = metric === 'slots' ? slotsOf(centre) : 1
  const formatValue = (value: number): string => (metric === 'slots' ? num(value, 1) : `${num(value * 100, 1)} %`)
  const shownOf = (node: TreeNode): number => scope.shown.get(node.group.id) ?? 0
  /** What holds the group back when it is not the weights, in a few words, for the row of the list. */
  const limitedLine = (node: TreeNode): string | null => {
    const reason = limitedBy(node, scope.tree, scope.allocation)
    if (reason.kind === 'ownHard') return fill(t.dashboard.listLimited.ownHard, { hard: num(hardLimitOf(node)) })
    if (reason.kind === 'parentCap') return fill(t.dashboard.listLimited.parentCap, { group: reason.holder.group.name })
    if (reason.kind === 'noDemand' || reason.kind === 'subGroups') return t.dashboard.listLimited[reason.kind]
    return null
  }
  const listed = (names: readonly string[]): string =>
    names.length <= 1 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} ${t.dashboard.explain.and} ${names[names.length - 1] ?? ''}`
  /** How the parent of a group shared its queries, in one or two sentences built from the steps of the sharing. */
  const explanation = (node: TreeNode): string | null => {
    const parent = parentOf(node, scope.tree)
    if (!parent) return null
    const steps = explainShares(parent, scope.allocation)
    const texts = t.dashboard.explain
    const total = num(shownOf(parent))
    const weights = steps.members.map((member) => `${member.node.group.name} ${num(member.weight)}`).join(', ')
    const intro = fill(texts.intro, { parent: parent.group.name, total, weights })
    if (steps.sharers.length === 0) return `${intro} ${texts.allServed}`
    if (steps.capped.length === 0) {
      const own = steps.members.find((member) => member.node === node)
      const sum = steps.members.reduce((all, member) => all + member.weight, 0)
      return own ? fill(texts.simple, { parent: parent.group.name, total, weights, group: node.group.name, weight: num(own.weight), sum: num(sum) }) : intro
    }
    const capped = steps.capped.map((member) => fill(member.hard ? texts.cappedHard : texts.cappedOther, { group: member.node.group.name, slots: num(shownOf(member.node)) }))
    const rest = shownOf(parent) - steps.capped.reduce((sum, member) => sum + shownOf(member.node), 0)
    const remainder = fill(plural(steps.sharers.length, texts.remainder), {
      rest: num(rest),
      groups: listed(steps.sharers.map((member) => member.node.group.name)),
      weights: listed(steps.sharers.map((member) => num(member.weight))),
    })
    return `${intro} ${[...capped, remainder].join(texts.join)}`
  }
  // The weight is always given; what limits the group is added only when it is not the weights.
  const notesOf = (node: TreeNode): string[] => {
    const parent = parentOf(node, scope.tree)
    const limited = limitedLine(node)
    return [...(parent && node !== centre ? [fill(t.dashboard.listWeight, { weight: num(effectiveWeight(node, parent)) })] : []), ...(limited ? [limited] : [])]
  }
  // In the list a figure is a whole number of queries, and a percentage names what it is a share of.
  const groupRow = (node: TreeNode, depth: number, value: number, whole: number, base: TreeNode): ChartListRow => ({
    id: node.group.id,
    color: fillOf(scope, node),
    name: node.group.name,
    value: metric === 'slots' ? num(shownOf(node)) : formatValue(value),
    share: metric === 'slots' && node !== base ? fill(t.dashboard.tipParent, { percent: percent(value, whole), parent: base.group.name }) : undefined,
    notes: metric === 'slots' ? notesOf(node) : undefined,
    tip: metric === 'slots' ? explanation(node) ?? undefined : undefined,
    node,
    depth,
  })
  // Sub-groups of an expanded row, each as a share of what its parent receives: the denominator of the chart.
  const nested = (parent: TreeNode, depth: number): ChartListRow[] =>
    scope.expanded.has(parent.group.id)
      ? parent.children.flatMap((child) => [groupRow(child, depth, valueOf(child), slotsOf(parent), parent), ...nested(child, depth + 1)])
      : []
  // Every sub-group of the centre has its row, largest first, so each one can be highlighted from the list.
  // A group without sub-groups uses all that it receives: it is listed alone, and is not a row to expand.
  const listRows: ChartListRow[] =
    centre.children.length > 0
      ? [...centre.children]
          .sort((a, b) => valueOf(b) - valueOf(a))
          .flatMap((node) => [groupRow(node, 0, valueOf(node), capacity, centre), ...nested(node, 1)])
      : capacity > 0 ? [{ ...groupRow(centre, 0, capacity, capacity, centre), expandable: false }] : []

  const centreParent = parentOf(centre, scope.tree)
  const description = fill(metric === 'slots' ? t.dashboard.slotsCaption : t.dashboard.weightCaption, { group: centre.group.name })
  const centreValue = metric === 'slots' ? num(shownOf(centre)) : '100 %'
  const centreOrigin =
    slotsOf(centre) >= hardLimitOf(centre) - 1e-6
      ? fill(t.dashboard.centreOrigin.own, { group: centre.group.name })
      : centreParent && slotsOf(centre) < (scope.allocation.usable.get(centre.group.id) ?? 0) - 1e-6
        ? fill(t.dashboard.centreOrigin.parent, { group: centreParent.group.name })
        : t.dashboard.centreOrigin.sub

  return (
    <Card ref={surface} data-expanded={enlarged} className={cn(enlarged && EXPANDED_SURFACE)}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <CardTitle>{t.dashboard.slotsTitle}</CardTitle>
          {/* How to read the chart, on demand: the rule is not printed under it. The help ends with the rule applied to the figures shown here. */}
          <ExplainButton topic="conceptSunburst" compact walk={chartWalk(scope, atCluster ? null : centre)} />
        </span>
        <ExpandButton expanded={enlarged} onToggle={toggleEnlarged} buttonRef={enlargeButton} title={t.dashboard.slotsTitle} />
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="flex gap-1">
          <Button size="icon" aria-label={t.dashboard.back} title={t.dashboard.back} disabled={!canGoBack} onClick={onBack}><ArrowLeft aria-hidden="true" /></Button>
          <Button size="icon" aria-label={t.dashboard.forward} title={t.dashboard.forward} disabled={!canGoForward} onClick={onForward}><ArrowRight aria-hidden="true" /></Button>
          <Button size="icon" aria-label={t.dashboard.home} title={t.dashboard.home} disabled={!atCluster && centre === root} onClick={onHome}><House aria-hidden="true" /></Button>
        </div>
        {scope.tree.roots.length > 1 && (
          <div className="min-w-32">
            <Label htmlFor="sunburst-root" className="sr-only">{t.dashboard.rootSwitch}</Label>
            <NativeSelect id="sunburst-root" className="h-8" value={atCluster ? '' : root.group.id} onChange={(event) => onSelectRoot(event.target.value === '' ? null : event.target.value)}>
              <option value="">{t.dashboard.wholeCluster}</option>
              {scope.tree.roots.map((candidate) => (
                <option key={candidate.group.id} value={candidate.group.id}>{candidate.group.name}</option>
              ))}
            </NativeSelect>
          </div>
        )}
        <nav aria-label={t.dashboard.cluster} className="min-w-0 flex-1 basis-40 self-center">
          <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0 text-sm">
            {[null, ...path].map((node, index, all) => {
              const last = index === all.length - 1
              const name = node ? node.group.name : t.dashboard.cluster
              return (
                <li key={node ? node.group.id : 'cluster'} className="flex min-w-0 items-center gap-1">
                  {index > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  {last ? (
                    <span aria-current="page" className="font-semibold [overflow-wrap:anywhere]">{name}</span>
                  ) : node ? (
                    <button type="button" className="cursor-pointer rounded text-primary underline [overflow-wrap:anywhere]" onClick={() => onNavigate(node.group.id)}>
                      {name}
                    </button>
                  ) : (
                    // The cluster only says where the path starts: it is not a level to open from here.
                    <span data-crumb-cluster="" className="text-muted-foreground [overflow-wrap:anywhere]">{name}</span>
                  )}
                </li>
              )
            })}
          </ol>
        </nav>
        {/* The two metrics describe a sharing between sub-groups: there is none between root groups. */}
        {!atCluster && <div className="flex rounded-md border p-0.5" role="group" aria-label={t.dashboard.metric}>
          {(['slots', 'weight'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={metric === option}
              onClick={() => setMetric(option)}
              className={cn('cursor-pointer rounded px-2.5 py-1 text-[13px] font-medium', metric === option ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
            >
              {option === 'slots' ? t.dashboard.metricSlots : t.dashboard.metricWeight}
            </button>
          ))}
        </div>}
      </div>

      {atCluster && (
        <div className="mt-3 max-w-xl" data-cluster-roots="">
          <p className="text-sm text-muted-foreground">{t.dashboard.rootsIndependent}</p>
          <div className="mb-1.5 mt-3 flex items-baseline justify-between gap-2 border-b pb-1.5">
            <span className="text-sm font-semibold">{t.dashboard.cluster}</span>
            <span className="shrink-0 text-sm tabular-nums">{num(cluster)} {t.dashboard.shortQueries}</span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0" aria-label={t.dashboard.rootSwitch}>
            {scope.tree.roots.map((candidate) => {
              const id = candidate.group.id
              const limit = fill(t.dashboard.tipHard, { hard: num(hardLimitOf(candidate)) })
              const content = (
                <>
                  <span className="mt-1 size-3 shrink-0 rounded-full" style={{ backgroundColor: fillOf(scope, candidate) }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{candidate.group.name}</span>
                  <span className="shrink-0 text-right tabular-nums">{limit}</span>
                </>
              )
              return (
                <li key={id} className={EMPHASIS_TRANSITION} style={emphasisStyle(scope, id)} onMouseEnter={() => scope.onHover(id)} onMouseLeave={() => scope.onHover(null)}>
                  {/* A root group without sub-groups has no level of its own to open. */}
                  {candidate.children.length > 0 ? (
                    <button
                      type="button"
                      data-cluster-root={id}
                      aria-label={`${fill(t.dashboard.openRoot, { group: candidate.group.name })}. ${limit}`}
                      className="flex w-full cursor-pointer items-start gap-2 rounded-md px-1.5 py-1.5 text-left text-[13px] text-foreground hover:bg-muted"
                      onClick={() => onSelectRoot(id)}
                    >
                      {content}
                      <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </button>
                  ) : (
                    <span className="flex items-start gap-2 px-1.5 py-1.5 text-[13px]">{content}<span className="size-4 shrink-0" aria-hidden="true" /></span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <div className={cn('mt-3 grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]', atCluster && 'hidden')}>
        <div className="order-2 md:order-1">
          <ChartList
            scope={scope}
            label={description}
            heading={
              <div className="flex items-baseline justify-between gap-2">
                <TapTooltip tip={centre.path}>
                  <span tabIndex={0} className="min-w-0 truncate rounded text-sm font-semibold" aria-label={centre.path}>{centre.group.name}</span>
                </TapTooltip>
                <span className="shrink-0 text-sm tabular-nums">{centreValue} {metric === 'slots' ? t.dashboard.shortQueries : ''}</span>
              </div>
            }
            rows={listRows}
          />
        </div>
        <div ref={chartRef} className="order-1 min-w-0 md:order-2" data-chart-area="">
          {/* Expanded, the chart is the largest square that fits the window next to the list. */}
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="group"
            aria-label={description}
            className={cn('mx-auto block aspect-square w-full', !enlarged && 'min-w-[280px] max-w-[28rem]')}
            style={enlarged && chartBox.height !== null ? { maxWidth: Math.max(240, Math.min(chartBox.width, chartBox.height - 28)) } : undefined}
          >
            {arcs.map((arc) => {
              const inner = HOLE + (arc.depth - 1) * thickness
              const outer = inner + thickness - 2
              const d = ringSector(CENTER, CENTER, inner, outer, arc.start, arc.end)
              if (d === '') return null
              const node = arc.node
              const color = scope.colors.get(node.group.id)
              const middle = polar(CENTER, CENTER, (inner + outer) / 2, (arc.start + arc.end) / 2)
              // The label is horizontal: its box must stay inside the arc, radially and along it, and inside the drawing.
              const fits = thickness >= 18 && boxFitsSector(
                { x: CENTER, y: CENTER },
                { x: middle.x, y: middle.y, width: node.group.name.length * 6.6 + 8, height: 16 },
                inner, outer, arc.start, arc.end, SIZE,
              )
              const selected = scope.selectedId === node.group.id
              return (
                <Tooltip key={arc.id}>
                  <TooltipTrigger asChild>
                    <g
                      data-arc=""
                      tabIndex={0}
                      role="button"
                      aria-label={[node.path, ...tooltipLines(arc)].join('. ')}
                      className="cursor-pointer outline-none [&:focus-visible>path]:stroke-[var(--ring)] [&:focus-visible>path]:[stroke-width:3]"
                      onClick={() => activate(node)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          activate(node)
                        }
                      }}
                      onMouseEnter={() => scope.onHover(node.group.id)}
                      onMouseLeave={() => scope.onHover(null)}
                      onFocus={() => scope.onHover(node.group.id)}
                      onBlur={() => scope.onHover(null)}
                    >
                      <path
                        d={d}
                        fill={color?.fill ?? scope.neutral}
                        stroke={selected ? 'var(--brand)' : 'var(--card)'}
                        strokeWidth={selected ? 2 : 1}
                        className={EMPHASIS_TRANSITION}
                        style={emphasisStyle(scope, node.group.id)}
                      />
                      {fits && (
                        <text x={middle.x} y={middle.y + 4} textAnchor="middle" fontSize={11.5} fontWeight={selected ? 700 : 500} fill={color?.label ?? 'currentColor'} pointerEvents="none">
                          {node.group.name}
                        </text>
                      )}
                    </g>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="font-medium">{node.path}</div>
                    {tooltipLines(arc).map((line) => (
                      <div key={line} className="text-muted-foreground">{line}</div>
                    ))}
                  </TooltipContent>
                </Tooltip>
              )
            })}
            <g
              data-centre=""
              tabIndex={centreParent ? 0 : undefined}
              role={centreParent ? 'button' : undefined}
              aria-label={centreParent ? fill(t.dashboard.zoomOut, { group: centre.group.name }) : undefined}
              className={cn('outline-none [&:focus-visible>circle]:stroke-[var(--ring)]', centreParent && 'cursor-pointer')}
              onClick={() => centreParent && onZoomOut()}
              onKeyDown={(event) => {
                if (centreParent && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault()
                  onZoomOut()
                }
              }}
            >
              <circle cx={CENTER} cy={CENTER} r={HOLE - 4} fill="var(--card)" stroke="var(--border)" strokeWidth={1.5} />
              <text x={CENTER} y={CENTER - 8} textAnchor="middle" fontSize={24} fontWeight={600} fill="currentColor" data-centre-value="">{centreValue}</text>
              <text x={CENTER} y={CENTER + 9} textAnchor="middle" fontSize={10.5} fill="var(--muted-foreground)">
                {metric === 'slots' ? t.dashboard.centreSlots : t.dashboard.centreWeight}
              </text>
              {/* Where the figure comes from: the own hard limit of the group, or what its parent hands down. */}
              {metric === 'slots' && (
                <text x={CENTER} y={CENTER + 23} textAnchor="middle" fontSize={9.5} fill="var(--muted-foreground)" data-centre-origin="">
                  <title>{centreOrigin}</title>
                  {centreOrigin.length > 24 ? `${centreOrigin.slice(0, 23)}…` : centreOrigin}
                </text>
              )}
            </g>
          </svg>
        </div>
      </div>
      {/* The reading of the chart itself is behind the "?" of the title: the chips here are the other topics. */}
      {!enlarged && <ExplainRow topics={atCluster ? ['conceptRoots'] : ['conceptModel', 'conceptRoots']} />}
    </Card>
  )
}
