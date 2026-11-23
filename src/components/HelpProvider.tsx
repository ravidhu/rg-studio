import { useMemo, useReducer, type ReactNode } from 'react'
import { HelpContext, type HelpStore } from '@/hooks/useHelp'
import { HELP_CLOSED, helpReducer } from '@/utils/helpState'

export function HelpProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(helpReducer, HELP_CLOSED)
  const value = useMemo<HelpStore>(() => ({ state, dispatch }), [state])
  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>
}
