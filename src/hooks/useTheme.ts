import { useEffect, useState } from 'react'
import { readPreference, writePreference } from '@/utils/preferences'

export type ThemeChoice = 'system' | 'light' | 'dark'

const CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark']

/** Theme choice of the viewer. `system` follows the operating system setting. */
export function useTheme(): { theme: ThemeChoice; setTheme: (theme: ThemeChoice) => void } {
  const [theme, setTheme] = useState<ThemeChoice>(() => {
    const stored = readPreference('theme')
    return CHOICES.find((choice) => choice === stored) ?? 'system'
  })

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    writePreference('theme', theme)
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  return { theme, setTheme }
}
