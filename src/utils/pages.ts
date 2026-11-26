import { GLOSSARY_TABS, validCategory, type GlossaryTab } from '@/utils/search'
import type { TopicCategory } from '@/utils/topics'

/** Readable names accepted in an address for a glossary tab. */
const GLOSSARY_TAB_ALIASES: Record<string, string> = { 'how-it-works': 'concepts' }

/** Longest search text, in UTF-16 units after decoding and trimming, that an address carries. */
export const MAX_ADDRESS_SEARCH = 64

/**
 * Characters that never belong in a search text: controls (NUL, newlines),
 * format characters (bidi, zero width), unpaired surrogates (which make
 * `encodeURIComponent` throw) and line or paragraph separators.
 */
const FORBIDDEN_SEARCH_CHARS = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u

/**
 * Search text allowed in an address: trimmed, within the cap and free of
 * forbidden characters. A text that is too long is rejected, not cut,
 * because a cut search would share a different one.
 */
export function cleanSearch(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length > MAX_ADDRESS_SEARCH || FORBIDDEN_SEARCH_CHARS.test(trimmed)) return ''
  return trimmed
}

/**
 * Reads the glossary search from the part of an address after `?`. Only the
 * first `s` parameter counts, and keys are not decoded, so an encoded `s` is
 * ignored. Anything malformed (bad percent-encoding, too long, forbidden
 * characters) gives an empty search.
 */
export function readAddressSearch(raw: string): string {
  // The guard measures the whole query string: it cannot hold a value that decodes to a text within the cap, so it is refused before any decoding.
  if (raw.length > MAX_ADDRESS_SEARCH * 12) return ''
  const part = raw.split('&').find((candidate) => candidate === 's' || candidate.startsWith('s='))
  if (part === undefined) return ''
  try {
    return cleanSearch(decodeURIComponent(part.slice(2).replace(/\+/g, ' ')))
  } catch {
    // A broken escape such as `%E0%A4%A` throws a URIError: the whole value is refused.
    return ''
  }
}

/** Address of a glossary tab, with its selected category and search text when there are any. */
export function glossaryHash(tab: GlossaryTab, category: TopicCategory | null, search = ''): string {
  const name = tab === 'concepts' ? 'how-it-works' : tab
  const base = category === null ? `#glossary/${name}` : `#glossary/${name}/${category}`
  const text = cleanSearch(search)
  return text === '' ? base : `${base}?s=${encodeURIComponent(text)}`
}

/** Pages of the application, in the order of the navigation. */
export const PAGES = ['configure', 'group-allocation', 'selector-tester', 'glossary'] as const

/** Page names of earlier versions, still accepted in an address. */
const PAGE_ALIASES: Record<string, PageName> = {
  configuration: 'configure',
  checks: 'configure',
  dashboard: 'group-allocation',
  allocation: 'group-allocation',
  routing: 'selector-tester',
}

export type PageName = (typeof PAGES)[number]

export function isPageName(value: string): value is PageName {
  return (PAGES as readonly string[]).includes(value)
}

/** Sections of the configuration page, in the order of its tabs. */
export const CONFIG_TABS = ['import-export', 'groups', 'selectors', 'checks'] as const

export type ConfigTab = (typeof CONFIG_TABS)[number]

/** Section of the import and export tab that an address can point at. */
export type ConfigSection = 'import' | 'export'

export interface ParsedHash {
  page: PageName
  configTab: ConfigTab
  /** Section to bring into view on the import and export tab. */
  configSection: ConfigSection | null
  glossaryTab: GlossaryTab
  glossaryCategory: TopicCategory | null
  /** Search text of the glossary, empty on any other page. */
  glossarySearch: string
}

/**
 * Reads the address fragment: a page name, then for the configuration page
 * or the glossary an optional tab name, as in `#configure/selectors`, and
 * for the glossary an optional category, as in `#glossary/how-it-works/limits`.
 * The names are fixed words, never configuration data. The one free text the
 * address holds is the glossary search after `?s=`, read with a cap and
 * rejected when malformed.
 */
export function parseHash(hash: string): ParsedHash {
  const fragment = hash.replace(/^#/, '')
  const queryAt = fragment.indexOf('?')
  const path = queryAt === -1 ? fragment : fragment.slice(0, queryAt)
  const query = queryAt === -1 ? '' : fragment.slice(queryAt + 1)
  const [first = '', second = '', third = ''] = path.split('/')
  const glossaryTab = GLOSSARY_TABS.find((name) => name === (GLOSSARY_TAB_ALIASES[second] ?? second)) ?? 'properties'
  // Addresses of earlier versions still work: the checks were a page, import and export were two tabs.
  const pageName = PAGE_ALIASES[first] ?? first
  const section: ConfigSection | null = second === 'import' || second === 'export' ? second : null
  const tabName = first === 'checks' ? 'checks' : section !== null ? 'import-export' : second
  const page: PageName = isPageName(pageName) ? pageName : 'configure'
  return {
    // Without a page name the application opens on the configuration: load first, then look.
    page,
    configTab: CONFIG_TABS.find((name) => name === tabName) ?? 'import-export',
    configSection: section,
    glossaryTab,
    glossaryCategory: validCategory(glossaryTab, third),
    glossarySearch: page === 'glossary' ? readAddressSearch(query) : '',
  }
}

/** The one address of a parsed fragment: earlier page and tab names are rewritten to it. */
export function canonicalHash(parsed: ParsedHash): string {
  if (parsed.page === 'configure') return `#configure/${parsed.configTab}`
  if (parsed.page === 'glossary') return glossaryHash(parsed.glossaryTab, parsed.glossaryCategory, parsed.glossarySearch)
  return `#${parsed.page}`
}
