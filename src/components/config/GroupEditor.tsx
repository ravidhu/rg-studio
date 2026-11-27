import { CheckMessage } from '@/components/CheckMessage'
import { Activity, ArrowDown, ArrowUp, CircleX, Cpu, HardDrive, Info, Layers, MemoryStick, Plus, Scale, Tag, Trash2, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, type Dispatch, type ReactNode } from 'react'
import { ExplainButton, ExplainRow } from '@/components/ExplainButton'
import { Button } from '@/components/ui/button'
import { Card, CardDescription } from '@/components/ui/card'
import { Input, Label, NativeSelect } from '@/components/ui/input'
import { useI18n } from '@/hooks/useI18n'
import type { Dictionary, TopicKey } from '@/i18n/en'
import type { GroupField, ResourceGroup, RgConfig, Severity } from '@/types/model'
import { SCHEDULING_POLICIES } from '@/types/model'
import type { PeriodField } from '@/components/ChecksView'
import type { Finding } from '@/utils/checks'
import { cn } from '@/utils/cn'
import { makeGroup, type ConfigAction } from '@/utils/configReducer'
import { descendantIds, flattenTree, type GroupTree } from '@/utils/tree'
import { parseDuration } from '@/utils/units'
import { validateGroupField } from '@/utils/validate'

export function SeverityIcon({ severity, className }: { severity: Severity; className?: string }) {
  if (severity === 'error') return <CircleX className={cn('size-4 shrink-0 text-status-error', className)} aria-hidden="true" />
  if (severity === 'warning') return <TriangleAlert className={cn('size-4 shrink-0 text-status-warning', className)} aria-hidden="true" />
  return <Info className={cn('size-4 shrink-0 text-status-info', className)} aria-hidden="true" />
}

interface GroupEditorProps {
  config: RgConfig
  tree: GroupTree
  findings: Finding[]
  selectedId: string | null
  /** Period field to focus, with a counter so the same request can repeat. */
  focusPeriod: { field: PeriodField; request: number } | null
  onSelect: (id: string | null) => void
  dispatch: Dispatch<ConfigAction>
}

/**
 * Icon in front of the legend of each set of the group form. CPU and memory
 * use the icons of the cluster size block of the side menu, and scheduling
 * the one of the sharing category of the glossary.
 */
const SECTION_ICONS: Record<keyof Dictionary['editor']['sections'], LucideIcon> = {
  identity: Tag,
  concurrency: Layers,
  scheduling: Scale,
  cpu: Cpu,
  memory: MemoryStick,
  scan: HardDrive,
  monitoring: Activity,
}

export function GroupEditor({ config, tree, findings, selectedId, focusPeriod, onSelect, dispatch }: GroupEditorProps) {
  const { t, fill } = useI18n()
  const formId = useId()
  const cardRef = useRef<HTMLElement | null>(null)
  // A finding about a period opens the editor with that field focused. The request is
  // served once: selecting another group afterwards must not move the focus again.
  useEffect(() => {
    if (focusPeriod === null) return
    const input = cardRef.current?.querySelector<HTMLInputElement>(`[data-period-field="${focusPeriod.field}"]`)
    input?.focus()
    input?.scrollIntoView({ block: 'center' })
  }, [focusPeriod])
  const nodes = flattenTree(tree.roots)
  const selected = config.groups.find((group) => group.id === selectedId) ?? null
  const worstOf = (groupId: string): Severity | null => {
    const own = findings.filter((finding) => finding.groupId === groupId)
    if (own.some((finding) => finding.severity === 'error')) return 'error'
    if (own.some((finding) => finding.severity === 'warning')) return 'warning'
    return null
  }
  const add = (parentId: string | null): void => {
    const group = makeGroup(config, parentId, t.editor.newGroupName)
    dispatch({ type: 'addGroup', group })
    onSelect(group.id)
  }
  const update = (patch: Partial<ResourceGroup>): void => {
    if (selected) dispatch({ type: 'updateGroup', id: selected.id, patch })
  }

  const treeEntries: { group: ResourceGroup; depth: number }[] = [
    ...nodes.map((node) => ({ group: node.group, depth: node.depth })),
    ...tree.cyclic.map((group) => ({ group, depth: 0 })),
  ]
  const blocked = selected ? descendantIds(config.groups, selected.id) : new Set<string>()
  const siblings = selected ? config.groups.filter((group) => group.parentId === selected.parentId) : []
  const ownFindings = selected ? findings.filter((finding) => finding.groupId === selected.id) : []

  // The quota periods apply to every group, so they sit in their own block above the tree,
  // never inside the form of one group. Each is shown while a group uses it or while it has a value.
  const anyCpuLimit = config.groups.some((group) => group.softCpuLimit.trim() !== '' || group.hardCpuLimit.trim() !== '')
  const anyScanLimit = config.groups.some((group) => group.hardPhysicalDataScanLimit.trim() !== '')
  const cpuPeriod = config.global.cpuQuotaPeriod.trim()
  const scanPeriod = config.global.physicalDataScanQuotaPeriod.trim()
  const shownPeriods: PeriodField[] = [
    ...(anyCpuLimit || cpuPeriod !== '' ? ['cpuQuotaPeriod' as const] : []),
    ...(anyScanLimit || scanPeriod !== '' ? ['physicalDataScanQuotaPeriod' as const] : []),
  ]
  const focusGlobal = (name: PeriodField): void => {
    const input = cardRef.current?.querySelector<HTMLInputElement>(`[data-period-field="${name}"]`)
    input?.focus()
    input?.scrollIntoView({ block: 'center' })
  }
  // Read-only line at the foot of a set of limits in the group form: the period they are measured over, set once for all groups.
  const periodReminder = (name: PeriodField) => {
    if (!shownPeriods.includes(name)) return null
    const value = config.global[name].trim()
    return value !== '' ? (
      <p className="mt-2 text-xs text-muted-foreground" data-period-reminder={name}>{fill(t.editor.measuredOver[name], { period: value })}</p>
    ) : (
      <p className="mt-2 text-xs" data-period-reminder={name}>
        <button type="button" className="inline-flex cursor-pointer items-center gap-1 rounded text-primary underline" onClick={() => focusGlobal(name)}>
          <SeverityIcon severity="warning" className="size-3.5" />
          {t.editor.periodMissingLink}
        </button>
      </p>
    )
  }
  const cpuPeriodError = !anyCpuLimit ? null : cpuPeriod === '' ? t.editor.errors.periodMissing : (parseDuration(cpuPeriod) ?? 0) > 0 ? null : t.editor.errors.duration
  const periodField = (name: PeriodField, error: string | null) => {
    const inputId = `${formId}-${name}`
    return (
      <div key={name} className="min-w-0">
        <Label htmlFor={inputId}>{t.editor.labels[name]} <code className="font-normal">{name}</code></Label> <ExplainButton topic={name} compact />
        <Input
          id={inputId}
          data-period-field={name}
          value={config.global[name]}
          placeholder={t.editor.placeholders.period}
          aria-invalid={error !== null}
          aria-describedby={error ? `${inputId}-error` : undefined}
          onChange={(event) => dispatch({ type: 'updateGlobal', patch: { [name]: event.target.value } })}
        />
        {error && (
          <p id={`${inputId}-error`} className="mt-1 flex items-start gap-1.5 text-xs">
            <SeverityIcon severity="warning" className="size-3.5" />
            {error}
          </p>
        )}
      </div>
    )
  }
  const placeholders: Partial<Record<GroupField, string>> = {
    softMemoryLimit: t.editor.placeholders.softMemoryLimit,
    softCpuLimit: t.editor.placeholders.softCpuLimit,
    hardCpuLimit: t.editor.placeholders.hardCpuLimit,
    hardPhysicalDataScanLimit: t.editor.placeholders.hardPhysicalDataScanLimit,
  }
  /** Text input of one property. `hint` is a line under it that says what the value relates to. */
  const field = (name: GroupField, hint?: string) => {
    if (!selected) return null
    const error = validateGroupField(name, selected, siblings)
    const inputId = `${formId}-${name}`
    const described = [error ? `${inputId}-error` : null, hint ? `${inputId}-hint` : null].filter((id) => id !== null).join(' ')
    return (
      <div key={name} className="min-w-0">
        <Label htmlFor={inputId}>{t.editor.labels[name]} <code className="font-normal">{name}</code></Label> <ExplainButton topic={name as TopicKey} compact />
        <Input
          id={inputId}
          value={selected[name]}
          placeholder={placeholders[name]}
          aria-invalid={error !== null}
          aria-describedby={described === '' ? undefined : described}
          onChange={(event) => update({ [name]: event.target.value })}
        />
        {error && <p id={`${inputId}-error`} className="mt-1 text-xs text-destructive">{t.editor.errors[error]}</p>}
        {hint && <p id={`${inputId}-hint`} className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    )
  }
  /**
   * One set of related properties: a fieldset named by its legend; `note` is a
   * line for the whole set. The sets are laid out from the width of the form
   * itself, not of the window, since the tree beside it takes a fixed share.
   * - Narrow form: one set per row, its fields in two columns from 24rem.
   * - From 42rem: three sets per row, their fields stacked in one column. The
   *   last set, alone on its row, keeps the width of one third.
   * Sets of one row have the same height.
   */
  const section = (name: keyof typeof t.editor.sections, fields: ReactNode, note?: ReactNode) => {
    const Icon = SECTION_ICONS[name]
    return (
    <fieldset data-form-section={name} className="m-0 min-w-0 rounded-lg border bg-background px-3 pb-3 pt-1.5">
      {/* The icon is decoration: the text of the legend stays the name of the set. It sits inline, so a long legend wraps as before. */}
      <legend className="px-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="mr-1.5 inline size-3.5 align-[-0.15em]" aria-hidden="true" />{t.editor.sections[name]}
      </legend>
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @2xl:grid-cols-1">{fields}</div>
      {note}
    </fieldset>
    )
  }
  const nameError = selected ? validateGroupField('name', selected, siblings) : null

  return (
    <Card ref={cardRef}>
      {/* No title: the selected tab above already names the card. */}
      <CardDescription className="mt-0">{t.editor.lead}</CardDescription>
      {shownPeriods.length > 0 && (
        <section className="mt-3 rounded-lg border bg-background px-3 py-2.5" aria-labelledby={`${formId}-global`} data-testid="global-settings">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 id={`${formId}-global`} className="text-[15px] font-semibold">{t.editor.globalTitle}</h3>
            <p className="text-[13px] text-muted-foreground">{t.editor.globalLead}</p>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {shownPeriods.map((name) => periodField(name, name === 'cpuQuotaPeriod' ? cpuPeriodError : null))}
          </div>
        </section>
      )}
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        <div className="min-w-0">
          <ul className="m-0 max-h-[28rem] list-none overflow-y-auto rounded-md border bg-background p-1" aria-label={t.editor.title}>
            {treeEntries.map(({ group, depth }) => {
              const worst = worstOf(group.id)
              return (
                <li key={group.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(group.id)}
                    aria-current={group.id === selectedId}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
                      group.id === selectedId && 'bg-accent font-medium',
                    )}
                    style={{ paddingLeft: `${8 + depth * 14}px` }}
                  >
                    <span className="min-w-0 flex-1 truncate">{group.name || '?'}</span>
                    {worst && <SeverityIcon severity={worst} />}
                  </button>
                </li>
              )
            })}
          </ul>
          <Button className="mt-2 w-full" onClick={() => add(null)}><Plus aria-hidden="true" />{t.editor.addRoot}</Button>
        </div>

        {selected ? (
          <div className="@container min-w-0">
            <h3 className="text-[15px] font-semibold">{fill(t.editor.properties, { group: selected.name || '?' })}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => add(selected.id)}><Plus aria-hidden="true" />{t.editor.addChild}</Button>
              <Button size="icon" aria-label={t.editor.moveUp} title={t.editor.moveUp} onClick={() => dispatch({ type: 'moveGroup', id: selected.id, direction: -1 })}><ArrowUp aria-hidden="true" /></Button>
              <Button size="icon" aria-label={t.editor.moveDown} title={t.editor.moveDown} onClick={() => dispatch({ type: 'moveGroup', id: selected.id, direction: 1 })}><ArrowDown aria-hidden="true" /></Button>
              {/* Kept apart from the other actions, at the right edge: on a narrow screen it wraps to its own line, still on the right. */}
              <Button size="sm" variant="destructive" className="ml-auto" data-remove-group="" onClick={() => { dispatch({ type: 'removeGroup', id: selected.id }); onSelect(null) }}>
                <Trash2 aria-hidden="true" />{t.editor.remove}
              </Button>
            </div>
            {/* Related properties sit together, each set in a labelled fieldset. Within a set a soft limit comes before its hard limit.
                On a wide form they read three per row: who the group is and how it runs and takes turns, then its three resource limits, then monitoring. */}
            <div className="mt-3 grid grid-cols-1 gap-3 @2xl:grid-cols-3" data-group-form="">
              {section('identity', (
                <>
                  <div className="min-w-0">
                    <Label htmlFor={`${formId}-name`}>{t.editor.labels.name} <code className="font-normal">name</code></Label> <ExplainButton topic={'name'} compact />
                    <Input
                      id={`${formId}-name`}
                      value={selected.name}
                      aria-invalid={nameError !== null}
                      onChange={(event) => update({ name: event.target.value })}
                    />
                    {nameError && <p className="mt-1 text-xs text-destructive">{t.editor.errors[nameError]}</p>}
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor={`${formId}-parent`}>{t.editor.parent}</Label> <ExplainButton topic={'subGroups'} compact />
                    <NativeSelect
                      id={`${formId}-parent`}
                      value={selected.parentId !== null && tree.byId.has(selected.parentId) ? selected.parentId : ''}
                      onChange={(event) => dispatch({ type: 'reparentGroup', id: selected.id, parentId: event.target.value === '' ? null : event.target.value })}
                    >
                      <option value="">{t.editor.noParent}</option>
                      {nodes.filter((node) => !blocked.has(node.group.id)).map((node) => (
                        <option key={node.group.id} value={node.group.id}>{node.path}</option>
                      ))}
                    </NativeSelect>
                  </div>
                  {config.mode === 'db' && (
                    <div className="min-w-0">
                      <Label htmlFor={`${formId}-env`}><code className="font-normal">{t.editor.environment}</code></Label> <ExplainButton topic={'environment'} compact />
                      <Input id={`${formId}-env`} value={selected.environment} onChange={(event) => update({ environment: event.target.value })} />
                    </div>
                  )}
                </>
              ))}
              {section('concurrency', (
                <>
                  {field('softConcurrencyLimit')}
                  {field('hardConcurrencyLimit')}
                  {field('maxQueued')}
                </>
              ))}
              {section('scheduling', (
                <>
                  {field('schedulingWeight', t.editor.hints.schedulingWeight)}
                  <div className="min-w-0">
                    <Label htmlFor={`${formId}-policy`}>{t.editor.labels.schedulingPolicy} <code className="font-normal">schedulingPolicy</code></Label> <ExplainButton topic={'schedulingPolicy'} compact />
                    <NativeSelect
                      id={`${formId}-policy`}
                      value={selected.schedulingPolicy}
                      aria-describedby={`${formId}-policy-hint`}
                      onChange={(event) => update({ schedulingPolicy: event.target.value })}
                    >
                      <option value="">{t.editor.policyDefault}</option>
                      {SCHEDULING_POLICIES.map((policy) => <option key={policy} value={policy}>{policy}</option>)}
                      {selected.schedulingPolicy !== '' && !(SCHEDULING_POLICIES as readonly string[]).includes(selected.schedulingPolicy) && (
                        <option value={selected.schedulingPolicy}>{selected.schedulingPolicy}</option>
                      )}
                    </NativeSelect>
                    <p id={`${formId}-policy-hint`} className="mt-1 text-xs text-muted-foreground">{t.editor.hints.schedulingPolicy}</p>
                  </div>
                </>
              ))}
              {/* The period is a global setting shared by both limits: it is said once for the set. */}
              {section('cpu', (
                <>
                  {field('softCpuLimit')}
                  {field('hardCpuLimit')}
                </>
              ), periodReminder('cpuQuotaPeriod'))}
              {section('memory', field('softMemoryLimit'))}
              {section('scan', field('hardPhysicalDataScanLimit'), periodReminder('physicalDataScanQuotaPeriod'))}
              {section('monitoring', (
                <div className="min-w-0">
                  <Label htmlFor={`${formId}-jmx`}>{t.editor.labels.jmxExport} <code className="font-normal">jmxExport</code></Label> <ExplainButton topic={'jmxExport'} compact />
                  <NativeSelect
                    id={`${formId}-jmx`}
                    value={selected.jmxExport}
                    onChange={(event) => update({ jmxExport: event.target.value })}
                  >
                    <option value="">{t.editor.jmxDefault}</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </NativeSelect>
                </div>
              ))}
            </div>
            {ownFindings.length > 0 && (
              <div className="mt-4">
                <h4 className="text-[13px] font-semibold text-muted-foreground">{t.editor.findings}</h4>
                <ul className="m-0 mt-1 list-none space-y-1 p-0 text-sm">
                  {ownFindings.map((finding, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <SeverityIcon severity={finding.severity} className="mt-0.5" />
                      <span>
                        <span className="sr-only">{t.checks.severity[finding.severity]}: </span>
                        <CheckMessage finding={finding} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t.editor.noSelection}</p>
        )}
      </div>

      <ExplainRow topics={['conceptLeaf', 'conceptSoftHard', 'conceptPolicies', 'conceptTemplates']} />
    </Card>
  )
}
