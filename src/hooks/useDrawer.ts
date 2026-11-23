import { useEffect, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

/**
 * Behaviour of an off-canvas drawer while it is open: focus moves into it and
 * stays inside, Escape closes it, the page behind does not scroll, and focus
 * goes back to the button that opened it when it closes.
 */
export function useDrawer(
  active: boolean,
  drawer: RefObject<HTMLElement | null>,
  opener: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!active) return
    const panel = drawer.current
    const openerElement = opener.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusables = (): HTMLElement[] =>
      panel ? [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.offsetParent !== null) : []
    focusables()[0]?.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      const current = document.activeElement
      if (!panel?.contains(current)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && current === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && current === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      openerElement?.focus()
    }
  }, [active, drawer, opener, onClose])
}
