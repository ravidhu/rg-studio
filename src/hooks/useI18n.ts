import { createContext, useContext } from 'react'
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

export function useI18n(): I18n {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used inside I18nProvider')
  return context
}
