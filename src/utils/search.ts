import type { Dictionary, TopicKey } from '@/i18n/en'
import {
  CONCEPT_CATEGORIES, PROPERTY_CATEGORIES, SOURCE_URLS, TOPICS,
  type SourceKey, type TopicCategory, type TopicMeta,
} from '@/utils/topics'

/** Tabs of the glossary, in display order. */
export const GLOSSARY_TABS = ['properties', 'concepts', 'sources'] as const
export type GlossaryTab = (typeof GLOSSARY_TABS)[number]

const MARKS = /[̀-ͯ]/g

/**
 * Folds text for comparison: lower case and without accents, so that `é`
 * equals `e` and `ç` equals `c`. Done one character at a time, so a position
 * in the folded text is the same position in the original.
 */
export function fold(text: string): string {
  let out = ''
  for (const char of text) {
    const folded = char.normalize('NFD').replace(MARKS, '').toLowerCase()
    out += folded.length === char.length ? folded : char.toLowerCase().slice(0, char.length).padEnd(char.length, ' ')
  }
  return out
}

/** Search terms of a query: folded words. Every term must be found. */
export function searchTerms(query: string): string[] {
  return fold(query).split(/\s+/).filter((term) => term !== '')
}

/** True when every term occurs somewhere in the text, as a word or part of a word. */
export function matchesAll(text: string, terms: readonly string[]): boolean {
  const folded = fold(text)
  return terms.every((term) => folded.includes(term))
}

/** Ranges of the text that match a term, merged and in order, for highlighting. */
export function matchRanges(text: string, terms: readonly string[]): [number, number][] {
  const folded = fold(text)
  const ranges: [number, number][] = []
  for (const term of terms) {
    for (let from = folded.indexOf(term); from !== -1 && term !== ''; from = folded.indexOf(term, from + term.length)) {
      ranges.push([from, from + term.length])
    }
  }
  ranges.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([...range])
  }
  return merged
}

/** Captions of the diagrams shown with each concept, searched with its text. */
const DIAGRAM_CAPTIONS: Partial<Record<TopicKey, (keyof Dictionary['diagrams'])[]>> = {
  conceptAncestors: ['ancestors', 'oversubAbove'],
  conceptSoftHard: ['softHard'],
  conceptLeaf: ['leaf'],
  conceptRoots: ['rootsCaption'],
  conceptClusterMemory: ['memory'],
  conceptCpu: ['cpu'],
  conceptPolicies: ['policies'],
  conceptSelectorOrder: ['selectors'],
  conceptRegex: ['regex'],
  conceptTemplates: ['templates'],
  conceptManager: ['manager'],
  conceptModel: ['model'],
}

/** Everything a reader can see about a topic, in one text. */
export function topicText(meta: TopicMeta, dictionary: Dictionary): string {
  const text = dictionary.topics[meta.key]
  const captions = (DIAGRAM_CAPTIONS[meta.key] ?? []).map((key) => dictionary.diagrams[key].replace(/\{\w+\}/g, ' '))
  return [
    text.title, meta.jsonKey ?? '', meta.dbColumn ?? '', text.unit ?? '', text.fallback ?? '',
    text.what.replace(/\{\w+\}/g, ' '), text.interaction ?? '', text.verified ?? '', ...captions,
  ].join(' \n ')
}

export function tabOfTopic(meta: TopicMeta): GlossaryTab {
  return meta.section === 'concept' ? 'concepts' : 'properties'
}

export function sourceLabels(dictionary: Dictionary): Record<SourceKey, string> {
  return {
    groups: dictionary.glossary.sourceSep,
    memory: dictionary.glossary.sourceMemory,
    deploy: dictionary.glossary.sourceDeploy,
  }
}

export interface GlossarySearch {
  terms: string[]
  /** Topics that match. Every topic when the query is empty. */
  topics: Set<TopicKey>
  sources: Set<SourceKey>
  counts: Record<GlossaryTab, number>
  total: number
}

/** Runs a query on the whole glossary in one language and counts the matches of each tab. */
export function searchGlossary(query: string, dictionary: Dictionary): GlossarySearch {
  const terms = searchTerms(query)
  const topics = new Set<TopicKey>()
  const sources = new Set<SourceKey>()
  const counts: Record<GlossaryTab, number> = { properties: 0, concepts: 0, sources: 0 }
  for (const meta of TOPICS) {
    if (!matchesAll(topicText(meta, dictionary), terms)) continue
    topics.add(meta.key)
    counts[tabOfTopic(meta)] += 1
  }
  const labels = sourceLabels(dictionary)
  for (const key of Object.keys(SOURCE_URLS) as SourceKey[]) {
    if (!matchesAll(`${labels[key]} ${SOURCE_URLS[key]}`, terms)) continue
    sources.add(key)
    counts.sources += 1
  }
  return { terms, topics, sources, counts, total: counts.properties + counts.concepts + counts.sources }
}

/** Categories offered as filter chips on a tab, in reading order. The sources tab has none. */
export function categoriesOfTab(tab: GlossaryTab): readonly TopicCategory[] {
  return tab === 'concepts' ? CONCEPT_CATEGORIES : tab === 'properties' ? PROPERTY_CATEGORIES : []
}

/** The category when it belongs to the tab, else `null`: an unknown chip means all categories. */
export function validCategory(tab: GlossaryTab, category: string | null): TopicCategory | null {
  return categoriesOfTab(tab).find((name) => name === category) ?? null
}

/**
 * Entries of a tab that match the search, split by category. `all` is the
 * count of the tab, so the chips and the tab badge always agree.
 */
export function categoryCounts(result: GlossarySearch, tab: GlossaryTab): { all: number; byCategory: Map<TopicCategory, number> } {
  const byCategory = new Map<TopicCategory, number>(categoriesOfTab(tab).map((name) => [name, 0]))
  let all = 0
  for (const meta of TOPICS) {
    if (tabOfTopic(meta) !== tab || !result.topics.has(meta.key)) continue
    all += 1
    byCategory.set(meta.category, (byCategory.get(meta.category) ?? 0) + 1)
  }
  return { all, byCategory }
}

/** Entries to show on a tab: those that match the search and, when a chip is selected, its category. */
export function visibleTopics(result: GlossarySearch, tab: GlossaryTab, category: TopicCategory | null): TopicMeta[] {
  return TOPICS.filter(
    (meta) => tabOfTopic(meta) === tab && result.topics.has(meta.key) && (category === null || meta.category === category),
  )
}
