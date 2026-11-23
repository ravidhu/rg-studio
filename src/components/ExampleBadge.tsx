import { FlaskConical } from 'lucide-react'
import { useI18n } from '@/hooks/useI18n'

interface ExampleBadgeProps {
  /** The example was changed since it was loaded. */
  edited: boolean
  /** Opens the import section of the configuration page. */
  onOpenImport: () => void
}

/**
 * Says that the numbers on screen come from the built-in example, and leads
 * to the import. The label may wrap onto two lines on a narrow screen.
 */
export function ExampleBadge({ edited, onOpenImport }: ExampleBadgeProps) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      onClick={onOpenImport}
      className="mb-2 inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-2xl border border-status-info bg-card px-2.5 py-1 text-left text-[13px] font-medium leading-snug text-foreground hover:bg-muted"
    >
      <FlaskConical className="size-4 shrink-0 text-status-info" aria-hidden="true" />
      <span className="min-w-0">{edited ? t.app.exampleEdited : t.app.exampleData}</span>
    </button>
  )
}
