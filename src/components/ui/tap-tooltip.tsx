import { useRef, useState, type ReactElement } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Tooltip that also opens on keyboard focus and on tap. The tooltip primitive
 * alone ignores touch, so it is opened by hand on click and on focus. The
 * child must be focusable. It carries the text as its accessible name, or
 * points to it with `aria-describedby` when it has a name of its own.
 */
export function TapTooltip({ tip, children }: { tip: string; children: ReactElement }) {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  // Focus can scroll the page, and a scroll closes tooltips: open once it has settled.
  const openSoon = (): void => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(true), 150)
  }
  const close = (): void => {
    window.clearTimeout(timer.current)
    setOpen(false)
  }
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild onClick={() => setOpen(true)} onFocus={openSoon} onBlur={close}>
        {children}
      </TooltipTrigger>
      {/* Each line of the text is one line of the tooltip. */}
      <TooltipContent>
        {tip.split('\n').map((line, index) => (
          <div key={index} className={index === 0 ? undefined : 'mt-0.5 text-muted-foreground'}>{line}</div>
        ))}
      </TooltipContent>
    </Tooltip>
  )
}
