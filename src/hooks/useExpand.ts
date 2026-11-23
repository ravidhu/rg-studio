import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useDrawer } from '@/hooks/useDrawer'

/**
 * Classes that turn a card into an overlay covering the window. The card
 * itself is enlarged, not copied, so its state and its controls are the same
 * in both sizes. It stays under tooltips and help cards, above the page.
 */
export const EXPANDED_SURFACE = 'fixed inset-0 z-40 m-0 overflow-y-auto rounded-none border-0 bg-background p-3 sm:p-5'

export interface Expand {
  expanded: boolean
  toggle: () => void
  /** Element that becomes the overlay. */
  surface: RefObject<HTMLElement | null>
  /** Button that expands and closes: the focus comes back to it. */
  button: RefObject<HTMLButtonElement | null>
}

/**
 * Lets a card fill the window and come back. While it is expanded the focus
 * is kept inside it, Escape closes it and the page behind does not scroll,
 * as for the other modal surfaces. The expanded state is never written to the address.
 */
export function useExpand(): Expand {
  const [expanded, setExpanded] = useState(false)
  const surface = useRef<HTMLElement | null>(null)
  const button = useRef<HTMLButtonElement | null>(null)
  const close = useCallback(() => setExpanded(false), [])
  useDrawer(expanded, surface, button, close)
  const toggle = useCallback(() => setExpanded((current) => !current), [])
  return { expanded, toggle, surface, button }
}

export interface ChartBox {
  width: number
  /** Height left under the top of the element down to the bottom of the window, `null` when the chart keeps its own height. */
  height: number | null
  /** Height of the window, to keep a chart within one screen. */
  viewport: number
}

/**
 * Size available to a chart, measured again whenever its container or the
 * window is resized. With `fill`, the height is what is left of the window
 * under the chart, so an expanded chart can be laid out for the whole screen.
 */
export function useChartBox<T extends HTMLElement>(fill: boolean): [(element: T | null) => void, ChartBox] {
  // The element is kept in state, not in a ref object: a chart that leaves the page and comes back
  // (a level without any ceiling, then a level with some) is a new element, and it must be measured
  // again. With a ref object the observer stayed on the removed element, whose size reads as zero.
  const [element, setElement] = useState<T | null>(null)
  const [box, setBox] = useState<ChartBox>({ width: 0, height: null, viewport: 800 })
  useEffect(() => {
    if (!element) return
    const measure = (): void => {
      // An element on its way out of the page has no size: its last real measure is kept.
      if (!element.isConnected) return
      const rect = element.getBoundingClientRect()
      // The overlay scrolls on its own: the top is taken as if it were not scrolled.
      const top = rect.top + (element.closest('[data-expanded="true"]')?.scrollTop ?? 0)
      const next: ChartBox = { width: rect.width, height: fill ? Math.max(220, window.innerHeight - top - 20) : null, viewport: window.innerHeight }
      setBox((current) => (current.width === next.width && current.height === next.height && current.viewport === next.viewport ? current : next))
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [element, fill])
  return [setElement, box]
}
