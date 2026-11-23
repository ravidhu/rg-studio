import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { WIDTH } from '@/utils/diagram'

interface FigureProps {
  /** What the picture shows. Used as caption and as accessible name. */
  caption: string
  /** Badge after the caption, to say where the numbers come from. */
  origin?: string
  height: number
  /** Key of the colours, shown between the drawing and the caption. */
  legend?: { color: string; label: string }[]
  children: ReactNode
}

/** A diagram with its caption. The drawing scales with the available width. */
export function Figure({ caption, origin, height, legend, children }: FigureProps) {
  return (
    <figure className="m-0 mb-3">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label={caption}
        className="block h-auto w-full max-w-[30rem] text-foreground"
      >
        <title>{caption}</title>
        {children}
      </svg>
      {legend && (
        <ul className="m-0 mt-1.5 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-[13px] text-muted-foreground">
          {legend.map((item) => (
            <li key={item.label} className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 12 12" className="size-3 shrink-0" aria-hidden="true"><rect width="12" height="12" rx="3" fill={item.color} /></svg>
              {item.label}
            </li>
          ))}
        </ul>
      )}
      <figcaption className="mt-1.5 text-[13px] text-muted-foreground">
        {caption}
        {origin && <Badge className="ml-1.5">{origin}</Badge>}
      </figcaption>
    </figure>
  )
}

interface TxtProps {
  x: number
  y: number
  children: ReactNode
  anchor?: 'start' | 'middle' | 'end'
  size?: number
  fill?: string
  mono?: boolean
  bold?: boolean
}

export function Txt({ x, y, children, anchor = 'start', size = 11.5, fill = 'currentColor', mono = false, bold = false }: TxtProps) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontSize={size}
      fill={fill}
      fontWeight={bold ? 600 : 400}
      fontFamily={mono ? 'var(--font-mono)' : undefined}
    >
      {children}
    </text>
  )
}

interface ArrowProps {
  x1: number
  y1: number
  x2: number
  y2: number
  color?: string
}

/** Straight arrow with a filled head at its end. */
export function Arrow({ x1, y1, x2, y2, color = 'currentColor' }: ArrowProps) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const head = 6
  const point = (offset: number): string =>
    `${x2 - head * Math.cos(angle + offset)},${y2 - head * Math.sin(angle + offset)}`
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2 - 3 * Math.cos(angle)} y2={y2 - 3 * Math.sin(angle)} stroke={color} strokeWidth={1.5} />
      <polygon points={`${x2},${y2} ${point(0.45)} ${point(-0.45)}`} fill={color} />
    </g>
  )
}

interface BoxProps {
  x: number
  y: number
  w: number
  h: number
  dashed?: boolean
  fill?: string
  stroke?: string
}

export function Box({ x, y, w, h, dashed = false, fill = 'none', stroke = 'currentColor' }: BoxProps) {
  return <rect x={x} y={y} width={w} height={h} rx={4} fill={fill} stroke={stroke} strokeWidth={1} strokeDasharray={dashed ? '4 3' : undefined} />
}
