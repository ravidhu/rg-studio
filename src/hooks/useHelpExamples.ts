import { createContext, useContext } from 'react'
import type { TopicKey } from '@/i18n/en'

/** Sentences built from the loaded configuration and cluster size, shown in the help of a topic. */
export type HelpExamples = Partial<Record<TopicKey, string>>

export const HelpExamplesContext = createContext<HelpExamples>({})

/** Live figures that help texts quote through a `{name}` placeholder, already formatted. */
export const HelpValuesContext = createContext<Record<string, string>>({})

export function useHelpValues(): Record<string, string> {
  return useContext(HelpValuesContext)
}

export function useHelpExamples(): HelpExamples {
  return useContext(HelpExamplesContext)
}
