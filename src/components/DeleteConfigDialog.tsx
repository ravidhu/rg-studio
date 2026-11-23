import { Trash2 } from 'lucide-react'
import { useId, useRef, type RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { useDrawer } from '@/hooks/useDrawer'
import { useI18n } from '@/hooks/useI18n'

interface DeleteConfigDialogProps {
  /** Element that takes the focus back when the dialog closes without deleting. */
  opener: RefObject<HTMLElement | null>
  onCancel: () => void
  onConfirm: () => void
  /** Closes the dialog and opens the export section, to keep a copy first. */
  onExport: () => void
}

/**
 * Confirmation before the configuration stored in this browser is removed.
 * Same behaviour as the other modal surfaces: focus kept inside, Escape
 * cancels, the page behind does not scroll.
 */
export function DeleteConfigDialog({ opener, onCancel, onConfirm, onExport }: DeleteConfigDialogProps) {
  const { t } = useI18n()
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  useDrawer(true, dialogRef, opener, onCancel)
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={titleId} data-testid="delete-dialog" className="relative w-full max-w-md rounded-xl border bg-card p-4 shadow-xl">
        <p id={titleId} className="text-[15px] font-medium">{t.storage.confirm}</p>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button type="button" className="mr-auto cursor-pointer rounded text-sm text-primary underline" onClick={onExport}>{t.storage.toExport}</button>
          <Button onClick={onCancel}>{t.storage.cancel}</Button>
          <Button variant="destructive" onClick={onConfirm}>
            <Trash2 aria-hidden="true" />
            {t.storage.confirmDelete}
          </Button>
        </div>
      </div>
    </div>
  )
}
