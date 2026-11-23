import { CircleCheck, CircleX, CloudOff, TriangleAlert, Upload } from 'lucide-react'
import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { ExplainRow } from '@/components/ExplainButton'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/hooks/useI18n'
import type { ImportIssue, RgConfig } from '@/types/model'
import { cn } from '@/utils/cn'
import type { ConfigOrigin } from '@/utils/configSource'
import { MAX_INPUT_BYTES, MAX_ROWS } from '@/utils/csv'
import { demoConfig } from '@/utils/demo'
import { importFiles, readAsOf, type FileSetResult, type PickedFile, type ReadAs } from '@/utils/importFiles'
import { emptyConfig } from '@/utils/tree'

/** A JSON or YAML file comes alone, the CSV dumps of the three tables come together. */
const MAX_FILES = 3

export function IssueList({ issues }: { issues: ImportIssue[] }) {
  const { t, fill } = useI18n()
  return (
    <ul className="m-0 mt-2 list-none space-y-1.5 p-0 text-sm">
      {issues.map((issue, index) => {
        const where = { file: issue.file, line: issue.line ?? '', column: issue.column ?? '' }
        const template = issue.line !== null && issue.column !== null
          ? t.config.location
          : issue.column !== null
            ? t.config.locationNoLine
            : issue.line !== null
              ? t.config.location.replace(', {column}', '')
              : t.config.locationFileOnly
        return (
          <li key={index} className="rounded-md border bg-background px-2.5 py-1.5">
            <code className="text-[13px] text-muted-foreground">{fill(template, where)}</code>
            <div>{fill(t.importErrors[issue.code], issue.params)}</div>
          </li>
        )
      })}
    </ul>
  )
}

interface ImportPanelProps {
  /** `remarks` are the non-blocking remarks of the parser, `readAs` what the files were read as and `files` their names: empty and `null` for the built-in choices. */
  onLoad: (config: RgConfig, origin: ConfigOrigin, remarks: ImportIssue[], readAs: ReadAs | null, files: string[]) => void
  onSeeAllocation: () => void
  /** Shown under the buttons: the question asked after starting from scratch. */
  afterButtons?: ReactNode
}

/**
 * Import from files only: one button opens the file picker, and the same
 * area takes dropped files. The import starts as soon as files are chosen.
 * Files are read in the browser and never sent anywhere.
 */
export function ImportPanel({ onLoad, onSeeAllocation, afterButtons }: ImportPanelProps) {
  const { t, fill } = useI18n()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [result, setResult] = useState<FileSetResult | null>(null)
  const [names, setNames] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)

  const readAs = result ? readAsOf(result) : null

  const refuse = (code: ImportIssue['code'], file: string, params: ImportIssue['params'] = {}): void =>
    setResult({ ok: false, kind: null, errors: [{ severity: 'error', file, line: null, column: null, code, params }], warnings: [] })

  const importPicked = async (files: File[]): Promise<void> => {
    if (files.length === 0) return
    setNames(files.map((file) => file.name))
    if (files.length > MAX_FILES) return refuse('filesMixed', files.map((file) => file.name).join(', '))
    // The size is checked before reading, so a huge file is never loaded in memory.
    const tooLarge = files.find((file) => file.size > MAX_INPUT_BYTES)
    if (tooLarge) return refuse('tooLarge', tooLarge.name, { maxMb: MAX_INPUT_BYTES / 1024 / 1024 })
    let picked: PickedFile[]
    try {
      picked = await Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text() })))
    } catch {
      return refuse('fileUnreadable', files.map((file) => file.name).join(', '))
    }
    const parsed = importFiles(picked)
    setResult(parsed)
    if (parsed.ok) onLoad(parsed.config, 'imported', parsed.warnings, readAsOf(parsed), files.map((file) => file.name))
  }

  const onDrag = (event: DragEvent<HTMLDivElement>): void => {
    // Without this the browser would open the dropped file instead of handing it over.
    event.preventDefault()
    setDragging(true)
  }
  const onDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
    setDragging(false)
  }
  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragging(false)
    void importPicked([...event.dataTransfer.files])
  }

  return (
    <Card>
      <CardTitle>{t.config.importTitle}</CardTitle>
      {/* What to pick, before the place where it is picked: one line per kind of configuration. */}
      <div className="mt-1 space-y-1 text-sm text-muted-foreground" data-import-instructions="">
        <p>{t.config.importFile}</p>
        <p>{t.config.importDb}</p>
        <details className="text-[13px]">
          <summary className="cursor-pointer">{t.common.details}</summary>
          <p className="mt-1">{t.config.importDetails}</p>
          <p className="mt-1">{fill(t.config.limits, { mb: MAX_INPUT_BYTES / 1024 / 1024, rows: MAX_ROWS })}</p>
        </details>
      </div>
      <p className="mt-3 flex items-start gap-2 rounded-md border bg-background px-3 py-2 text-[13px]">
        <CloudOff className="mt-0.5 size-4 shrink-0 text-status-good" aria-hidden="true" />
        {t.config.privacy}
      </p>
      <p className="mt-1.5 text-[13px] text-muted-foreground">{t.app.savedFull}</p>
      <div
        data-drop-zone=""
        data-dragging={dragging}
        onDragEnter={onDrag}
        onDragOver={onDrag}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'mt-3 flex flex-col items-center gap-2.5 rounded-lg border-2 border-dashed px-3 py-5 text-center',
          dragging ? 'border-brand bg-accent' : 'border-input bg-background',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          accept=".json,.yaml,.yml,.csv,application/json,application/yaml,text/yaml,text/csv"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])]
            // Emptied so that picking the same file again imports it again.
            event.target.value = ''
            void importPicked(files)
          }}
        />
        <Button variant="default" data-import-button="" onClick={() => inputRef.current?.click()}>
          <Upload aria-hidden="true" />
          {t.config.chooseFile}
        </Button>
        <p className="text-[13px] text-muted-foreground" role="status">{dragging ? t.config.dropNow : t.config.dropHere}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => { setResult(null); setNames([]); onLoad(demoConfig(), 'demo', [], null, []) }}>{t.config.loadDemo}</Button>
        <Button onClick={() => { setResult(null); setNames([]); onLoad(emptyConfig(), 'created', [], null, []) }}>{t.config.startEmpty}</Button>
      </div>
      {afterButtons && <div className="mt-3">{afterButtons}</div>}
      <div aria-live="polite" data-import-result="">
        {result && (
          <p className="mt-3 text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
            {fill(t.config.files, { names: names.join(', ') })}{readAs ? ` ${t.config.readAs[readAs]}` : ''}
          </p>
        )}
        {result?.ok === false && (
          <div className="mt-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <CircleX className="size-4 shrink-0 text-status-error" aria-hidden="true" />
              {fill(t.config.failed, { count: result.errors.length })}
            </p>
            <IssueList issues={result.errors} />
          </div>
        )}
        {result?.ok === true && (
          <p className="mt-3 flex items-center gap-2 text-sm font-medium">
            <CircleCheck className="size-4 shrink-0 text-status-good" aria-hidden="true" />
            <span>
              {fill(t.config.loaded, { groups: result.config.groups.length, selectors: result.config.selectors.length })}{' '}
              <button type="button" className="cursor-pointer rounded text-primary underline" onClick={onSeeAllocation}>{t.config.seeAllocation}</button>
            </span>
          </p>
        )}
        {result && result.warnings.length > 0 && (
          <div className="mt-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <TriangleAlert className="size-4 shrink-0 text-status-warning" aria-hidden="true" />
              {fill(t.config.warnings, { count: result.warnings.length })}
            </p>
            <IssueList issues={result.warnings} />
          </div>
        )}
      </div>
      <ExplainRow topics={['conceptManager', 'conceptYaml']} />
    </Card>
  )
}
