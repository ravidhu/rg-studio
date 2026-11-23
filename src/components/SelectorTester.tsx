import { CircleCheck, CircleMinus, CircleX, TriangleAlert } from 'lucide-react'
import { useId, useMemo } from 'react'
import { ExplainRow } from '@/components/ExplainButton'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription } from '@/components/ui/card'
import { Input, Label, NativeSelect } from '@/components/ui/input'
import { useI18n } from '@/hooks/useI18n'
import type { RgConfig } from '@/types/model'
import { QUERY_TYPES } from '@/types/model'
import { routeQuery, tiedMatches, type Outcome, type QueryContext } from '@/utils/selectors'
import type { ReadAs } from '@/utils/importFiles'
import type { GroupTree } from '@/utils/tree'

function splitList(text: string): string[] {
  return text.split(',').map((item) => item.trim()).filter((item) => item !== '')
}

function OutcomeIcon({ outcome }: { outcome: Outcome | 'skipped' }) {
  if (outcome === 'match') return <CircleCheck className="size-4 shrink-0 text-status-good" aria-hidden="true" />
  if (outcome === 'noMatch') return <CircleX className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
  if (outcome === 'unsupported') return <TriangleAlert className="size-4 shrink-0 text-status-warning" aria-hidden="true" />
  return <CircleMinus className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
}

/** Where the configuration comes from, as said next to the evaluation order. */
export type SourceOrigin = ReadAs | 'imported' | 'demo' | 'created'

/** What is typed in the tester. Lists are kept as typed, separated by commas. */
export interface TesterInputs {
  user: string
  groups: string
  source: string
  tags: string
  queryType: string
  originalUser: string
  authenticatedUser: string
  queryText: string
}

interface SelectorTesterProps {
  config: RgConfig
  tree: GroupTree
  /** Kept by the application, so the query survives a visit to another page. */
  inputs: TesterInputs
  onInputsChange: (inputs: TesterInputs) => void
  /** Where the manager of the configuration comes from: it sets the evaluation order shown. */
  origin: SourceOrigin
  /** A configuration started from scratch has no manager yet. */
  needsManager: boolean
  onChooseManager: () => void
}

export function SelectorTester({ config, tree, inputs, onInputsChange, origin, needsManager, onChooseManager }: SelectorTesterProps) {
  const { t, fill, plural } = useI18n()
  const id = useId()
  const { user, groups, source, tags, queryType, originalUser, authenticatedUser, queryText } = inputs
  const setter = (name: keyof TesterInputs) => (value: string): void => onInputsChange({ ...inputs, [name]: value })
  const setUser = setter('user')
  const setGroups = setter('groups')
  const setSource = setter('source')
  const setTags = setter('tags')
  const setQueryType = setter('queryType')
  const setOriginalUser = setter('originalUser')
  const setAuthenticatedUser = setter('authenticatedUser')
  const setQueryText = setter('queryText')

  const result = useMemo(() => {
    const query: QueryContext = {
      user,
      originalUser: originalUser === '' ? user : originalUser,
      authenticatedUser: authenticatedUser === '' ? user : authenticatedUser,
      userGroups: splitList(groups),
      source,
      clientTags: splitList(tags),
      queryType,
      queryText,
    }
    return routeQuery(config, tree, query)
  }, [config, tree, user, originalUser, authenticatedUser, groups, source, tags, queryType, queryText])

  const ties = tiedMatches(config, result)
  const matchedIndex = result.matched ? result.traces.findIndex((trace) => trace.selector === result.matched) : -1
  const targetNode = result.matched?.groupId ? tree.byId.get(result.matched.groupId) : undefined
  // Same reading as the checks: a declared external group exists, only its definition is elsewhere.
  const targetExternal = !targetNode && result.matched !== null && config.externalGroups.includes(result.matched.unresolvedTarget)
  const text = (label: string, value: string, onChange: (value: string) => void, placeholder?: string) => {
    const inputId = `${id}-${label}`
    return (
      <div className="min-w-0">
        <Label htmlFor={inputId}>{label}</Label>
        <Input id={inputId} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      </div>
    )
  }

  return (
    <Card>
      {/* No title: the page title above already names the card. */}
      <CardDescription className="mt-0">{t.tester.lead}</CardDescription>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {text(t.tester.user, user, setUser)}
        {text(t.tester.userGroups, groups, setGroups, t.tester.listPlaceholder)}
        {text(t.tester.source, source, setSource)}
        {text(t.tester.clientTags, tags, setTags, t.tester.listPlaceholder)}
        <div className="min-w-0">
          <Label htmlFor={`${id}-type`}>{t.tester.queryType}</Label>
          <NativeSelect id={`${id}-type`} value={queryType} onChange={(event) => setQueryType(event.target.value)}>
            {QUERY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </NativeSelect>
        </div>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-muted-foreground">{t.tester.advanced}</summary>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {text(t.tester.originalUser, originalUser, setOriginalUser, t.tester.sameAsUser)}
          {text(t.tester.authenticatedUser, authenticatedUser, setAuthenticatedUser, t.tester.sameAsUser)}
          {text(t.tester.queryText, queryText, setQueryText)}
        </div>
      </details>

      {needsManager ? (
        <p className="mt-4 rounded-md border border-status-warning bg-background px-3 py-2 text-sm" data-testid="manager-prompt">
          {t.source.prompt}{' '}
          <button type="button" className="cursor-pointer rounded text-primary underline" onClick={onChooseManager}>{t.source.promptLink}</button>
        </p>
      ) : (
        <p className="mt-4 text-[13px] text-muted-foreground" data-testid="evaluation-order">
          {fill(t.source.order, {
            order: config.mode === 'db' ? t.source.orderPriority : t.source.orderList,
            manager: config.mode === 'db' ? t.source.managerDb : t.source.managerFile,
            origin: t.source.origin[origin],
          })}
        </p>
      )}
      <div className="mt-1.5 rounded-md border bg-background p-3" aria-live="polite">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.tester.result}</h3>
        {config.selectors.length === 0 ? (
          <p className="mt-1 text-sm">{t.tester.noSelectors}</p>
        ) : result.matched ? (
          <>
            <p className="mt-1 text-sm">
              {t.tester.lands} <code className="text-base font-semibold">{result.groupPath}</code>{' '}
              <span className="text-muted-foreground">{fill(t.tester.viaSelector, { position: matchedIndex + 1 })}</span>
            </p>
            {targetExternal && <p className="mt-1 text-sm text-muted-foreground">{t.tester.targetExternal}</p>}
            {!targetNode && !targetExternal && <p className="mt-1 text-sm text-destructive">{t.tester.targetMissing}</p>}
            {ties.length > 0 && (
              <p className="mt-1.5 flex items-start gap-1.5 text-sm" data-testid="priority-tie">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
                <span>
                  {fill(plural(ties.length, t.tester.tie), { list: ties.map((tie) => tie.position).join(', ') })}
                  {ties.every((tie) => tie.sameTarget) ? ` ${t.tester.tieHarmless}` : ''}
                </span>
              </p>
            )}
            {result.uncertain && <p className="mt-1 text-sm text-muted-foreground">{t.tester.uncertain}</p>}
          </>
        ) : (
          <>
            <p className="mt-1 text-sm">{t.tester.noMatch}</p>
            {result.uncertain && <p className="mt-1 text-sm text-muted-foreground">{t.tester.uncertain}</p>}
          </>
        )}
      </div>

      <h3 className="mt-4 text-[15px] font-semibold">{t.tester.trace}</h3>
      <ol className="m-0 mt-2 list-none space-y-1.5 p-0">
        {result.traces.map((trace, index) => {
          const skipped = matchedIndex >= 0 && index > matchedIndex
          const node = trace.selector.groupId ? tree.byId.get(trace.selector.groupId) : undefined
          return (
            <li key={trace.selector.id} className={`rounded-md border px-3 py-2 text-sm ${index === matchedIndex ? 'border-status-good bg-background' : ''} ${skipped ? 'opacity-55' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <OutcomeIcon outcome={skipped ? 'skipped' : trace.outcome} />
                <span className="font-medium">{fill(t.selectorsEditor.position, { position: index + 1 })}</span>
                <code className="min-w-0 text-muted-foreground">{node ? node.path : trace.selector.unresolvedTarget || '?'}</code>
                <Badge>{skipped ? t.tester.skipped : t.tester.outcome[trace.outcome]}</Badge>
                {config.mode === 'db' && trace.selector.priority !== '' && <Badge>{t.selectorsEditor.priority} {trace.selector.priority}</Badge>}
              </div>
              {trace.conditions.length === 0 ? (
                <p className="ml-6 mt-1 text-[13px] text-muted-foreground">{t.tester.noConditions}</p>
              ) : (
                <ul className="m-0 ml-6 mt-1 list-none space-y-0.5 p-0 text-[13px]">
                  {trace.conditions.map((condition) => (
                    <li key={condition.field} className="flex items-start gap-1.5">
                      <OutcomeIcon outcome={condition.outcome} />
                      <span className="min-w-0">
                        <code>{condition.field}</code> <code className="text-muted-foreground">{condition.expected}</code>{' '}
                        <span className="text-muted-foreground">{t.tester.outcome[condition.outcome]}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-[13px] text-muted-foreground">
        <Badge className="mr-1.5">{t.common.verified}</Badge>
        {t.tester.regexVerified}
      </p>
      {/* What this page does with the patterns, as opposed to the cluster. */}
      <p className="mt-1.5 text-[13px] text-muted-foreground">{t.tester.regexNote}</p>
      <ExplainRow topics={['conceptSelectorOrder', 'conceptRegex', 'conceptTemplates', 'selQueryType', 'selClientTags']} />
    </Card>
  )
}
