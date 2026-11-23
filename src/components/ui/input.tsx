import type { ComponentProps } from 'react'
import { cn } from '@/utils/cn'

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'h-9 w-full min-w-0 rounded-md border border-input bg-card px-2.5 text-sm placeholder:text-subtle-foreground disabled:opacity-50 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-28 w-full rounded-md border border-input bg-card px-2.5 py-2 font-mono text-[13px] placeholder:text-subtle-foreground',
        className,
      )}
      spellCheck={false}
      {...props}
    />
  )
}

export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn('h-9 w-full min-w-0 rounded-md border border-input bg-card px-2 text-sm aria-invalid:border-destructive', className)}
      {...props}
    />
  )
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-[13px] font-medium text-muted-foreground', className)} {...props} />
}
