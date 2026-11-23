import type { ComponentProps } from 'react'
import { cn } from '@/utils/cn'

export function Badge({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground', className)}
      {...props}
    />
  )
}
