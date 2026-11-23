import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fillTemplate, I18nContext, type I18n, type Lang } from '@/hooks/useI18n'
import { en } from '@/i18n/en'
import { fr } from '@/i18n/fr'
import { formatMemory, formatNumber, memoryUnitLabel } from '@/utils/format'
import { readPreference, writePreference } from '@/utils/preferences'

function initialLang(): Lang {
  const stored = readPreference('lang')
  if (stored === 'en' || stored === 'fr') return stored
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  useEffect(() => {
    document.documentElement.lang = lang
    writePreference('lang', lang)
  }, [lang])

  const setLang = useCallback((next: Lang) => setLangState(next), [])
  const value = useMemo<I18n>(() => {
    const t = lang === 'fr' ? fr : en
    const rules = new Intl.PluralRules(lang)
    return {
      lang,
      setLang,
      t,
      fill: fillTemplate,
      plural: (count, forms) => fillTemplate(rules.select(count) === 'one' ? forms.one : forms.other, { count: formatNumber(lang, count, 0) }),
      num: (number, maximumFractionDigits = 0) => formatNumber(lang, number, maximumFractionDigits),
      gb: (number, maximumFractionDigits = 1) => formatMemory(lang, number, maximumFractionDigits),
      unit: (unit = 'GB') => memoryUnitLabel(lang, unit),
    }
  }, [lang, setLang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
