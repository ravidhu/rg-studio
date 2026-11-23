import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type Dispatch } from 'react'
import { ExplainButton, ExplainRow } from '@/components/ExplainButton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription } from '@/components/ui/card'
import { Input, Label, NativeSelect } from '@/components/ui/input'
import { useI18n } from '@/hooks/useI18n'
import type { TopicKey } from '@/i18n/en'
import type { RgConfig, Selector, SelectorRegexField } from '@/types/model'
import { QUERY_TYPES, SELECTOR_REGEX_FIELDS } from '@/types/model'
import { emptySelector, type ConfigAction } from '@/utils/configReducer'
import { compileJavaRegex, isCatchAll, orderedSelectors } from '@/utils/selectors'
import { flattenTree, type GroupTree } from '@/utils/tree'

const FIELD_TOPICS: Record<SelectorRegexField, TopicKey> = {
  user: 'selUser',
  originalUser: 'selOriginalUser',
  authenticatedUser: 'selAuthenticatedUser',
  userGroup: 'selUserGroup',
  source: 'selSource',
  queryText: 'selQueryText',
}

interface SelectorCardProps {
  selector: Selector
  position: number
  config: RgConfig
  tree: GroupTree
  dispatch: Dispatch<ConfigAction>
  /** Selector to bring into view and outline, when a check pointed at it. */
  highlighted: boolean
}

function SelectorCard({ selector, position, config, tree, dispatch, highlighted }: SelectorCardProps) {
  const { t, fill } = useI18n()
  // Kept as typed text so that a trailing comma is not lost while typing.
  const [tagsText, setTagsText] = useState(selector.clientTags.join(', '))
  const cardRef = useRef<HTMLLIElement | null>(null)
  useEffect(() => {
    if (highlighted) cardRef.current?.scrollIntoView({ block: 'center' })
  }, [highlighted])
  const update = (patch: Partial<Selector>): void => dispatch({ type: 'updateSelector', id: selector.id, patch })
  const nodes = flattenTree(tree.roots)
  const id = `selector-${selector.id}`
  const targetKnown = selector.groupId !== null && tree.byId.has(selector.groupId)
  return (
    <li ref={cardRef} className={`rounded-md border bg-background p-3 ${highlighted ? 'outline-2 outline-brand' : ''}`} aria-current={highlighted ? 'true' : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{fill(t.selectorsEditor.position, { position })}</h3>
        {isCatchAll(selector) && <Badge>{t.selectorsEditor.catchAll}</Badge>}
        <span className="flex-1" />
        {config.mode === 'file' && (
          <>
            <Button size="icon" aria-label={t.editor.moveUp} title={t.editor.moveUp} onClick={() => dispatch({ type: 'moveSelector', id: selector.id, direction: -1 })}><ArrowUp aria-hidden="true" /></Button>
            <Button size="icon" aria-label={t.editor.moveDown} title={t.editor.moveDown} onClick={() => dispatch({ type: 'moveSelector', id: selector.id, direction: 1 })}><ArrowDown aria-hidden="true" /></Button>
          </>
        )}
        <Button size="icon" variant="destructive" aria-label={t.common.remove} title={t.common.remove} onClick={() => dispatch({ type: 'removeSelector', id: selector.id })}><Trash2 aria-hidden="true" /></Button>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="min-w-0">
          <Label htmlFor={`${id}-group`}>{t.selectorsEditor.target} <code className="font-normal">group</code></Label> <ExplainButton topic={'selGroup'} compact />
          <NativeSelect
            id={`${id}-group`}
            value={targetKnown ? selector.groupId ?? '' : ''}
            aria-invalid={!targetKnown}
            onChange={(event) => update({ groupId: event.target.value === '' ? null : event.target.value, unresolvedTarget: '' })}
          >
            <option value="">{fill(t.selectorsEditor.targetMissing, { target: selector.unresolvedTarget || '?' })}</option>
            {nodes.map((node) => (
              <option key={node.group.id} value={node.group.id}>
                {node.path}{node.children.length > 0 ? ` (${t.selectorsEditor.notLeaf})` : ''}
              </option>
            ))}
          </NativeSelect>
        </div>
        {config.mode === 'db' && (
          <div className="min-w-0">
            <Label htmlFor={`${id}-priority`}>{t.selectorsEditor.priority} <code className="font-normal">priority</code></Label> <ExplainButton topic={'selPriority'} compact />
            <Input id={`${id}-priority`} inputMode="numeric" value={selector.priority} onChange={(event) => update({ priority: event.target.value })} />
          </div>
        )}
        {SELECTOR_REGEX_FIELDS.map((field) => {
          const compiled = selector[field] === '' ? null : compileJavaRegex(selector[field])
          const invalid = compiled !== null && !compiled.ok
          return (
            <div key={field} className="min-w-0">
              <Label htmlFor={`${id}-${field}`}><code className="font-normal">{t.selectorsEditor.labels[field]}</code></Label> <ExplainButton topic={FIELD_TOPICS[field]} compact />
              <Input
                id={`${id}-${field}`}
                className="font-mono text-[13px]"
                value={selector[field]}
                aria-invalid={invalid}
                onChange={(event) => update({ [field]: event.target.value })}
              />
              {invalid && (
                <p className="mt-1 text-xs text-destructive">
                  {t.tester.outcome.unsupported}{compiled.message ? `: ${compiled.message}` : ''}
                </p>
              )}
            </div>
          )
        })}
        <div className="min-w-0">
          <Label htmlFor={`${id}-type`}><code className="font-normal">{t.selectorsEditor.labels.queryType}</code></Label> <ExplainButton topic={'selQueryType'} compact />
          <NativeSelect id={`${id}-type`} value={selector.queryType} onChange={(event) => update({ queryType: event.target.value })}>
            <option value="">{t.selectorsEditor.anyType}</option>
            {QUERY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            {selector.queryType !== '' && !(QUERY_TYPES as readonly string[]).includes(selector.queryType) && (
              <option value={selector.queryType}>{selector.queryType}</option>
            )}
          </NativeSelect>
        </div>
        <div className="min-w-0">
          <Label htmlFor={`${id}-tags`}><code className="font-normal">{t.selectorsEditor.labels.clientTags}</code></Label> <ExplainButton topic={'selClientTags'} compact />
          <Input
            id={`${id}-tags`}
            value={tagsText}
            placeholder={t.selectorsEditor.tagsPlaceholder}
            onChange={(event) => {
              setTagsText(event.target.value)
              update({ clientTags: event.target.value.split(',').map((tag) => tag.trim()).filter((tag) => tag !== '') })
            }}
          />
        </div>
      </div>
    </li>
  )
}

interface SelectorEditorProps {
  config: RgConfig
  tree: GroupTree
  dispatch: Dispatch<ConfigAction>
  highlightedId: string | null
}

export function SelectorEditor({ config, tree, dispatch, highlightedId }: SelectorEditorProps) {
  const { t } = useI18n()
  const ordered = orderedSelectors(config)
  return (
    <Card>
      {/* No title: the selected tab above already names the card. */}
      <CardDescription className="mt-0">{config.mode === 'file' ? t.selectorsEditor.leadFile : t.selectorsEditor.leadDb}</CardDescription>
      {ordered.length === 0 && <p className="mt-3 text-sm text-muted-foreground">{t.selectorsEditor.empty}</p>}
      <ol className="m-0 mt-3 list-none space-y-3 p-0">
        {ordered.map((selector, index) => (
          <SelectorCard key={selector.id} selector={selector} position={index + 1} config={config} tree={tree} dispatch={dispatch} highlighted={selector.id === highlightedId} />
        ))}
      </ol>
      <Button className="mt-3" onClick={() => dispatch({ type: 'addSelector', selector: emptySelector() })}>
        <Plus aria-hidden="true" />{t.selectorsEditor.add}
      </Button>
      <ExplainRow topics={['conceptSelectorOrder', 'conceptRegex', 'conceptTemplates', 'conceptLeaf']} />
    </Card>
  )
}
