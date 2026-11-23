import { Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TapTooltip } from '@/components/ui/tap-tooltip'
import { useI18n } from '@/hooks/useI18n'
import type { RefObject } from 'react'

/** Button of a card header that makes the card fill the window, then closes it again. */
interface ExpandButtonProps {
  expanded: boolean
  onToggle: () => void
  buttonRef: RefObject<HTMLButtonElement | null>
  /** Title of the card, named in the label. */
  title: string
}

export function ExpandButton({ expanded, onToggle, buttonRef, title }: ExpandButtonProps) {
  const { t, fill } = useI18n()
  const label = expanded ? t.common.close : fill(t.common.expand, { title })
  return (
    <TapTooltip tip={label}>
      <Button ref={buttonRef} size="icon" variant="ghost" className="shrink-0" data-expand="" aria-label={label} aria-pressed={expanded} onClick={onToggle}>
        {expanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
      </Button>
    </TapTooltip>
  )
}
