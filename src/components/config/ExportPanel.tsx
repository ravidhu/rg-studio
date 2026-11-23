import { CircleCheck, Download } from 'lucide-react'
import { useId, useState } from 'react'
import { SeverityIcon } from '@/components/config/GroupEditor'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { ExplainButton } from '@/components/ExplainButton'
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input'
import { useI18n } from '@/hooks/useI18n'
import type { ManagerMode, RgConfig } from '@/types/model'
import { switchManager } from '@/utils/configReducer'
import { exportFileYaml, exportJson, exportLoaderYaml, exportSql, externalSelectors } from '@/utils/exportConfig'

/** Saves text as a file from memory, without any network request. */
function downloadText(fileName: string, text: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

interface ExportPanelProps {
  config: RgConfig
  errorCount: number
  warningCount: number
  onOpenChecks: () => void
}

export function ExportPanel({ config: source, errorCount, warningCount, onOpenChecks }: ExportPanelProps) {
  const { t, fill } = useI18n()
  const id = useId()
  const [format, setFormat] = useState<'json' | 'sql' | 'yaml' | null>(null)
  const [environment, setEnvironment] = useState(() => source.groups.find((group) => group.environment !== '')?.environment ?? 'production')
  const [copied, setCopied] = useState(false)
  // The target only chooses the output: it starts as the manager of the configuration and never changes it.
  const [chosenTarget, setChosenTarget] = useState<ManagerMode | null>(null)
  const target = chosenTarget ?? source.mode
  // For the other manager the selectors are converted in the exported output only: priorities
  // generated from the list order, or the list sorted by priority. The routing stays the same.
  const { config, note: conversion } = switchManager(source, target)
  const loaderYaml = target === 'db'
  const text =
    format === 'json'
      ? exportJson(config)
      : format === 'sql'
        ? exportSql(config, environment)
        : format === 'yaml'
          ? loaderYaml ? exportLoaderYaml(config, environment) : exportFileYaml(config)
          : ''
  // Selectors on a group defined outside the file: what each format does with them is said before the export.
  const external = externalSelectors(config)
  const needsEnvironment = format === 'sql' || (format === 'yaml' && loaderYaml)
  const formatLabel = format === 'json' ? t.exportPanel.json : format === 'sql' ? t.exportPanel.sql : loaderYaml ? t.exportPanel.yamlLoader : t.exportPanel.yamlFile

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Card>
      <CardTitle>{t.exportPanel.title}</CardTitle>
      <CardDescription>{t.exportPanel.lead}</CardDescription>
      {/* Target of the export: it sets the formats offered below, and nothing else. */}
      <div className="mt-3 rounded-md border bg-background px-3 py-2.5" data-export-for="">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="flex items-center gap-1">
            <Label htmlFor="manager-mode">{t.exportPanel.exportFor}</Label>
            <ExplainButton topic="conceptManager" compact />
          </span>
          <NativeSelect id="manager-mode" className="h-8 w-auto max-w-full" value={target} onChange={(event) => { setFormat(null); setChosenTarget(event.target.value === 'db' ? 'db' : 'file') }}>
            <option value="file">{t.exportPanel.forFile}</option>
            <option value="db">{t.exportPanel.forDb}</option>
          </NativeSelect>
        </div>
        <p className="mt-1.5 text-[13px] text-muted-foreground">{t.exportPanel.forEffect}</p>
        {conversion !== null && <p className="mt-1.5 text-[13px] font-medium" role="status" data-export-note="">{t.exportPanel.exportNote[conversion]}</p>}
      </div>
      {/* Checks in one line, so the configuration is reviewed before it is exported. */}
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {errorCount + warningCount === 0 ? (
          <>
            <CircleCheck className="size-4 shrink-0 text-status-good" aria-hidden="true" />
            {t.exportPanel.summaryNone}
          </>
        ) : (
          <>
            <SeverityIcon severity={errorCount > 0 ? 'error' : 'warning'} />
            {fill(t.exportPanel.summaryIssues, { errors: errorCount, warnings: warningCount })}
            <button type="button" className="cursor-pointer rounded text-primary underline" onClick={onOpenChecks}>{t.exportPanel.summaryLink}</button>
          </>
        )}
      </p>
      {/* A file cannot name an external group: said before a file export. The database formats keep these selectors. */}
      {external.length > 0 && loaderYaml && <p className="mt-3 text-[13px] text-muted-foreground" data-testid="export-external-db">{t.exportPanel.externalSql}</p>}
      {external.length > 0 && !loaderYaml && (
        <div className="mt-3 rounded-md border border-status-warning bg-background p-2.5 text-sm" data-testid="export-external">
          <p className="flex items-start gap-2">
            <SeverityIcon severity="warning" className="mt-0.5" />
            <span>{t.exportPanel.externalLeftOut}</span>
          </p>
          <ul className="m-0 mt-1.5 list-disc pl-9 text-[13px]">
            {external.map((selector) => (
              <li key={selector.position} className="[overflow-wrap:anywhere]">{fill(t.exportPanel.externalItem, { position: selector.position, target: selector.target })}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {/* The formats offered are those of the manager chosen above. */}
        {!loaderYaml && <Button variant={format === 'json' ? 'default' : 'outline'} onClick={() => { setFormat('json'); setCopied(false) }}>{t.exportPanel.json}</Button>}
        {loaderYaml && <Button variant={format === 'sql' ? 'default' : 'outline'} onClick={() => { setFormat('sql'); setCopied(false) }}>{t.exportPanel.sql}</Button>}
        <Button variant={format === 'yaml' ? 'default' : 'outline'} onClick={() => { setFormat('yaml'); setCopied(false) }}>{loaderYaml ? t.exportPanel.yamlLoader : t.exportPanel.yamlFile}</Button>
      </div>
      {format !== null && (
        <div className="mt-3">
          {needsEnvironment && (
            <div className="mb-2 max-w-64">
              <Label htmlFor={`${id}-env`}>{t.exportPanel.environment}</Label>
              <Input id={`${id}-env`} value={environment} onChange={(event) => setEnvironment(event.target.value)} />
            </div>
          )}
          <Textarea readOnly value={text} className="min-h-56" aria-label={formatLabel} />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void copy()}>{copied ? t.common.copied : t.common.copy}</Button>
            <Button
              size="sm"
              onClick={() =>
                format === 'json'
                  ? downloadText('resource-groups.json', text, 'application/json')
                  : format === 'yaml'
                    ? downloadText('resource-groups.yaml', text, 'text/plain')
                    : downloadText('resource-groups.sql', text, 'text/plain')
              }
            >
              <Download aria-hidden="true" />
              {t.common.download}
            </Button>
          </div>
          {format === 'sql' && <p className="mt-2 text-[13px] text-muted-foreground">{t.exportPanel.sqlNote}</p>}
        </div>
      )}
    </Card>
  )
}
