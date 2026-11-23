import { useMemo, useSyncExternalStore } from 'react'
import { SERIES_COUNT } from '@/utils/resolve'

function subscribe(notify: () => void): () => void {
  const observer = new MutationObserver(notify)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

function snapshot(): string {
  const style = getComputedStyle(document.documentElement)
  const names = [...Array.from({ length: SERIES_COUNT }, (_, index) => `--series-${index + 1}`), '--chart-neutral']
  return names.map((name) => style.getPropertyValue(name).trim()).join(',')
}

/**
 * Categorical colours of the current theme, read from the style tokens so
 * that the stylesheet stays the only place where they are defined.
 */
export function useSeriesPalette(): { palette: string[]; neutral: string } {
  const joined = useSyncExternalStore(subscribe, snapshot)
  return useMemo(() => {
    const values = joined.split(',')
    return { palette: values.slice(0, SERIES_COUNT), neutral: values[SERIES_COUNT] ?? '#8a8a8a' }
  }, [joined])
}
