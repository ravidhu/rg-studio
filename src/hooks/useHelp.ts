import { createContext, useContext, type Dispatch } from 'react'
import type { HelpAction, HelpState } from '@/utils/helpState'

export interface HelpStore {
  state: HelpState
  dispatch: Dispatch<HelpAction>
}

export const HelpContext = createContext<HelpStore | null>(null)

/** Shared state of the help cards, so that opening one closes the others. */
export function useHelp(): HelpStore {
  const context = useContext(HelpContext)
  if (!context) throw new Error('useHelp must be used inside HelpProvider')
  return context
}
