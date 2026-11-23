import type { ReactNode } from 'react'
import { matchRanges } from '@/utils/search'

interface HighlightProps {
  text: string
  /** Folded search terms. Without terms the text is returned as is. */
  terms?: readonly string[]
}

/** Text with the parts that match the search marked. */
export function Highlight({ text, terms }: HighlightProps) {
  if (!terms || terms.length === 0) return <>{text}</>
  const ranges = matchRanges(text, terms)
  if (ranges.length === 0) return <>{text}</>
  const parts: ReactNode[] = []
  let cursor = 0
  ranges.forEach(([start, end], index) => {
    if (start > cursor) parts.push(text.slice(cursor, start))
    parts.push(<mark key={index} className="rounded-[3px] bg-accent px-0.5 text-accent-foreground ring-1 ring-brand">{text.slice(start, end)}</mark>)
    cursor = end
  })
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}
