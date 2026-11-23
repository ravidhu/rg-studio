import { Arrow, Box, Figure, Txt } from '@/components/diagrams/primitives'
import type { ReactNode } from 'react'
import { TapTooltip } from '@/components/ui/tap-tooltip'
import { useI18n } from '@/hooks/useI18n'
import { useSoftLimitText, type SoftLimitZone } from '@/hooks/useSoftLimitText'
import type { ClusterSizing, RgConfig } from '@/types/model'
import { clusterTotals, resolveMemory } from '@/utils/sizing'
import { clip, INK } from '@/utils/diagram'
import { softLimitRivals, type SoftLimitRivals } from '@/utils/softLimit'
import { flattenTree, type GroupTree } from '@/utils/tree'
import { parseDuration, parseNonNegativeInteger } from '@/utils/units'

/** Zones a group goes through as its number of queries grows. Each zone explains itself with the live limits. */
export function SoftHardDiagram({ tree }: { tree: GroupTree }) {
  const { t, fill, num } = useI18n()
  const zoneText = useSoftLimitText()
  const found = flattenTree(tree.roots).find((node) => {
    const soft = parseNonNegativeInteger(node.group.softConcurrencyLimit)
    const hard = parseNonNegativeInteger(node.group.hardConcurrencyLimit)
    return soft !== null && hard !== null && soft < hard && parseNonNegativeInteger(node.group.maxQueued) !== null
  })
  const values = found
    ? {
        name: found.group.name,
        soft: parseNonNegativeInteger(found.group.softConcurrencyLimit) ?? 0,
        hard: parseNonNegativeInteger(found.group.hardConcurrencyLimit) ?? 0,
        queued: parseNonNegativeInteger(found.group.maxQueued) ?? 0,
      }
    : { name: t.diagrams.exampleGroup, soft: 20, hard: 30, queued: 100 }
  const rivals: SoftLimitRivals = found
    ? softLimitRivals(found, tree)
    : { kind: 'siblings', parent: t.diagrams.parentWord, siblings: [t.diagrams.exampleSibling] }
  const figures = { group: values.name, soft: num(values.soft), hard: num(values.hard), queued: num(values.queued) }
  const zones: { key: SoftLimitZone; label: string; x: number; width: number; shape: ReactNode }[] = [
    { key: 'runs', label: t.softHard.zoneRuns, x: 8, width: 80, shape: <rect x={8} y={36} width={79} height={22} rx={3} fill={INK.first} /> },
    { key: 'lower', label: t.softHard.zoneLower, x: 88, width: 96, shape: <rect x={89} y={36} width={94} height={22} rx={3} fill={INK.first} opacity={0.4} /> },
    { key: 'queued', label: t.softHard.zoneQueued, x: 184, width: 84, shape: <rect x={185} y={36} width={82} height={22} rx={3} fill={INK.track} stroke={INK.line} /> },
    { key: 'rejected', label: t.softHard.zoneRejected, x: 268, width: 64, shape: <rect x={269} y={36} width={63} height={22} rx={3} fill="none" stroke={INK.bad} strokeDasharray="4 3" /> },
  ]
  return (
    <Figure
      caption={fill(t.diagrams.softHard, { group: values.name })}
      origin={found ? t.diagrams.fromConfig : t.diagrams.illustrative}
      height={96}
    >
      <Txt x={8} y={12} bold>{clip(values.name, 16)}</Txt>
      {zones.map((zone) => {
        const tip = zoneText(zone.key, figures, rivals)
        return (
          <TapTooltip key={zone.key} tip={tip}>
            <g tabIndex={0} role="img" aria-label={tip} className="cursor-help outline-none [&:focus-visible>rect:first-child]:stroke-[var(--ring)]">
              {/* Transparent area over the bar and its label, so the whole zone answers. */}
              <rect x={zone.x} y={32} width={zone.width} height={48} fill="transparent" strokeWidth={2} />
              {zone.shape}
              <Txt x={zone.x + zone.width / 2} y={74} anchor="middle" size={11}>{zone.label}</Txt>
            </g>
          </TapTooltip>
        )
      })}
      <line x1={88} y1={28} x2={88} y2={62} stroke="currentColor" strokeWidth={1.5} />
      <line x1={184} y1={28} x2={184} y2={62} stroke="currentColor" strokeWidth={1.5} />
      <Txt x={92} y={26} anchor="end">{t.diagrams.softWord} {num(values.soft)}</Txt>
      <Txt x={180} y={26}>{t.diagrams.hardWord} {num(values.hard)}</Txt>
      <Txt x={226} y={90} anchor="middle" mono size={10.5} fill={INK.muted}>maxQueued {num(values.queued)}</Txt>
    </Figure>
  )
}

interface MemoryChainProps {
  tree: GroupTree
  sizing: ClusterSizing
}

/** From the RAM of one worker down to the GB of one group. */
export function MemoryChainDiagram({ tree, sizing }: MemoryChainProps) {
  const { t, fill, num, gb } = useI18n()
  const totals = clusterTotals(sizing)
  const nodes = flattenTree(tree.roots)
  const hasMemory = (limit: string): boolean => resolveMemory(limit, totals.queryMemoryGb) !== null
  const group = nodes.find((node) => node.depth > 0 && hasMemory(node.group.softMemoryLimit)) ?? nodes.find((node) => hasMemory(node.group.softMemoryLimit))
  const memory = group ? resolveMemory(group.group.softMemoryLimit, totals.queryMemoryGb) : null
  const perWorker = (gb: number): number => (sizing.ramPerWorkerGb > 0 ? (gb / sizing.ramPerWorkerGb) * 324 : 0)
  const heapWidth = perWorker(totals.heapGbPerWorker)
  const queryWidth = perWorker(totals.queryMemoryGbPerWorker)
  const row = (y: number, label: string, value: string) => (
    <>
      <Txt x={8} y={y}>{label}</Txt>
      <Txt x={332} y={y} anchor="end" bold>{value}</Txt>
    </>
  )
  return (
    <Figure caption={t.diagrams.memory} origin={t.diagrams.fromConfig} height={memory ? 182 : 150}>
      {row(12, t.diagrams.memRam, gb(sizing.ramPerWorkerGb))}
      <rect x={8} y={17} width={324} height={10} rx={3} fill={INK.track} stroke={INK.line} />
      {row(44, fill(t.diagrams.memHeap, { percent: num(sizing.heapPercent, 1) }), gb(totals.heapGbPerWorker))}
      <rect x={8} y={49} width={heapWidth} height={10} rx={3} fill={INK.neutral} />
      {row(76, t.diagrams.memQuery, gb(totals.queryMemoryGbPerWorker))}
      <rect x={8} y={81} width={heapWidth} height={10} rx={3} fill={INK.neutral} opacity={0.3} />
      <rect x={8} y={81} width={queryWidth} height={10} rx={3} fill={INK.first} />
      {/* The next bar restarts at full width: the scale changes from one worker to the cluster. */}
      <line x1={8} y1={93} x2={8} y2={116} stroke={INK.line} />
      <line x1={8 + queryWidth} y1={93} x2={332} y2={116} stroke={INK.line} />
      {row(130, fill(t.diagrams.memCluster, { workers: num(sizing.workers) }), gb(totals.queryMemoryGb))}
      <rect x={8} y={135} width={324} height={10} rx={3} fill={INK.first} />
      {group && memory && (
        <>
          {row(162, `${clip(group.path, 26)}: ${group.group.softMemoryLimit.trim()}`, gb(memory.gb))}
          <rect x={8} y={167} width={324} height={10} rx={3} fill={INK.track} />
          <rect x={8} y={167} width={Math.min(324, (memory.percentOfCluster / 100) * 324)} height={10} rx={3} fill={INK.first} />
        </>
      )}
    </Figure>
  )
}

interface CpuPenaltyProps {
  tree: GroupTree
  config: RgConfig
}

/** Allowed concurrency against the CPU time used in the period. */
export function CpuPenaltyDiagram({ tree, config }: CpuPenaltyProps) {
  const { t, fill, num } = useI18n()
  const found = flattenTree(tree.roots).find((node) => {
    const soft = parseDuration(node.group.softCpuLimit)
    const hard = parseDuration(node.group.hardCpuLimit)
    return soft !== null && hard !== null && hard > 0 && soft < hard && (parseNonNegativeInteger(node.group.hardConcurrencyLimit) ?? 0) > 0
  })
  const period = config.global.cpuQuotaPeriod.trim()
  const values = found
    ? {
        name: found.group.name,
        soft: found.group.softCpuLimit.trim(),
        hard: found.group.hardCpuLimit.trim(),
        ratio: (parseDuration(found.group.softCpuLimit) ?? 0) / (parseDuration(found.group.hardCpuLimit) ?? 1),
        concurrency: parseNonNegativeInteger(found.group.hardConcurrencyLimit) ?? 0,
        period: period === '' ? '?' : period,
      }
    : { name: t.diagrams.exampleGroup, soft: '6h', hard: '10h', ratio: 0.6, concurrency: 20, period: '1h' }
  const left = 40
  const right = 324
  const top = 26
  const bottom = 108
  const knee = left + values.ratio * (right - left)
  return (
    <Figure
      caption={fill(t.diagrams.cpu, { group: values.name, period: values.period })}
      origin={found ? t.diagrams.fromConfig : t.diagrams.illustrative}
      height={130}
    >
      <Txt x={4} y={12} fill={INK.muted}>{t.diagrams.cpuAllowed}</Txt>
      <Txt x={332} y={12} anchor="end" bold>{clip(values.name, 20)}</Txt>
      <polygon points={`${left},${top} ${knee},${top} ${right},${bottom} ${left},${bottom}`} fill={INK.first} opacity={0.12} />
      <line x1={knee} y1={top} x2={knee} y2={bottom} stroke={INK.line} />
      <line x1={left} y1={top - 6} x2={left} y2={bottom} stroke={INK.line} strokeWidth={1.5} />
      <line x1={left} y1={bottom} x2={right + 6} y2={bottom} stroke={INK.line} strokeWidth={1.5} />
      <polyline points={`${left},${top} ${knee},${top} ${right},${bottom}`} fill="none" stroke={INK.first} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={knee} cy={top} r={4} fill={INK.first} stroke={INK.surface} strokeWidth={2} />
      <circle cx={right} cy={bottom} r={4} fill={INK.first} stroke={INK.surface} strokeWidth={2} />
      <Txt x={left - 5} y={top + 4} anchor="end">{num(values.concurrency)}</Txt>
      <Txt x={left - 5} y={bottom + 4} anchor="end">0</Txt>
      <Txt x={left} y={123} anchor="middle">0</Txt>
      <Txt x={Math.min(Math.max(knee, 86), 222)} y={123} anchor="middle">{t.diagrams.softWord} {values.soft}</Txt>
      <Txt x={right + 8} y={123} anchor="end">{t.diagrams.hardWord} {values.hard}</Txt>
    </Figure>
  )
}

const POLICY_PANELS = [
  { policy: 'fair', values: [4, 4, 4], approximate: false },
  { policy: 'weighted_fair', values: [6, 4, 2], approximate: false },
  { policy: 'weighted', values: [6, 4, 2], approximate: true },
]
const SIBLING_COLORS = [INK.first, INK.second, INK.third]
const PRIORITIES = [9, 7, 5, 2]

/** The same three saturated sub-groups under each policy of the parent. */
export function PoliciesDiagram() {
  const { t } = useI18n()
  return (
    <Figure
      caption={t.diagrams.policies}
      origin={t.diagrams.illustrative}
      height={170}
      legend={[
        { color: INK.first, label: t.diagrams.polWeightA },
        { color: INK.second, label: t.diagrams.polWeightB },
        { color: INK.third, label: t.diagrams.polWeightC },
      ]}
    >
      {POLICY_PANELS.map((panel, index) => {
        const px = index % 2 === 0 ? 2 : 176
        const py = index < 2 ? 2 : 90
        return (
          <g key={panel.policy}>
            <Box x={px} y={py} w={162} h={78} stroke={INK.line} />
            <Txt x={px + 8} y={py + 16} mono bold>{panel.policy}</Txt>
            {panel.values.map((value, row) => {
              const y = py + 26 + row * 16
              return (
                <g key={row}>
                  <Txt x={px + 8} y={y + 9}>{['A', 'B', 'C'][row]}</Txt>
                  <rect x={px + 24} y={y} width={value * 17} height={10} rx={3} fill={SIBLING_COLORS[row]} opacity={panel.approximate ? 0.55 : 1} />
                  <Txt x={px + 30 + value * 17} y={y + 9}>{panel.approximate ? `~${value}` : value}</Txt>
                </g>
              )
            })}
          </g>
        )
      })}
      <Box x={176} y={90} w={162} h={78} stroke={INK.line} />
      <Txt x={184} y={106} mono bold>query_priority</Txt>
      <Txt x={184} y={122} size={10.5} fill={INK.muted}>{t.diagrams.polPriority}</Txt>
      {PRIORITIES.map((priority, index) => {
        const cx = 198 + index * 38
        return (
          <g key={priority}>
            <circle cx={cx} cy={140} r={10} fill="none" stroke="currentColor" />
            <Txt x={cx} y={144} anchor="middle">{priority}</Txt>
            {index < PRIORITIES.length - 1 && <Arrow x1={cx + 12} y1={140} x2={cx + 27} y2={140} color={INK.muted} />}
          </g>
        )
      })}
      <Txt x={184} y={163} size={10.5} fill={INK.muted}>{t.diagrams.polOrder}</Txt>
    </Figure>
  )
}

/** Weighted water-filling in three steps, on a parent of 100 slots. */
export function WaterFillingDiagram() {
  const { t } = useI18n()
  const x = (slots: number): number => 8 + slots * 3.24
  const segment = (y: number, from: number, to: number, color: string, label: string) => (
    <g>
      <rect x={x(from) + 1} y={y} width={x(to) - x(from) - 2} height={20} rx={3} fill={color} />
      <Txt x={x(from) + 7} y={y + 14} fill="#ffffff">{label}</Txt>
    </g>
  )
  return (
    <Figure caption={t.diagrams.model} origin={t.diagrams.illustrative} height={138}>
      <Txt x={8} y={12}>{t.diagrams.modelStep1}</Txt>
      {segment(18, 0, 50, INK.first, 'A 50')}
      {segment(18, 50, 80, INK.second, 'B 30')}
      {segment(18, 80, 100, INK.third, 'C 20')}
      <line x1={x(30)} y1={15} x2={x(30)} y2={41} stroke="currentColor" strokeWidth={2} />

      <Txt x={8} y={58}>{t.diagrams.modelStep2}</Txt>
      {segment(64, 0, 30, INK.first, 'A 30')}
      <rect x={x(30) + 1} y={64} width={x(50) - x(30) - 2} height={20} rx={3} fill="none" stroke="currentColor" strokeDasharray="4 3" />
      <Txt x={x(40)} y={78} anchor="middle">20</Txt>
      {segment(64, 50, 80, INK.second, 'B 30')}
      {segment(64, 80, 100, INK.third, 'C 20')}

      <Txt x={8} y={104}>{t.diagrams.modelStep3}</Txt>
      {segment(110, 0, 30, INK.first, 'A 30')}
      {segment(110, 30, 72, INK.second, 'B 42')}
      {segment(110, 72, 100, INK.third, 'C 28')}
    </Figure>
  )
}
