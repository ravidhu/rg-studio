import { createContext, useContext, useId, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface TabsState {
  value: string
  onValueChange: (value: string) => void
  baseId: string
}

const TabsContext = createContext<TabsState | null>(null)

function useTabs(): TabsState {
  const context = useContext(TabsContext)
  if (!context) throw new Error('Tabs parts must be used inside Tabs')
  return context
}

interface TabsProps {
  value: string
  onValueChange: (value: string) => void
  className?: string
  children: ReactNode
}

/** Controlled tabs following the WAI-ARIA tabs pattern: arrow keys, Home and End move between tabs. */
export function Tabs({ value, onValueChange, className, children }: TabsProps) {
  const baseId = useId()
  return (
    <TabsContext.Provider value={{ value, onValueChange, baseId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ className, ...props }: ComponentProps<'div'>) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    const index = tabs.findIndex((tab) => tab === document.activeElement)
    let target = -1
    if (event.key === 'ArrowRight') target = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') target = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = tabs.length - 1
    const next = tabs[target]
    if (next) {
      event.preventDefault()
      next.focus()
      next.click()
    }
  }
  return (
    <div
      role="tablist"
      onKeyDown={onKeyDown}
      className={cn('flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1', className)}
      {...props}
    />
  )
}

export function TabsTrigger({ value, className, ...props }: ComponentProps<'button'> & { value: string }) {
  const tabs = useTabs()
  const active = tabs.value === value
  return (
    <button
      type="button"
      role="tab"
      id={`${tabs.baseId}-tab-${value}`}
      aria-selected={active}
      aria-controls={`${tabs.baseId}-panel-${value}`}
      tabIndex={active ? 0 : -1}
      onClick={() => tabs.onValueChange(value)}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground [&_svg]:size-4',
        active && 'bg-accent text-accent-foreground shadow-sm ring-1 ring-brand',
        className,
      )}
      {...props}
    />
  )
}

interface TabsContentProps extends ComponentProps<'div'> {
  value: string
  /** Keeps the panel in the page while hidden, so what was typed in it is not lost. */
  keepMounted?: boolean
}

export function TabsContent({ value, keepMounted = false, className, ...props }: TabsContentProps) {
  const tabs = useTabs()
  const active = tabs.value === value
  if (!active && !keepMounted) return null
  return (
    <div
      role="tabpanel"
      hidden={!active}
      id={`${tabs.baseId}-panel-${value}`}
      aria-labelledby={`${tabs.baseId}-tab-${value}`}
      className={cn('mt-4', className)}
      {...props}
    />
  )
}
