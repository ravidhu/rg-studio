import { ChartPie, Gauge, Network, Route, Scale, Search, Settings, X, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useRef } from 'react'
import { ConceptDiagram } from '@/components/diagrams/ConceptDiagram'
import { TopicBody } from '@/components/TopicBody'
import { Highlight } from '@/components/Highlight'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ExpandButton } from '@/components/ui/expand-button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EXPANDED_SURFACE, useExpand } from '@/hooks/useExpand'
import { useI18n } from '@/hooks/useI18n'
import type { ClusterSizing, RgConfig } from '@/types/model'
import { cn } from '@/utils/cn'
import {
  categoriesOfTab, categoryCounts, GLOSSARY_TABS, searchGlossary, sourceLabels, validCategory, visibleTopics, type GlossaryTab,
} from '@/utils/search'
import { SOURCE_URLS, type SourceKey, type TopicCategory } from '@/utils/topics'
import { DIAGRAM_TOPICS } from '@/utils/diagram'
import type { GroupTree } from '@/utils/tree'
import type { TopicKey } from '@/i18n/en'

const CATEGORY_ICONS: Record<TopicCategory, LucideIcon> = {
  structure: Network,
  limits: Gauge,
  sharing: Scale,
  routing: Route,
  configuration: Settings,
  charts: ChartPie,
  groups: Network,
  selectors: Route,
  global: Settings,
}

/** Tag naming the category of a card, with an icon, so a card found by search still says what it is about. */
function CategoryTag({ category }: { category: TopicCategory }) {
  const { t } = useI18n()
  const Icon = CATEGORY_ICONS[category]
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {t.glossary.categories[category]}
    </span>
  )
}

interface GlossaryViewProps {
  config: RgConfig
  tree: GroupTree
  sizing: ClusterSizing
  tab: GlossaryTab
  /** Category chip selected on the active tab, `null` for all. */
  category: TopicCategory | null
  /** Text of the search box. */
  typed: string
  /** Search applied to the cards: `typed` after a short pause. */
  query: string
  onType: (next: string) => void
  onSettle: (next: string) => void
  onTabChange: (tab: GlossaryTab) => void
  onCategoryChange: (category: TopicCategory | null) => void
}

interface TopicCardProps {
  topic: TopicKey
  category: TopicCategory
  terms: string[]
  /** What the diagram of the concept is drawn from, `null` for a card without a diagram. */
  diagram: { config: RgConfig; tree: GroupTree; sizing: ClusterSizing } | null
}

/** One glossary entry. A card with a diagram can fill the window, like the charts of the allocation page. */
function TopicCard({ topic, category, terms, diagram }: TopicCardProps) {
  const { t } = useI18n()
  const { expanded: enlarged, toggle: toggleEnlarged, surface, button: enlargeButton } = useExpand()
  const drawing = diagram && DIAGRAM_TOPICS.has(topic) ? <ConceptDiagram topic={topic} config={diagram.config} tree={diagram.tree} sizing={diagram.sizing} /> : null
  return (
    <article ref={surface} data-expanded={enlarged} className={cn('min-w-0 rounded-lg border bg-card p-3', enlarged && EXPANDED_SURFACE)}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <h4 className="min-w-0 flex-1 text-[15px] font-semibold"><Highlight text={t.topics[topic].title} terms={terms} /></h4>
        <CategoryTag category={category} />
        {drawing !== null && <ExpandButton expanded={enlarged} onToggle={toggleEnlarged} buttonRef={enlargeButton} title={t.topics[topic].title} />}
      </div>
      {/* Expanded, a drawing grows to the width of the window, as far as its proportions allow within its height. */}
      {drawing !== null && (
        <div data-chart-area="" className={cn(enlarged && 'mx-auto mb-3 w-full [&_svg]:mx-auto [&_svg]:max-h-[calc(100vh-9rem)] [&_svg]:w-full [&_svg]:max-w-none')}>{drawing}</div>
      )}
      <TopicBody topic={topic} terms={terms} />
    </article>
  )
}

/**
 * Glossary in three tabs (properties, how it works, sources). A full-text
 * search filters every tab, and category chips narrow the active tab. Cards
 * are grouped under a heading per category and carry a category tag.
 */
export function GlossaryView({ config, tree, sizing, tab, category, typed, query, onType, onSettle, onTabChange, onCategoryChange }: GlossaryViewProps) {
  const { t, fill } = useI18n()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const searchHintId = useId()

  // The filter follows the typing after a short pause, so the page does not flicker on every key.
  useEffect(() => {
    const timer = window.setTimeout(() => onSettle(typed), 150)
    return () => window.clearTimeout(timer)
  }, [typed, onSettle])

  // "/" focuses the search, except while typing in a field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target
      const typing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if (event.key !== '/' || typing || event.ctrlKey || event.metaKey || event.altKey) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const result = useMemo(() => searchGlossary(query, t), [query, t])
  const searching = result.terms.length > 0
  const labels = sourceLabels(t)
  const tabLabel: Record<GlossaryTab, string> = {
    properties: t.glossary.tabProperties,
    concepts: t.glossary.sectionConcepts,
    sources: t.glossary.sources,
  }
  const selected = validCategory(tab, category)
  const counts = categoryCounts(result, tab)
  const shown = visibleTopics(result, tab, selected)
  const sources = (Object.keys(SOURCE_URLS) as SourceKey[]).filter((key) => result.sources.has(key))
  const elsewhere = GLOSSARY_TABS.filter((name) => name !== tab && result.counts[name] > 0)

  // Matches of this tab that the selected category chip leaves out.
  const hiddenByCategory = tab !== 'sources' && selected !== null ? counts.all : 0
  const emptyTab = hiddenByCategory > 0 ? (
    <Card>
      <p className="text-sm text-muted-foreground">
        {fill(t.glossary.searchHidden, { count: hiddenByCategory })}{' '}
        <button type="button" className="cursor-pointer rounded text-primary underline" onClick={() => onCategoryChange(null)}>
          {t.glossary.showAllCategories}
        </button>
      </p>
    </Card>
  ) : (
    <Card>
      <p className="text-sm text-muted-foreground">
        {result.total === 0 ? t.glossary.searchEmpty : t.glossary.searchNoneHere}{' '}
        {elsewhere.map((name) => (
          <button key={name} type="button" className="mr-2 cursor-pointer rounded text-primary underline" onClick={() => onTabChange(name)}>
            {fill(t.glossary.searchElsewhere, { count: result.counts[name], tab: tabLabel[name] })}
          </button>
        ))}
      </p>
    </Card>
  )

  // Single-select chips: "All" plus one per category of the tab, each with its count under the current search.
  const chips = (
    <div role="group" aria-label={t.glossary.chipsLabel} className="mb-3 flex max-w-full gap-1.5 overflow-x-auto pb-1">
      {[null, ...categoriesOfTab(tab)].map((name) => {
        const count = name === null ? counts.all : counts.byCategory.get(name) ?? 0
        const active = selected === name
        return (
          <button
            key={name ?? 'all'}
            type="button"
            aria-pressed={active}
            onClick={() => onCategoryChange(name)}
            className={cn(
              'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium',
              active ? 'border-brand bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted',
              count === 0 && 'opacity-60',
            )}
          >
            {name === null ? t.glossary.chipAll : t.glossary.categories[name]}
            <span className="rounded-full border px-1.5 text-xs tabular-nums">{count}</span>
          </button>
        )
      })}
    </div>
  )

  const card = (topic: (typeof shown)[number], withDiagram: boolean) => (
    <TopicCard key={topic.key} topic={topic.key} category={topic.category} terms={result.terms} diagram={withDiagram ? { config, tree, sizing } : null} />
  )
  // One section per category that still has cards: an empty section shows no heading.
  const sections = (withDiagram: boolean) =>
    categoriesOfTab(tab).map((name) => {
      const topics = shown.filter((topic) => topic.category === name)
      if (topics.length === 0) return null
      const Icon = CATEGORY_ICONS[name]
      return (
        <section key={name} aria-label={t.glossary.categories[name]}>
          <h3 className="mb-2 flex items-center gap-2 text-base font-semibold">
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {t.glossary.categories[name]}
          </h3>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{topics.map((topic) => card(topic, withDiagram))}</div>
        </section>
      )
    })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={inputRef}
            data-glossary-search=""
            type="text"
            role="searchbox"
            className="px-8"
            value={typed}
            placeholder={t.glossary.searchPlaceholder}
            aria-label={t.glossary.searchPlaceholder}
            aria-describedby={searchHintId}
            onChange={(event) => onType(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && onType('')}
          />
          {/* The shortcut is shown on the field while it is empty, and read out as its description. */}
          <span id={searchHintId} className="sr-only">{t.glossary.searchHint}</span>
          {typed === '' && <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 text-xs text-muted-foreground sm:block" aria-hidden="true">/</kbd>}
          {typed !== '' && (
            <button
              type="button"
              className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              aria-label={t.glossary.searchClear}
              title={t.glossary.searchClear}
              onClick={() => {
                onType('')
                inputRef.current?.focus()
              }}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="min-h-5 text-[13px] text-muted-foreground" aria-live="polite">
          {searching ? fill(t.glossary.searchCount, { count: result.total }) : ''}
        </p>
      </div>

      <Tabs value={tab} onValueChange={(next) => onTabChange(GLOSSARY_TABS.find((name) => name === next) ?? 'properties')}>
        <TabsList aria-label={t.glossary.tabsLabel}>
          {GLOSSARY_TABS.map((name) => (
            <TabsTrigger key={name} value={name} className={cn(searching && result.counts[name] === 0 && 'opacity-60')}>
              {tabLabel[name]}
              {searching && <span className="rounded-full border px-1.5 text-xs tabular-nums">{result.counts[name]}</span>}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="properties">
          {chips}
          {shown.length === 0 ? emptyTab : (
            <div className="flex flex-col gap-5">
              <Card>
                <CardTitle>{t.glossary.referenceTable}</CardTitle>
                <CardDescription>{t.glossary.lead}</CardDescription>
                <div className="mt-3 max-w-full overflow-x-auto">
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr>
                        {[t.glossary.jsonKey, t.glossary.dbColumn, t.glossary.unit, t.glossary.fallback].map((header) => (
                          <th key={header} scope="col" className="border-b px-2 py-1.5 text-left font-semibold text-muted-foreground">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((topic) => (
                        <tr key={topic.key}>
                          <td className="border-b px-2 py-1"><code><Highlight text={topic.jsonKey ?? t.glossary.notInFile} terms={result.terms} /></code></td>
                          <td className="border-b px-2 py-1"><code><Highlight text={topic.dbColumn ?? t.glossary.notInDb} terms={result.terms} /></code></td>
                          <td className="border-b px-2 py-1"><Highlight text={t.topics[topic.key].unit ?? ''} terms={result.terms} /></td>
                          <td className="border-b px-2 py-1"><Highlight text={t.topics[topic.key].fallback ?? ''} terms={result.terms} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              {sections(false)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="concepts">
          {chips}
          {shown.length === 0 ? emptyTab : <div className="flex flex-col gap-5">{sections(true)}</div>}
        </TabsContent>

        <TabsContent value="sources">
          {sources.length === 0 ? emptyTab : (
            <Card>
              {/* No title: the selected tab above already names the card. */}
              <ul className="m-0 list-disc pl-5 text-sm">
                {sources.map((key) => (
                  <li key={key}>
                    <a className="text-primary underline [overflow-wrap:anywhere]" href={SOURCE_URLS[key]} target="_blank" rel="noopener noreferrer">
                      <Highlight text={labels[key]} terms={result.terms} />
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[13px] text-muted-foreground" data-testid="compatibility">
                <span className="font-medium text-foreground">{t.welcome.compatibilityTitle}</span> {t.glossary.compatibility}
              </p>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
