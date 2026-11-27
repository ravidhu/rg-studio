import { createContext, createElement, Fragment, useContext, type ReactNode } from 'react'
import type { Dictionary } from '@/i18n/en'
import type { Lang, MemoryUnit } from '@/utils/format'

export type { Lang } from '@/utils/format'

/** A counted text in its singular and plural wording, each with a `{count}` placeholder. */
export interface PluralForms {
  one: string
  other: string
}

export interface I18n {
  lang: Lang
  setLang: (lang: Lang) => void
  t: Dictionary
  /** Replaces each `{name}` of a text by the matching value. */
  fill: (template: string, params: Record<string, string | number>) => string
  /** Picks the singular or plural text for a count, by the rules of the current language, and fills `{count}`. */
  plural: (count: number, forms: PluralForms) => string
  /** Formats a number for the current language. */
  num: (value: number, maximumFractionDigits?: number) => string
  /** Formats a memory amount given in GB with the unit of the current language. */
  gb: (value: number, maximumFractionDigits?: number) => string
  /** Name of a memory unit in the current language. */
  unit: (unit?: MemoryUnit) => string
}

export const I18nContext = createContext<I18n | null>(null)

export function fillTemplate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (whole, name: string) => {
    const value = params[name]
    return value === undefined ? whole : String(value)
  })
}

/**
 * Fills a template like `fillTemplate`, but returns React nodes: the values named in `codeKeys` are
 * wrapped in a `<code>` element, the rest of the sentence stays plain text. Values are only ever
 * passed as text children, never parsed as markup, because names come from imported files.
 */
export function fillNodes(template: string, params: Record<string, string | number>, codeKeys: readonly string[]): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  for (const match of template.matchAll(/\{([a-zA-Z]+)\}/g)) {
    const name = match[1] ?? ''
    const value = params[name]
    if (match.index > last) nodes.push(template.slice(last, match.index))
    if (value === undefined) nodes.push(match[0])
    else if (codeKeys.includes(name)) nodes.push(createElement('code', { key: nodes.length }, String(value)))
    else nodes.push(String(value))
    last = match.index + match[0].length
  }
  if (last < template.length) nodes.push(template.slice(last))
  return nodes.map((node, index) => (typeof node === 'string' ? createElement(Fragment, { key: index }, node) : node))
}

export function useI18n(): I18n {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used inside I18nProvider')
  return context
}
