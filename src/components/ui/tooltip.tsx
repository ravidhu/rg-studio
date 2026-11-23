import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ComponentProps } from 'react'
import { cn } from '@/utils/cn'

export function TooltipProvider(props: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={80} skipDelayDuration={300} {...props} />
}

export function Tooltip(props: ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root {...props} />
}

export function TooltipTrigger(props: ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger {...props} />
}

export function TooltipContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          'z-50 max-w-[min(20rem,calc(100vw-1rem))] rounded-md border bg-card px-3 py-2 text-[13px] text-card-foreground shadow-md',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}
