import { useEffect, useRef, useState } from 'react'

/**
 * Moves arcs smoothly from their previous angles and rings to the new ones,
 * matching them by identifier. A new arc opens from its start angle. The
 * change is immediate when the viewer asked for reduced motion.
 */
export function useTweenedArcs<Arc extends { id: string; start: number; end: number; depth: number }>(target: Arc[], durationMs = 280): Arc[] {
  // The animation restarts only when the geometry changes, not each time the caller builds an equal list again.
  const key = target.map((arc) => `${arc.id}:${arc.start}:${arc.end}:${arc.depth}`).join('|')
  const [held, setHeld] = useState({ key, target })
  if (held.key !== key) setHeld({ key, target })
  const [shown, setShown] = useState(target)
  const latest = useRef(target)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const from = new Map(latest.current.map((arc) => [arc.id, arc]))
    const startTime = performance.now()
    let frame = 0
    const step = (now: number): void => {
      const progress = reduced ? 1 : Math.min(1, (now - startTime) / durationMs)
      const eased = 1 - (1 - progress) ** 3
      const next = held.target.map((arc) => {
        const previous = from.get(arc.id)
        const start = previous ? previous.start : arc.start
        const end = previous ? previous.end : arc.start
        const depth = previous ? previous.depth : arc.depth
        return {
          ...arc,
          start: start + (arc.start - start) * eased,
          end: end + (arc.end - end) * eased,
          depth: depth + (arc.depth - depth) * eased,
        }
      })
      latest.current = next
      setShown(next)
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [held, durationMs])

  return shown
}
