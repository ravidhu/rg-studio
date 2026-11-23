import { useId } from 'react'
import { ExplainButton } from '@/components/ExplainButton'
import { Label, NativeSelect } from '@/components/ui/input'
import { useI18n } from '@/hooks/useI18n'
import type { ManagerMode } from '@/types/model'
import type { ManagerSwitchNote } from '@/utils/configReducer'

interface SourceManagerChoiceProps {
  mode: ManagerMode
  /** `false` until the reader has answered: nothing is preselected. */
  chosen: boolean
  /** What the last change did to the selectors, `null` when nothing is to be said. */
  note: ManagerSwitchNote
  onChoose: (mode: ManagerMode) => void
}

/**
 * Asked only for a configuration started from scratch: an import and the
 * example already say which manager they are for. The answer sets how the
 * selectors are ordered, so the tester and the checks wait for it.
 */
export function SourceManagerChoice({ mode, chosen, note, onChoose }: SourceManagerChoiceProps) {
  const { t } = useI18n()
  const id = useId()
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5" data-source-choice="">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="flex items-center gap-1">
          <Label htmlFor={id}>{t.source.question}</Label>
          <ExplainButton topic="conceptManager" compact />
        </span>
        <NativeSelect
          id={id}
          data-testid="source-manager"
          className="h-8 w-auto max-w-full"
          value={chosen ? mode : ''}
          onChange={(event) => (event.target.value === 'db' || event.target.value === 'file') && onChoose(event.target.value)}
        >
          {!chosen && <option value="">{t.source.choose}</option>}
          <option value="file">{t.source.file}</option>
          <option value="db">{t.source.db}</option>
        </NativeSelect>
      </div>
      {note !== null && <p className="mt-1.5 text-[13px] font-medium" role="status" data-manager-note="">{t.editor.modeNote[note]}</p>}
    </div>
  )
}
