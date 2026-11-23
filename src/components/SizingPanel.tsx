import { Cpu, MemoryStick } from 'lucide-react'
import { useId, useState } from 'react'
import { Input, Label } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/hooks/useI18n'
import type { ClusterSizing } from '@/types/model'
import { clusterTotals } from '@/utils/sizing'

interface NumberFieldProps {
  label: string
  value: number
  min: number
  max: number
  /** Only whole numbers are accepted, as for a count of workers. */
  integer?: boolean
  onChange: (value: number) => void
}

/**
 * Reads a plain decimal number: digits, with an optional fraction after a
 * point unless a whole number is required. Exponents, hexadecimal, signs and
 * spaces inside the number are refused, so a typo never becomes a cluster size.
 */
function parseStrictNumber(text: string, integer: boolean, min: number, max: number): number | null {
  const trimmed = text.trim()
  if (!(integer ? /^\d{1,9}$/ : /^\d{1,9}(\.\d{1,6})?$/).test(trimmed)) return null
  const value = Number(trimmed)
  return value >= min && value <= max ? value : null
}

/** Number input that keeps what is typed and only reports valid values. */
function NumberField({ label, value, min, max, integer = false, onChange }: NumberFieldProps) {
  const { t, fill } = useI18n()
  const id = useId()
  const [text, setText] = useState(String(value))
  const valid = parseStrictNumber(text, integer, min, max) !== null
  return (
    <div className="min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode={integer ? 'numeric' : 'decimal'}
        value={text}
        aria-invalid={!valid}
        aria-describedby={valid ? undefined : `${id}-error`}
        onChange={(event) => {
          setText(event.target.value)
          const next = parseStrictNumber(event.target.value, integer, min, max)
          if (next !== null) onChange(next)
        }}
      />
      {!valid && <p id={`${id}-error`} className="mt-1 text-xs text-destructive">{fill(integer ? t.sizing.invalidInteger : t.sizing.invalid, { min, max })}</p>}
    </div>
  )
}

interface SizingInputsProps {
  sizing: ClusterSizing
  onChange: (sizing: ClusterSizing) => void
}

/** Cluster size inputs of the sidebar, with the derived totals under them. */
export function SizingInputs({ sizing, onChange }: SizingInputsProps) {
  const { t, num, gb } = useI18n()
  const totals = clusterTotals(sizing)
  const set = (patch: Partial<ClusterSizing>): void => onChange({ ...sizing, ...patch })
  return (
    <div className="flex flex-col gap-2.5">
      <NumberField label={t.sizing.workers} value={sizing.workers} min={1} max={10000} integer onChange={(workers) => set({ workers })} />
      <NumberField label={t.sizing.vcpuPerWorker} value={sizing.vcpuPerWorker} min={1} max={4096} onChange={(vcpuPerWorker) => set({ vcpuPerWorker })} />
      <NumberField label={t.sizing.ramPerWorker} value={sizing.ramPerWorkerGb} min={1} max={100000} onChange={(ramPerWorkerGb) => set({ ramPerWorkerGb })} />
      <details>
        <summary className="cursor-pointer text-[13px] font-medium text-muted-foreground">{t.shell.advanced}</summary>
        <div className="mt-2 flex flex-col gap-2.5">
          <NumberField label={t.sizing.heapPercent} value={sizing.heapPercent} min={1} max={100} onChange={(heapPercent) => set({ heapPercent })} />
          <NumberField label={t.sizing.headroomPercent} value={sizing.headroomPercent} min={0} max={99} onChange={(headroomPercent) => set({ headroomPercent })} />
        </div>
      </details>
      <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 rounded-md border bg-background px-2.5 py-2 text-[13px]">
        <dt className="flex items-center gap-1.5 text-muted-foreground"><MemoryStick className="size-3.5 shrink-0" aria-hidden="true" />{t.sizing.queryMemory}</dt>
        <dd className="m-0 font-semibold tabular-nums">{gb(totals.queryMemoryGb)}</dd>
        <dt className="flex items-center gap-1.5 text-muted-foreground"><Cpu className="size-3.5 shrink-0" aria-hidden="true" />{t.sizing.totalVcpus}</dt>
        <dd className="m-0 font-semibold tabular-nums">{num(totals.vcpus)}</dd>
      </dl>
    </div>
  )
}

/**
 * Thin bar of the memory chain of the cluster: the RAM split into what
 * queries can use, the heap headroom and what is outside the JVM heap.
 */
export function MemoryChainBar({ sizing }: { sizing: ClusterSizing }) {
  const { t, fill, num } = useI18n()
  const totals = clusterTotals(sizing)
  const headroomGb = totals.headroomGbPerWorker * sizing.workers
  const restGb = Math.max(0, totals.ramGb - totals.queryMemoryGb - headroomGb)
  const segments = [
    { key: 'query', gb: totals.queryMemoryGb, label: fill(t.sizing.segQuery, { gb: num(totals.queryMemoryGb, 1) }), className: 'bg-brand' },
    { key: 'headroom', gb: headroomGb, label: fill(t.sizing.segHeadroom, { gb: num(headroomGb, 1) }), className: 'bg-chart-neutral' },
    { key: 'rest', gb: restGb, label: fill(t.sizing.segRest, { gb: num(restGb, 1) }), className: 'bg-chart-track' },
  ].filter((segment) => segment.gb > 0)
  return (
    <span
      role="img"
      aria-label={fill(t.sizing.barLabel, { query: num(totals.queryMemoryGb, 1), headroom: num(headroomGb, 1), rest: num(restGb, 1), ram: num(totals.ramGb) })}
      className="flex h-1.5 w-full gap-0.5"
    >
      {segments.map((segment) => (
        <Tooltip key={segment.key}>
          <TooltipTrigger asChild>
            <span tabIndex={0} className={`h-full rounded-full ${segment.className}`} style={{ flexGrow: segment.gb, flexBasis: 0 }} />
          </TooltipTrigger>
          <TooltipContent>{segment.label}</TooltipContent>
        </Tooltip>
      ))}
    </span>
  )
}
