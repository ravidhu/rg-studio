import type { ComponentProps } from 'react'
import { cn } from '@/utils/cn'

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-lg border bg-card p-4 text-card-foreground', className)} {...props} />
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('text-lg font-semibold leading-snug', className)} {...props} />
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('mt-1 text-sm text-muted-foreground', className)} {...props} />
}
