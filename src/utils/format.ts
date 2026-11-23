/** Number and unit formatting shared by every view, so a value reads the same everywhere. */

export type Lang = 'en' | 'fr'

export type MemoryUnit = 'MB' | 'GB' | 'TB'

/** Displayed names of the memory units. French uses octets: Mo, Go, To. */
const UNIT_LABELS: Record<Lang, Record<MemoryUnit, string>> = {
  en: { MB: 'MB', GB: 'GB', TB: 'TB' },
  fr: { MB: 'Mo', GB: 'Go', TB: 'To' },
}

/** Keeps a number and its unit on the same line. */
export const NO_BREAK_SPACE = ' '

export function formatNumber(lang: Lang, value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(lang, { maximumFractionDigits }).format(value)
}

export function memoryUnitLabel(lang: Lang, unit: MemoryUnit = 'GB'): string {
  return UNIT_LABELS[lang][unit]
}

/**
 * A memory amount for display, such as `107.5 GB` in English and `107,5 Go`
 * in French. This is for values shown to the reader only: values written in
 * a configuration, such as `10GB`, keep the configuration syntax.
 */
export function formatMemory(lang: Lang, value: number, maximumFractionDigits = 1, unit: MemoryUnit = 'GB'): string {
  return `${formatNumber(lang, value, maximumFractionDigits)}${NO_BREAK_SPACE}${memoryUnitLabel(lang, unit)}`
}
