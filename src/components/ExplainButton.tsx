import * as Popover from '@radix-ui/react-popover'
import { CircleHelp, X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { TopicBody } from '@/components/TopicBody'
import { useHelp } from '@/hooks/useHelp'
import { useI18n } from '@/hooks/useI18n'
import type { TopicKey } from '@/i18n/en'

const HOVER_OPEN_MS = 300
const HOVER_CLOSE_MS = 220

/**
 * Help button with its explanation in a card anchored to it.
 * - Hovering opens the card after a short delay and it stays open while the
 *   pointer is on the button or on the card.
 * - A click, a tap, Enter or Space opens it at once and pins it, until
 *   Escape, a click outside or the close button.
 * - Only one card is open at a time.
 * The compact form is the icon alone, for places where a label does not fit.
 * `walk` is a worked example with the figures shown next to the button: it
 * follows them while the card is open.
 */
export function ExplainButton({ topic, compact = false, walk }: { topic: TopicKey; compact?: boolean; walk?: readonly string[] }) {
  const { state, dispatch } = useHelp()
  const { t } = useI18n()
  const id = useId()
  const timer = useRef<number | undefined>(undefined)
  const open = state.openId === id
  const title = t.topics[topic].title

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const later = (action: () => void, delay: number): void => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(action, delay)
  }
  // Hovering only exists with a mouse: on touch screens a tap is a click.
  const enter = (pointerType: string): void => {
    if (pointerType === 'mouse') later(() => dispatch({ type: 'hover', id }), HOVER_OPEN_MS)
  }
  const leave = (pointerType: string): void => {
    if (pointerType === 'mouse') later(() => dispatch({ type: 'leave', id }), HOVER_CLOSE_MS)
  }

  return (
    <Popover.Root open={open} onOpenChange={(next) => !next && open && dispatch({ type: 'dismiss' })}>
      <Popover.Trigger asChild>
        <button
          type="button"
          onClick={(event) => {
            // Handled here instead of by the primitive, so that a click pins a card opened by hovering.
            event.preventDefault()
            window.clearTimeout(timer.current)
            dispatch({ type: 'toggle', id })
          }}
          onPointerEnter={(event) => enter(event.pointerType)}
          onPointerLeave={(event) => leave(event.pointerType)}
          title={compact && !open ? title : undefined}
          className={
            compact
              ? '-my-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full align-middle text-muted-foreground hover:bg-muted'
              : 'inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-left text-xs text-muted-foreground hover:bg-muted'
          }
          aria-label={`${t.common.explain}: ${title}`}
        >
          <CircleHelp className={compact ? 'size-4' : 'size-3.5 shrink-0'} aria-hidden="true" />
          {!compact && title}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          role="dialog"
          aria-labelledby={`${id}-title`}
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={16}
          // A card opened by hovering leaves the focus on its button.
          onOpenAutoFocus={(event) => !state.pinned && event.preventDefault()}
          // Focus moving elsewhere does not close a card: when another card takes over, the
          // one that closes hands focus back to its button, which must not dismiss the new one.
          onFocusOutside={(event) => event.preventDefault()}
          onPointerEnter={(event) => event.pointerType === 'mouse' && window.clearTimeout(timer.current)}
          onPointerLeave={(event) => leave(event.pointerType)}
          className="z-50 max-h-[min(70vh,var(--radix-popover-content-available-height))] w-[min(360px,calc(100vw-32px))] overflow-y-auto rounded-lg border bg-card p-3 text-card-foreground shadow-lg outline-none"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <h3 id={`${id}-title`} className="text-[15px] font-semibold leading-snug">{title}</h3>
            <Popover.Close asChild>
              <button type="button" className="-mr-1 -mt-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label={t.shell.closeHelp}>
                <X className="size-4" aria-hidden="true" />
              </button>
            </Popover.Close>
          </div>
          <TopicBody topic={topic} walk={walk} />
          <Popover.Arrow className="fill-[var(--card)] stroke-[var(--border)]" width={14} height={7} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function ExplainRow({ topics }: { topics: readonly TopicKey[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {topics.map((topic) => (
        <ExplainButton key={topic} topic={topic} />
      ))}
    </div>
  )
}
