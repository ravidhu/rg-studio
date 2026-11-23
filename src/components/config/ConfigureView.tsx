import { ArrowLeft, CircleCheck, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef, type Dispatch } from 'react'
import { ChecksView, type EditTarget, type PeriodField } from '@/components/ChecksView'
import { ExportPanel } from '@/components/config/ExportPanel'
import { GroupEditor, SeverityIcon } from '@/components/config/GroupEditor'
import { ImportPanel, IssueList } from '@/components/config/ImportPanel'
import { SelectorEditor } from '@/components/config/SelectorEditor'
import { SourceManagerChoice } from '@/components/config/SourceManagerChoice'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/hooks/useI18n'
import type { ImportIssue, ManagerMode, RgConfig, Severity } from '@/types/model'
import type { Finding } from '@/utils/checks'
import type { ConfigAction, ManagerSwitchNote } from '@/utils/configReducer'
import type { ConfigOrigin } from '@/utils/configSource'
import type { ReadAs } from '@/utils/importFiles'
import { CONFIG_TABS, type ConfigSection, type ConfigTab } from '@/utils/pages'
import type { GroupTree } from '@/utils/tree'

interface ConfigureViewProps {
  config: RgConfig
  tree: GroupTree
  findings: Finding[]
  tab: ConfigTab
  onTabChange: (tab: ConfigTab) => void
  /** Section of the import and export tab to bring into view, with a counter so the same request can repeat. */
  scrollTo: { section: ConfigSection; request: number; focus?: boolean } | null
  selectedGroupId: string | null
  onSelectGroup: (id: string | null) => void
  highlightedSelectorId: string | null
  /** The editor was opened from a finding: a link leads back to the checks. */
  cameFromChecks: boolean
  /** Opens the editor on what a finding is about: a selector first, else a group. */
  onEditFinding: (target: EditTarget) => void
  focusPeriod: { field: PeriodField; request: number } | null
  /** Question asked for a configuration started from scratch, `null` for an import and for the example. */
  sourceChoice: { chosen: boolean; note: ManagerSwitchNote } | null
  onManagerChange: (mode: ManagerMode) => void
  /** The manager is still to be chosen: the checks say so and lead to the question. */
  onChooseManager: () => void
  /** Changes when another configuration is loaded, to reset the panels that keep drafts of the previous one. */
  generation: number
  dispatch: Dispatch<ConfigAction>
  onLoad: (config: RgConfig, origin: ConfigOrigin, remarks: ImportIssue[], readAs: ReadAs | null, files: string[]) => void
  /** Result of the last import, shown above the groups until it is dismissed. */
  importNotice: { groups: number; selectors: number; remarks: ImportIssue[]; readAs: ReadAs | null } | null
  onDismissNotice: () => void
  /** Opens the group allocation page, offered as the next step after an import. */
  onSeeAllocation: () => void
}

function worst(findings: readonly Finding[]): Severity | null {
  if (findings.some((finding) => finding.severity === 'error')) return 'error'
  if (findings.some((finding) => finding.severity === 'warning')) return 'warning'
  return null
}

/**
 * Configuration page, one tab per task: import and export, groups, selectors
 * and checks. Every panel stays in the page while its tab is hidden, so
 * switching tabs never loses what was typed.
 */
export function ConfigureView({
  config, tree, findings, tab, onTabChange, scrollTo, selectedGroupId, onSelectGroup, highlightedSelectorId,
  cameFromChecks, onEditFinding, focusPeriod, sourceChoice, onManagerChange, onChooseManager, generation, dispatch, onLoad, importNotice, onDismissNotice, onSeeAllocation,
}: ConfigureViewProps) {
  const { t, fill } = useI18n()
  const importRef = useRef<HTMLDivElement | null>(null)
  const exportRef = useRef<HTMLDivElement | null>(null)
  const focusServed = useRef<number | null>(null)
  const errorCount = findings.filter((finding) => finding.severity === 'error').length
  const warningCount = findings.filter((finding) => finding.severity === 'warning').length

  useEffect(() => {
    if (scrollTo === null || tab !== 'import-export') return
    const target = scrollTo.section === 'export' ? exportRef.current : importRef.current
    target?.scrollIntoView({ block: 'start' })
    // The focus is given once per request: coming back to this tab later must not take it again.
    if (!scrollTo.focus || focusServed.current === scrollTo.request) return
    focusServed.current = scrollTo.request
    // After the welcome dialog has given the focus back, the import button takes it. The file
    // picker is not opened for the reader: browsers only allow that on a click.
    const timer = window.setTimeout(() => target?.querySelector<HTMLElement>('[data-import-button]')?.focus({ preventScroll: true }), 50)
    return () => window.clearTimeout(timer)
  }, [scrollTo, tab])

  // A finding marks the tab where it can be fixed.
  const marks: Partial<Record<ConfigTab, Severity | null>> = {
    groups: worst(findings.filter((finding) => finding.groupId !== null && finding.selectorId === null)),
    selectors: worst(findings.filter((finding) => finding.selectorId !== null || finding.code === 'noSelectors' || finding.code === 'noCatchAll')),
  }
  const counts: Partial<Record<ConfigTab, number>> = { groups: config.groups.length, selectors: config.selectors.length }
  const labels: Record<ConfigTab, string> = {
    'import-export': t.configTabs.importExport,
    groups: t.configTabs.groups,
    selectors: t.configTabs.selectors,
    checks: t.configTabs.checks,
  }
  // One question, shown in the two places where a configuration started from scratch is reached.
  const choice = sourceChoice && <SourceManagerChoice mode={config.mode} chosen={sourceChoice.chosen} note={sourceChoice.note} onChoose={onManagerChange} />
  const backToChecks = cameFromChecks && (
    <button type="button" className="mb-3 inline-flex cursor-pointer items-center gap-1.5 rounded text-sm text-primary underline" onClick={() => onTabChange('checks')}>
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t.configTabs.backToChecks}
    </button>
  )
  return (
    <Tabs value={tab} onValueChange={(next) => onTabChange(CONFIG_TABS.find((name) => name === next) ?? 'import-export')}>
      <TabsList aria-label={t.configTabs.label}>
        {CONFIG_TABS.map((name) => {
          const mark = marks[name]
          return (
            <TabsTrigger key={name} value={name}>
              {labels[name]}
              {counts[name] !== undefined && <span className="rounded-full border px-1.5 text-xs tabular-nums">{counts[name]}</span>}
              {mark && (
                <span className="inline-flex items-center" title={t.checks.severity[mark]}>
                  <SeverityIcon severity={mark} />
                  <span className="sr-only">{t.checks.severity[mark]}</span>
                </span>
              )}
              {name === 'checks' && errorCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-xs" title={t.checks.severity.error}>
                  <SeverityIcon severity="error" /><span className="sr-only">{t.checks.severity.error} </span>{errorCount}
                </span>
              )}
              {name === 'checks' && warningCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-xs" title={t.checks.severity.warning}>
                  <SeverityIcon severity="warning" /><span className="sr-only">{t.checks.severity.warning} </span>{warningCount}
                </span>
              )}
            </TabsTrigger>
          )
        })}
      </TabsList>
      <TabsContent value="import-export" keepMounted>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <div ref={importRef} id="config-import" className="min-w-0 scroll-mt-16">
            <ImportPanel onLoad={onLoad} onSeeAllocation={onSeeAllocation} afterButtons={choice} />
          </div>
          <div ref={exportRef} id="config-export" className="min-w-0 scroll-mt-16">
            <ExportPanel
              key={`export-${generation}`}
              config={config}
              errorCount={errorCount}
              warningCount={warningCount}
              onOpenChecks={() => onTabChange('checks')}
            />
          </div>
        </div>
      </TabsContent>
      <TabsContent value="groups" keepMounted>
        {/* An import opens this tab: its result and its remarks follow, so they are not left behind on the import tab. */}
        {importNotice && (
          <div className="mb-3 rounded-lg border bg-card px-3 py-2.5" role="status" data-testid="import-notice">
            <div className="flex items-start gap-2">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-good" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-sm font-medium">
                {importNotice.readAs ? `${t.config.readAs[importNotice.readAs]} ` : ''}{fill(t.config.loaded, { groups: importNotice.groups, selectors: importNotice.selectors })} {t.app.savedShort}{' '}
                <button type="button" className="cursor-pointer rounded font-normal text-primary underline" onClick={onSeeAllocation}>{t.config.seeAllocation}</button>
              </p>
              <button
                type="button"
                className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                aria-label={t.common.dismiss}
                title={t.common.dismiss}
                onClick={onDismissNotice}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            {importNotice.remarks.length > 0 && (
              <div className="mt-2">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <TriangleAlert className="size-4 shrink-0 text-status-warning" aria-hidden="true" />
                  {fill(t.config.warnings, { count: importNotice.remarks.length })}
                </p>
                <IssueList issues={importNotice.remarks} />
              </div>
            )}
          </div>
        )}
        {backToChecks}
        {choice && <div className="mb-3">{choice}</div>}
        <GroupEditor config={config} tree={tree} findings={findings} selectedId={selectedGroupId} focusPeriod={focusPeriod} onSelect={onSelectGroup} dispatch={dispatch} />
      </TabsContent>
      <TabsContent value="selectors" keepMounted>
        {backToChecks}
        <SelectorEditor key={`selectors-${generation}`} config={config} tree={tree} dispatch={dispatch} highlightedId={highlightedSelectorId} />
      </TabsContent>
      <TabsContent value="checks" keepMounted>
        <ChecksView needsManager={sourceChoice !== null && !sourceChoice.chosen} onChooseManager={onChooseManager} findings={findings} onEdit={onEditFinding} onClearPeriod={(field) => dispatch({ type: 'updateGlobal', patch: { [field]: '' } })} />
      </TabsContent>
    </Tabs>
  )
}
