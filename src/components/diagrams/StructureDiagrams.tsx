import { ArrowDown, ArrowRight } from 'lucide-react'
import { Arrow, Box, Figure, Txt } from '@/components/diagrams/primitives'
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/hooks/useI18n'
import type { ClusterSizing, RgConfig, Selector } from '@/types/model'
import { SELECTOR_REGEX_FIELDS } from '@/types/model'
import { clip, INK, WIDTH } from '@/utils/diagram'
import { onSeriesColor, parentOf, seriesColor } from '@/utils/resolve'
import { orderedSelectors } from '@/utils/selectors'
import { clusterTotals, cpuLimitToVcpus, resolveMemory } from '@/utils/sizing'
import { flattenTree, type GroupTree, type TreeNode } from '@/utils/tree'
import { parseNonNegativeInteger } from '@/utils/units'

interface TreeProps {
  tree: GroupTree
}

interface Level {
  name: string
  hard: string
  sibling: { name: string; hard: string } | null
}

/** Path from a root to its deepest leaf, reduced to three levels at most. */
function nestedLevels(tree: GroupTree): Level[] | null {
  const nodes = flattenTree(tree.roots)
  let deepest: TreeNode | undefined
  for (const node of nodes) {
    if (node.children.length === 0 && (!deepest || node.depth > deepest.depth)) deepest = node
  }
  if (!deepest || deepest.depth === 0) return null
  const chain: TreeNode[] = []
  for (let current: TreeNode | undefined = deepest; current; current = parentOf(current, tree)) chain.unshift(current)
  const last = chain[chain.length - 1]
  const beforeLast = chain[chain.length - 2]
  const first = chain[0]
  if (!first || !last || !beforeLast) return null
  const kept = chain.length <= 3 ? chain : [first, beforeLast, last]
  return kept.map((node) => {
    const sibling = parentOf(node, tree)?.children.find((child) => child !== node)
    return {
      name: node.group.name,
      hard: node.group.hardConcurrencyLimit || '?',
      sibling: sibling ? { name: sibling.group.name, hard: sibling.group.hardConcurrencyLimit || '?' } : null,
    }
  })
}

const SAMPLE_LEVELS: Level[] = [
  { name: 'root', hard: '100', sibling: null },
  { name: 'team', hard: '60', sibling: { name: 'other', hard: '40' } },
  { name: 'leaf', hard: '20', sibling: { name: 'leaf_2', hard: '50' } },
]

/** Nested boxes: the query sits in its leaf, so it is inside every ancestor too. */
export function AncestorsDiagram({ tree }: TreeProps) {
  const { t } = useI18n()
  const real = nestedLevels(tree)
  const levels = real ?? SAMPLE_LEVELS
  const outerHeight = levels.length === 3 ? 166 : 122
  const [outer, middle, inner] = levels
  const leafBox = levels.length === 3 ? { x: 24, y: 58, w: 118, h: outerHeight - 74 } : { x: 14, y: 30, w: 206, h: outerHeight - 36 }
  if (!outer || !middle) return null
  return (
    <Figure
      caption={t.diagrams.ancestors}
      origin={real ? t.diagrams.fromConfig : t.diagrams.illustrative}
      height={outerHeight + 8}
      legend={[{ color: INK.first, label: t.diagrams.query }]}
    >
      <Box x={4} y={4} w={332} h={outerHeight} />
      <Txt x={12} y={20} bold>{clip(outer.name, 30)}</Txt>
      <Txt x={328} y={20} anchor="end">1 / {outer.hard}</Txt>

      <Box x={14} y={30} w={206} h={outerHeight - 36} />
      <Txt x={22} y={46} bold>{clip(middle.name, 18)}</Txt>
      <Txt x={212} y={46} anchor="end">1 / {middle.hard}</Txt>
      {middle.sibling && (
        <>
          <Box x={228} y={30} w={98} h={outerHeight - 36} dashed stroke={INK.muted} />
          <Txt x={236} y={46} fill={INK.muted}>{clip(middle.sibling.name, 13)}</Txt>
          <Txt x={236} y={62} fill={INK.muted}>0 / {middle.sibling.hard}</Txt>
        </>
      )}

      {inner && (
        <>
          <Box x={24} y={58} w={118} h={outerHeight - 74} />
          <Txt x={32} y={74} bold>{clip(inner.name, 16)}</Txt>
          <Txt x={32} y={90}>1 / {inner.hard}</Txt>
          {inner.sibling && (
            <>
              <Box x={150} y={58} w={62} h={outerHeight - 74} dashed stroke={INK.muted} />
              <Txt x={156} y={74} fill={INK.muted}>{clip(inner.sibling.name, 8)}</Txt>
              <Txt x={156} y={90} fill={INK.muted}>0 / {inner.sibling.hard}</Txt>
            </>
          )}
        </>
      )}
      <circle cx={leafBox.x + leafBox.w - 22} cy={leafBox.y + leafBox.h - 20} r={9} fill={INK.first} stroke={INK.surface} strokeWidth={2} />
    </Figure>
  )
}

/** Hard limits of the sub-groups laid end to end, against the limit of their parent. */
export function OversubscriptionDiagram({ tree }: TreeProps) {
  const { t, fill, num } = useI18n()
  const hardOf = (node: TreeNode): number => parseNonNegativeInteger(node.group.hardConcurrencyLimit) ?? 0
  const sumOf = (node: TreeNode): number => node.children.reduce((sum, child) => sum + hardOf(child), 0)
  const parents = flattenTree(tree.roots).filter((node) => node.children.length > 0 && hardOf(node) > 0)
  const parent = parents.find((node) => sumOf(node) > hardOf(node)) ?? parents[0]
  if (!parent) return null
  const cap = hardOf(parent)
  const sum = sumOf(parent)
  const shown = parent.children.slice(0, 6)
  const rest = parent.children.slice(6).reduce((total, child) => total + hardOf(child), 0)
  const parts = [
    ...shown.map((child, index) => ({ label: child.group.name, value: hardOf(child), slot: index + 1 })),
    ...(rest > 0 ? [{ label: t.diagrams.other, value: rest, slot: 0 }] : []),
  ].filter((part) => part.value > 0)
  const total = Math.max(sum, cap, 1)
  const scale = (value: number): number => 8 + (value / total) * 324
  const capX = scale(cap)
  const equation = `${parts.map((part) => num(part.value)).join(' + ')} = ${num(sum)}`
  const edges = parts.reduce<number[]>((list, part) => [...list, (list[list.length - 1] ?? 0) + part.value], [])
  return (
    <Figure
      caption={fill(sum > cap ? t.diagrams.oversubAbove : t.diagrams.oversubWithin, { parent: parent.group.name, sum: num(sum), cap: num(cap) })}
      origin={t.diagrams.fromConfig}
      height={92}
      legend={parts.map((part) => ({ color: seriesColor(part.slot), label: `${part.label} ${num(part.value)}` }))}
    >
      {parts.map((part, index) => {
        const start = scale((edges[index] ?? 0) - part.value)
        const end = scale(edges[index] ?? 0)
        const label = num(part.value)
        return (
          <g key={part.label}>
            <rect x={start + 1} y={34} width={Math.max(0, end - start - 2)} height={22} rx={3} fill={seriesColor(part.slot)} />
            {end - start > label.length * 7 + 10 && (
              <Txt x={start + 6} y={49} fill={onSeriesColor(part.slot)}>{label}</Txt>
            )}
          </g>
        )
      })}
      {sum > cap && <rect x={capX} y={32} width={332 - capX} height={26} fill={INK.surface} opacity={0.6} />}
      <line x1={capX} y1={22} x2={capX} y2={64} stroke="currentColor" strokeWidth={2} />
      <Txt x={Math.min(Math.max(capX, 70), 270)} y={15} anchor="middle" bold>
        {clip(parent.group.name, 18)}: {num(cap)}
      </Txt>
      {equation.length <= 48 && <Txt x={WIDTH / 2} y={82} anchor="middle" fill={INK.muted}>{equation}</Txt>}
    </Figure>
  )
}

/** A selector may target a leaf, never a group that has sub-groups. */
export function LeafDiagram() {
  const { t } = useI18n()
  const leaf = (x: number, y: number, w: number) => (
    <g>
      <Box x={x} y={y} w={w} h={24} />
      <circle cx={x + 12} cy={y + 12} r={4} fill={INK.first} />
      <Txt x={x + 22} y={y + 16}>{t.common.leaf}</Txt>
    </g>
  )
  return (
    <Figure caption={t.diagrams.leaf} origin={t.diagrams.illustrative} height={144} legend={[{ color: INK.first, label: t.diagrams.receives }]}>
      <Box x={130} y={6} w={80} h={24} />
      <Txt x={170} y={22} anchor="middle">{t.common.root}</Txt>
      <line x1={170} y1={30} x2={110} y2={60} stroke={INK.line} strokeWidth={1.5} />
      <line x1={170} y1={30} x2={230} y2={60} stroke={INK.line} strokeWidth={1.5} />
      {leaf(70, 60, 80)}
      <Box x={190} y={60} w={80} h={24} />
      <Txt x={230} y={76} anchor="middle">{t.diagrams.parentWord}</Txt>
      <line x1={230} y1={84} x2={188} y2={112} stroke={INK.line} strokeWidth={1.5} />
      <line x1={230} y1={84} x2={274} y2={112} stroke={INK.line} strokeWidth={1.5} />
      {leaf(150, 112, 76)}
      {leaf(236, 112, 76)}

      <Txt x={6} y={64}>{t.diagrams.selectorWord}</Txt>
      <Arrow x1={6} y1={72} x2={68} y2={72} color={INK.good} />
      <polyline points="26,84 31,89 40,79" fill="none" stroke={INK.good} strokeWidth={2} />

      <Txt x={334} y={64} anchor="end">{t.diagrams.selectorWord}</Txt>
      <Arrow x1={334} y1={72} x2={272} y2={72} color={INK.bad} />
      <line x1={298} y1={80} x2={308} y2={90} stroke={INK.bad} strokeWidth={2} />
      <line x1={308} y1={80} x2={298} y2={90} stroke={INK.bad} strokeWidth={2} />
    </Figure>
  )
}

interface RootsDiagramProps {
  tree: GroupTree
  config: RgConfig
  sizing: ClusterSizing
}

/**
 * Every limit of every root group, and their sums. Independence is not only
 * about concurrency: queue, memory and CPU limits add up in the same way.
 * A table, because the figures are read and compared, not drawn.
 */
export function RootsDiagram({ tree, config, sizing }: RootsDiagramProps) {
  const { t, num, gb } = useI18n()
  if (tree.roots.length === 0) return null
  const totals = clusterTotals(sizing)
  const period = config.global.cpuQuotaPeriod
  const rows = tree.roots.map((root) => ({
    name: root.group.name,
    running: parseNonNegativeInteger(root.group.hardConcurrencyLimit),
    queued: parseNonNegativeInteger(root.group.maxQueued),
    memory: resolveMemory(root.group.softMemoryLimit, totals.queryMemoryGb),
    cpu: cpuLimitToVcpus(root.group.hardCpuLimit, period),
  }))
  const sum = (values: (number | null)[]): number | null =>
    values.some((value) => value !== null) ? values.reduce<number>((total, value) => total + (value ?? 0), 0) : null
  const memorySum = sum(rows.map((row) => row.memory?.gb ?? null))
  const cpuSum = sum(rows.map((row) => row.cpu))
  const share = (value: number, whole: number): string => `${num(whole > 0 ? (value / whole) * 100 : 0)} %`
  const count = (value: number | null): string => (value === null ? t.common.notSet : num(value))
  const twoLines = (first: string, second: string) => (
    <>
      <span className="block">{first}</span>
      <span className="block text-muted-foreground">{second}</span>
    </>
  )
  const headers = [t.common.root, t.diagrams.rootsRunning, t.diagrams.rootsQueued, t.diagrams.rootsMemory, t.diagrams.rootsCpu]
  return (
    <figure className="m-0 mb-3">
      <div className="max-w-full overflow-x-auto">
        <table className="w-full border-collapse text-xs tabular-nums">
          <thead>
            <tr>
              {headers.map((header, index) => (
                <th key={header} scope="col" className={`border-b px-1.5 py-1 font-semibold text-muted-foreground ${index === 0 ? 'text-left' : 'text-right'}`}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.name}-${index}`}>
                <th scope="row" className="border-b px-1.5 py-1 text-left font-medium [overflow-wrap:anywhere]">{row.name}</th>
                <td className="border-b px-1.5 py-1 text-right">{count(row.running)}</td>
                <td className="border-b px-1.5 py-1 text-right">{count(row.queued)}</td>
                <td className="border-b px-1.5 py-1 text-right">
                  {row.memory ? twoLines(share(row.memory.gb, totals.queryMemoryGb), gb(row.memory.gb)) : t.dashboard.noLimit}
                </td>
                <td className="border-b px-1.5 py-1 text-right">{row.cpu === null ? t.dashboard.noLimit : `${num(row.cpu, 1)} vCPU`}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <th scope="row" className="px-1.5 py-1 text-left">{t.diagrams.rootsSum}</th>
              <td className="px-1.5 py-1 text-right">{count(sum(rows.map((row) => row.running)))}</td>
              <td className="px-1.5 py-1 text-right">{count(sum(rows.map((row) => row.queued)))}</td>
              <td className="px-1.5 py-1 text-right">
                {memorySum === null ? t.dashboard.noLimit : twoLines(share(memorySum, totals.queryMemoryGb), gb(memorySum))}
              </td>
              <td className="px-1.5 py-1 text-right">
                {cpuSum === null ? t.dashboard.noLimit : twoLines(share(cpuSum, totals.vcpus), `${num(cpuSum, 1)} vCPU`)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <figcaption className="mt-1.5 text-[13px] text-muted-foreground">
        {t.diagrams.rootsCaption}
        <Badge className="ml-1.5">{t.diagrams.fromConfig}</Badge>
      </figcaption>
    </figure>
  )
}

const REGEX_ROWS = [
  { pattern: 'bob', value: 'bob', covered: 3 },
  { pattern: 'bob', value: 'bobby', covered: 3 },
  { pattern: 'bob.*', value: 'bobby', covered: 5 },
]

/** Full match: a value with characters left over does not match. */
export function RegexDiagram() {
  const { t } = useI18n()
  return (
    <Figure caption={t.diagrams.regex} origin={t.diagrams.illustrative} height={112}>
      <Txt x={8} y={12} fill={INK.muted}>{t.diagrams.regexPattern}</Txt>
      <Txt x={110} y={12} fill={INK.muted}>{t.diagrams.regexValue}</Txt>
      {REGEX_ROWS.map((row, index) => {
        const y = 22 + index * 30
        const matches = row.covered === row.value.length
        return (
          <g key={`${row.pattern}-${row.value}`}>
            <Txt x={8} y={y + 15} mono>{row.pattern}</Txt>
            {row.value.split('').map((char, position) => {
              const covered = position < row.covered
              return (
                <g key={position}>
                  <rect
                    x={110 + position * 22}
                    y={y}
                    width={20}
                    height={22}
                    rx={3}
                    fill={covered ? INK.first : 'none'}
                    fillOpacity={covered ? 0.22 : 0}
                    stroke={covered ? INK.first : INK.bad}
                    strokeDasharray={covered ? undefined : '3 2'}
                  />
                  <Txt x={120 + position * 22} y={y + 15} anchor="middle" mono>{char}</Txt>
                </g>
              )
            })}
            {matches ? (
              <polyline points={`244,${y + 11} 250,${y + 17} 261,${y + 5}`} fill="none" stroke={INK.good} strokeWidth={2} />
            ) : (
              <g stroke={INK.bad} strokeWidth={2}>
                <line x1={246} y1={y + 5} x2={258} y2={y + 17} />
                <line x1={258} y1={y + 5} x2={246} y2={y + 17} />
              </g>
            )}
          </g>
        )
      })}
    </Figure>
  )
}

/** One template group, one created group per user. */
export function TemplatesDiagram() {
  const { t } = useI18n()
  return (
    <Figure caption={t.diagrams.templates} origin={t.diagrams.illustrative} height={120}>
      <Txt x={8} y={14} fill={INK.muted}>{t.diagrams.tplUser}</Txt>
      <Txt x={152} y={14} anchor="middle" fill={INK.muted}>{t.diagrams.tplTemplate}</Txt>
      <Txt x={332} y={14} anchor="end" fill={INK.muted}>{t.diagrams.tplCreated}</Txt>
      <Box x={8} y={30} w={62} h={24} />
      <Txt x={39} y={46} anchor="middle" mono>alice</Txt>
      <Box x={8} y={86} w={62} h={24} />
      <Txt x={39} y={102} anchor="middle" mono>bob</Txt>
      <Box x={96} y={57} w={112} h={26} dashed />
      <Txt x={152} y={74} anchor="middle" mono>{'adhoc_${USER}'}</Txt>
      <Arrow x1={70} y1={44} x2={96} y2={62} />
      <Arrow x1={70} y1={98} x2={96} y2={78} />
      <Box x={232} y={30} w={100} h={24} stroke={INK.first} />
      <Txt x={282} y={46} anchor="middle" mono>adhoc_alice</Txt>
      <Box x={232} y={86} w={100} h={24} stroke={INK.first} />
      <Txt x={282} y={102} anchor="middle" mono>adhoc_bob</Txt>
      <Arrow x1={208} y1={62} x2={232} y2={44} />
      <Arrow x1={208} y1={78} x2={232} y2={98} />
    </Figure>
  )
}

const MANAGER_ROWS = [
  { id: '1', name: 'global', parent: '' },
  { id: '2', name: 'etl', parent: '1' },
  { id: '3', name: 'bi', parent: '1' },
]

/** The same tree as nested JSON and as rows with a parent column. */
export function ManagerDiagram() {
  const { t } = useI18n()
  return (
    <Figure caption={t.diagrams.manager} origin={t.diagrams.illustrative} height={126}>
      <Txt x={8} y={12} mono size={10.5} fill={INK.muted}>resource-groups.json</Txt>
      <Box x={8} y={22} w={146} h={98} />
      <Txt x={16} y={38} mono>global</Txt>
      <Txt x={16} y={54} mono size={10.5} fill={INK.muted}>subGroups</Txt>
      <Box x={16} y={62} w={62} h={46} />
      <Txt x={47} y={89} anchor="middle" mono>etl</Txt>
      <Box x={84} y={62} w={62} h={46} />
      <Txt x={115} y={89} anchor="middle" mono>bi</Txt>

      <Txt x={170} y={78} anchor="middle" size={16}>=</Txt>

      <Txt x={190} y={12} mono size={10.5} fill={INK.muted}>resource_groups</Txt>
      <Txt x={194} y={36} mono size={10.5} fill={INK.muted}>id</Txt>
      <Txt x={222} y={36} mono size={10.5} fill={INK.muted}>name</Txt>
      <Txt x={286} y={36} mono size={10.5} fill={INK.muted}>parent</Txt>
      <line x1={190} y1={42} x2={334} y2={42} stroke={INK.line} />
      {MANAGER_ROWS.map((row, index) => (
        <g key={row.id}>
          <Txt x={194} y={60 + index * 22} mono>{row.id}</Txt>
          <Txt x={222} y={60 + index * 22} mono>{row.name}</Txt>
          <Txt x={286} y={60 + index * 22} mono fill={row.parent === '' ? INK.muted : 'currentColor'}>{row.parent === '' ? 'NULL' : row.parent}</Txt>
          <line x1={190} y1={67 + index * 22} x2={334} y2={67 + index * 22} stroke={INK.line} />
        </g>
      ))}
    </Figure>
  )
}

function conditionSummary(selector: Selector): string {
  const parts: string[] = SELECTOR_REGEX_FIELDS.filter((field) => selector[field] !== '').map((field) => `${field} ${selector[field]}`)
  if (selector.queryType.trim() !== '') parts.push(`queryType ${selector.queryType.trim()}`)
  if (selector.clientTags.length > 0) parts.push(`clientTags ${selector.clientTags.join(', ')}`)
  return parts.join(' + ')
}

interface SelectorFlowProps {
  config: RgConfig
  tree: GroupTree
}

/**
 * Top-down flow of the selectors of the configuration. Drawn with text boxes
 * instead of an SVG because the conditions are free text that must wrap.
 */
export function SelectorFlowDiagram({ config, tree }: SelectorFlowProps) {
  const { t, fill } = useI18n()
  const ordered = orderedSelectors(config)
  const shown = ordered.slice(0, 4)
  if (ordered.length === 0) return <p className="mb-3 text-[13px] text-muted-foreground">{t.diagrams.selNone}</p>
  return (
    <figure className="m-0 mb-3">
      <div role="img" aria-label={t.diagrams.selectors} className="max-w-[30rem] text-[13px]">
        <div className="inline-block rounded-md border border-foreground px-2.5 py-1 font-medium">{t.diagrams.selQuery}</div>
        <ol className="m-0 list-none p-0">
          {shown.map((selector, index) => {
            const node = selector.groupId === null ? undefined : tree.byId.get(selector.groupId)
            const summary = conditionSummary(selector)
            return (
              <li key={selector.id}>
                <ArrowDown className="ml-4 size-4 text-muted-foreground" aria-hidden="true" />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <div className="min-w-0 max-w-full rounded-md border px-2.5 py-1">
                    <span className="font-medium">{index + 1}. </span>
                    <code>{summary === '' ? t.diagrams.selAny : clip(summary, 60)}</code>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-[var(--status-good)]" aria-hidden="true" />
                  <code className="min-w-0 rounded-md border border-[var(--series-1)] px-2 py-1">{node ? node.path : selector.unresolvedTarget || '?'}</code>
                </div>
              </li>
            )
          })}
          <li>
            <ArrowDown className="ml-4 size-4 text-muted-foreground" aria-hidden="true" />
            {ordered.length > shown.length && (
              <>
                <div className="text-muted-foreground">{fill(t.diagrams.selMore, { count: ordered.length - shown.length })}</div>
                <ArrowDown className="ml-4 size-4 text-muted-foreground" aria-hidden="true" />
              </>
            )}
            <div className="inline-block rounded-md border border-dashed border-[var(--status-error)] px-2.5 py-1">{t.diagrams.selRejected}</div>
          </li>
        </ol>
      </div>
      <figcaption className="mt-1.5 text-[13px] text-muted-foreground">
        {t.diagrams.selectors}
        <Badge className="ml-1.5">{t.diagrams.fromConfig}</Badge>
      </figcaption>
    </figure>
  )
}
