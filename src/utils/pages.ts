import { GLOSSARY_TABS, validCategory, type GlossaryTab } from '@/utils/search'
import type { TopicCategory } from '@/utils/topics'

/** Readable names accepted in an address for a glossary tab. */
const GLOSSARY_TAB_ALIASES: Record<string, string> = { 'how-it-works': 'concepts' }

/** Address of a glossary tab, with its selected category when there is one. */
export function glossaryHash(tab: GlossaryTab, category: TopicCategory | null): string {
  const name = tab === 'concepts' ? 'how-it-works' : tab
  return category === null ? `#glossary/${name}` : `#glossary/${name}/${category}`
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

/**
 * Reads the address fragment: a page name, then for the configuration page
 * or the glossary an optional tab name, as in `#configure/selectors`, and
 * for the glossary an optional category, as in `#glossary/how-it-works/limits`. Only these names are
 * ever kept in the address, never configuration data.
 */
/** Section of the import and export tab that an address can point at. */
export type ConfigSection = 'import' | 'export'

export interface ParsedHash {
  page: PageName
  configTab: ConfigTab
  /** Section to bring into view on the import and export tab. */
  configSection: ConfigSection | null
  glossaryTab: GlossaryTab
  glossaryCategory: TopicCategory | null
}

export function parseHash(hash: string): ParsedHash {
  const [first = '', second = '', third = ''] = hash.replace(/^#/, '').split('/')
  const glossaryTab = GLOSSARY_TABS.find((name) => name === (GLOSSARY_TAB_ALIASES[second] ?? second)) ?? 'properties'
  // Addresses of earlier versions still work: the checks were a page, import and export were two tabs.
  const pageName = PAGE_ALIASES[first] ?? first
  const section: ConfigSection | null = second === 'import' || second === 'export' ? second : null
  const tabName = first === 'checks' ? 'checks' : section !== null ? 'import-export' : second
  return {
    // Without a page name the application opens on the configuration: load first, then look.
    page: isPageName(pageName) ? pageName : 'configure',
    configTab: CONFIG_TABS.find((name) => name === tabName) ?? 'import-export',
    configSection: section,
    glossaryTab,
    glossaryCategory: validCategory(glossaryTab, third),
  }
}

/** The one address of a parsed fragment: earlier page and tab names are rewritten to it. */
export function canonicalHash(parsed: ParsedHash): string {
  if (parsed.page === 'configure') return `#configure/${parsed.configTab}`
  if (parsed.page === 'glossary') return glossaryHash(parsed.glossaryTab, parsed.glossaryCategory)
  return `#${parsed.page}`
}
