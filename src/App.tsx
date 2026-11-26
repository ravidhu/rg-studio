import { Menu, TriangleAlert, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { AuthorCredit } from '@/components/AuthorCredit'
import { DeleteConfigDialog } from '@/components/DeleteConfigDialog'
import { ExampleBadge } from '@/components/ExampleBadge'
import type { PeriodField } from '@/components/ChecksView'
import { ConfigureView } from '@/components/config/ConfigureView'
import { DashboardView } from '@/components/dashboard/DashboardView'
import { GlossaryView } from '@/components/GlossaryView'
import { SelectorTester, type TesterInputs } from '@/components/SelectorTester'
import { Sidebar } from '@/components/shell/Sidebar'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { WelcomeModal } from '@/components/WelcomeModal'
import { useDrawer } from '@/hooks/useDrawer'
import { useI18n } from '@/hooks/useI18n'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useAllocation } from '@/hooks/useAllocation'
import { HelpExamplesContext, HelpValuesContext, type HelpExamples } from '@/hooks/useHelpExamples'
import { useTheme } from '@/hooks/useTheme'
import type { ClusterSizing, ImportIssue } from '@/types/model'
import { runChecks } from '@/utils/checks'
import { configReducer, switchManager, type ConfigAction, type ManagerSwitchNote } from '@/utils/configReducer'
import { DEMO_SOURCE, nextSource, type ConfigSource } from '@/utils/configSource'
import { demoConfig } from '@/utils/demo'
import { loadStored, removeStored, saveStored, type StoredConfig } from '@/utils/configStore'
import { loadSizing, saveSizing } from '@/utils/sizingStore'
import type { ReadAs } from '@/utils/importFiles'
import { canonicalHash, cleanSearch, glossaryHash, parseHash, type ConfigSection, type ConfigTab, type PageName } from '@/utils/pages'
import type { GlossaryTab } from '@/utils/search'
import type { TopicCategory } from '@/utils/topics'
import { clusterTotals, cpuLimitToVcpus } from '@/utils/sizing'
import { buildTree } from '@/utils/tree'
import { browserStorage, isWelcomeDismissed, saveWelcomeChoice, shouldShowWelcome } from '@/utils/welcome'

/** Query of the selector tester when the page opens. */
const DEFAULT_TESTER_INPUTS: TesterInputs = {
  user: 'alice', groups: '', source: '', tags: '', queryType: 'SELECT', originalUser: '', authenticatedUser: '', queryText: '',
}

export function App() {
  const { t, fill, num } = useI18n()
  const { theme, setTheme } = useTheme()
  // A configuration saved in this browser comes back on load. Anything unreadable was already removed.
  const [boot] = useState(() => loadStored(browserStorage()))
  const [config, rawDispatch] = useReducer(configReducer, boot, (start) => (start.state === 'restored' ? start.stored.config : demoConfig()))
  const [source, setSource] = useState<ConfigSource>(() =>
    boot.state === 'restored' ? { origin: boot.stored.source.origin, edited: boot.stored.source.edited } : DEMO_SOURCE)
  // What the import was read as and from which files: saved with the configuration, never the file content.
  const [importInfo, setImportInfo] = useState<{ readAs: ReadAs | null; files: string[] }>(() =>
    boot.state === 'restored' ? { readAs: boot.stored.source.readAs, files: boot.stored.source.files } : { readAs: null, files: [] })
  // A configuration started from scratch has no manager until the reader says where it will be used.
  const [managerChosen, setManagerChosen] = useState(boot.state === 'restored' ? boot.stored.source.managerChosen : true)
  const [storeNotice, setStoreNotice] = useState<'restored' | 'discarded' | 'deleted' | null>(boot.state === 'none' ? null : boot.state)
  // `stored`: the key holds the configuration. `saveFailed`: the browser refused the last save.
  const [stored, setStored] = useState(boot.state === 'restored')
  const [saveFailed, setSaveFailed] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const deleteOpener = useRef<HTMLElement | null>(null)
  // Every change made in the editors marks the configuration as edited.
  const dispatch = useCallback((action: ConfigAction) => {
    rawDispatch(action)
    setSource((current) => nextSource(current, action.type === 'load' ? { type: 'load', origin: current.origin } : { type: 'edit' }))
  }, [])
  // The cluster size is a preference of this browser: restored on load, saved when it changes, kept when the configuration is deleted.
  const [sizing, setSizing] = useState<ClusterSizing>(() => loadSizing(browserStorage()))
  useEffect(() => {
    saveSizing(browserStorage(), sizing)
  }, [sizing])
  const [page, setPageState] = useState<PageName>(() => parseHash(window.location.hash).page)
  const [configTab, setConfigTab] = useState<ConfigTab>(() => parseHash(window.location.hash).configTab)
  const [glossaryTab, setGlossaryTab] = useState<GlossaryTab>(() => parseHash(window.location.hash).glossaryTab)
  // Selected category chip of each glossary tab: kept in memory and in the address only.
  const [glossaryCategories, setGlossaryCategories] = useState<Partial<Record<GlossaryTab, TopicCategory | null>>>(() => {
    const parsed = parseHash(window.location.hash)
    return { [parsed.glossaryTab]: parsed.glossaryCategory }
  })
  // Text of the glossary search box (`typed`) and the value it settles to after a pause (`query`):
  // kept in memory only, and carried by the address as its cleaned text.
  const [glossarySearch, setGlossarySearch] = useState<{ typed: string; query: string }>(() => {
    const search = parseHash(window.location.hash).glossarySearch
    return { typed: search, query: search }
  })
  const typeGlossary = useCallback((next: string): void => {
    setGlossarySearch((current) => (current.typed === next ? current : { ...current, typed: next }))
  }, [])
  const settleGlossary = useCallback((next: string): void => {
    setGlossarySearch((current) => (current.query === next ? current : { ...current, query: next }))
  }, [])
  const [cameFromChecks, setCameFromChecks] = useState(false)
  const [managerNote, setManagerNote] = useState<ManagerSwitchNote>(null)
  const [focusPeriod, setFocusPeriod] = useState<{ field: PeriodField; request: number } | null>(null)
  const [scrollTo, setScrollTo] = useState<{ section: ConfigSection; request: number; focus?: boolean } | null>(() => {
    const section = parseHash(window.location.hash).configSection
    return section === null ? null : { section, request: 0 }
  })
  const [highlightedSelectorId, setHighlightedSelectorId] = useState<string | null>(null)
  const [testerInputs, setTesterInputs] = useState<TesterInputs>(DEFAULT_TESTER_INPUTS)
  const [importNotice, setImportNotice] = useState<{ groups: number; selectors: number; remarks: ImportIssue[]; readAs: ReadAs | null } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Remounts the views that keep local state when another configuration is loaded.
  const [generation, setGeneration] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const desktop = useMediaQuery('(min-width: 1024px)')
  const sidebarRef = useRef<HTMLElement | null>(null)
  const burgerRef = useRef<HTMLButtonElement | null>(null)
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])
  // Welcome dialog: opens by itself until the viewer asks not to see it again, and not over a
  // configuration restored from this browser. The sidebar button opens it in every case.
  const mainRef = useRef<HTMLElement | null>(null)
  const welcomeOpener = useRef<HTMLElement | null>(null)
  const [welcomeOpen, setWelcomeOpen] = useState(() => shouldShowWelcome(browserStorage(), boot.state === 'restored'))
  const [welcomeFromButton, setWelcomeFromButton] = useState(false)
  useDrawer(drawerOpen && !desktop && !welcomeOpen, sidebarRef, burgerRef, closeDrawer)

  const tree = useMemo(() => buildTree(config.groups), [config.groups])
  const findings = useMemo(() => runChecks(config, sizing), [config, sizing])
  const allocation = useAllocation(tree)
  const errorCount = findings.filter((finding) => finding.severity === 'error').length
  const warningCount = findings.filter((finding) => finding.severity === 'warning').length

  const examples = useMemo<HelpExamples>(() => {
    const totals = clusterTotals(sizing)
    const out: HelpExamples = {
      conceptSizing: fill(t.sizing.formula, {
        workers: num(sizing.workers),
        ram: num(sizing.ramPerWorkerGb, 1),
        heap: num(sizing.heapPercent, 1),
        headroom: num(sizing.headroomPercent, 1),
        total: num(totals.queryMemoryGb, 1),
      }),
    }
    const period = config.global.cpuQuotaPeriod.trim()
    const limited = config.groups.find((group) => cpuLimitToVcpus(group.hardCpuLimit, period) !== null)
    if (limited) {
      out.cpuQuotaPeriod = fill(t.editor.cpuExample, {
        group: limited.name,
        limit: limited.hardCpuLimit.trim(),
        period,
        vcpus: num(cpuLimitToVcpus(limited.hardCpuLimit, period) ?? 0, 1),
      })
    }
    return out
  }, [config, sizing, t, fill, num])

  const helpValues = useMemo(() => ({ queryMemory: num(clusterTotals(sizing).queryMemoryGb, 1) }), [sizing, num])

  // The address is the single source of the page, the tab, the glossary category and the glossary
  // search: every navigation writes an address first, then the state is read back from it, exactly
  // as when the reader edits the address or uses Back and Forward.
  const applyAddress = useCallback((hash: string): void => {
    const parsed = parseHash(hash)
    setPageState(parsed.page)
    if (parsed.page === 'configure') {
      setConfigTab(parsed.configTab)
      const section = parsed.configSection
      if (section !== null) setScrollTo((current) => ({ section, request: (current?.request ?? 0) + 1 }))
    }
    if (parsed.page === 'glossary') {
      setGlossaryTab(parsed.glossaryTab)
      setGlossaryCategories((current) => ({ ...current, [parsed.glossaryTab]: parsed.glossaryCategory }))
      // Navigation carries the text of the box, so an address that matches it keeps the box and settles
      // the pending query. A box whose text the address cannot carry (too long, rejected characters) keeps
      // its text when the address has no search; any other address, as with Back, Forward or a hand edit,
      // drives the box.
      setGlossarySearch((current) =>
        cleanSearch(current.typed) === parsed.glossarySearch
          ? current.query === current.typed
            ? current
            : { ...current, query: current.typed }
          : { typed: parsed.glossarySearch, query: parsed.glossarySearch },
      )
    }
  }, [])

  /**
   * Goes to an address of the application. Only page, tab and category names are ever written, plus
   * the glossary search text, the one free text, cleaned by `cleanSearch`. Never the configuration.
   */
  const go = useCallback((address: string, mode: 'push' | 'replace' = 'push'): void => {
    if (address !== window.location.hash) {
      if (mode === 'push') window.history.pushState(null, '', address)
      else window.history.replaceState(null, '', address)
    }
    applyAddress(address)
  }, [applyAddress])

  const setPage = (next: PageName, tab: ConfigTab = configTab): void => {
    go(next === 'configure' ? `#configure/${tab}` : next === 'glossary' ? glossaryHash(glossaryTab, glossaryCategories[glossaryTab] ?? null, glossarySearch.typed) : `#${next}`)
    setDrawerOpen(false)
    window.scrollTo(0, 0)
  }

  /** Opens the groups tab on the question about the manager, for a configuration started from scratch. */
  const chooseManager = (): void => {
    setCameFromChecks(false)
    setPage('configure', 'groups')
    window.setTimeout(() => {
      const control = [...document.querySelectorAll<HTMLElement>('[data-testid="source-manager"]')].find((element) => element.getClientRects().length > 0)
      control?.focus()
    }, 80)
  }

  // An address typed by the reader, or reached with Back and Forward, is rewritten to its
  // current name when it uses a name of an earlier version, then shown.
  useEffect(() => {
    const sync = (): void => {
      const hash = window.location.hash
      if (hash !== '') {
        const canonical = canonicalHash(parseHash(hash))
        if (canonical !== hash) window.history.replaceState(null, '', canonical)
      }
      setCameFromChecks(false)
      setDrawerOpen(false)
      applyAddress(hash)
    }
    // The first address needs the rewrite only: the state was already read from it.
    if (window.location.hash !== '') {
      const canonical = canonicalHash(parseHash(window.location.hash))
      if (canonical !== window.location.hash) window.history.replaceState(null, '', canonical)
    }
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [applyAddress])

  // While the glossary shows, its address follows the settled search, the tab and the category.
  // replaceState fires neither hashchange nor popstate, so this cannot loop, and typing adds no
  // history entry. On the first load the address is already canonical, so nothing is rewritten twice.
  const glossaryQuery = glossarySearch.query
  const glossaryCategory = glossaryCategories[glossaryTab] ?? null
  useEffect(() => {
    if (page !== 'glossary') return
    const address = glossaryHash(glossaryTab, glossaryCategory, glossaryQuery)
    if (address !== window.location.hash) window.history.replaceState(null, '', address)
  }, [page, glossaryTab, glossaryCategory, glossaryQuery])

  /** Saves the configuration in this browser, or says that it could not be saved. */
  const save = useCallback((next: StoredConfig): void => {
    const done = saveStored(browserStorage(), next)
    setStored(done)
    setSaveFailed(!done)
  }, [])

  // Edits are saved after a short pause. The example is never stored: only what was imported or started from scratch.
  const storedOrigin = source.origin === 'demo' ? null : source.origin
  useEffect(() => {
    if (storedOrigin === null) return
    const timer = window.setTimeout(() => save({ config, source: { origin: storedOrigin, edited: source.edited, ...importInfo, managerChosen } }), 500)
    return () => window.clearTimeout(timer)
  }, [config, storedOrigin, source.edited, importInfo, managerChosen, save])

  // A saved configuration survives a reload, so leaving needs no confirmation. The browser still
  // asks before leaving in the two cases where work would be lost: the example was edited (it is
  // never stored), or the browser refused to save.
  const unsaved = source.origin === 'demo' ? source.edited : saveFailed
  useEffect(() => {
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      // Older browsers only show the confirmation when this legacy field is set.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  // The browser tab names the page first, so several tabs can be told apart.
  useEffect(() => {
    document.title = `${t.tabs[page]} | ${t.app.title}`
  }, [page, t])

  return (
    <TooltipProvider>
      <HelpExamplesContext.Provider value={examples}>
      <HelpValuesContext.Provider value={helpValues}>
      <div className="lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        <Sidebar
          ref={sidebarRef}
          page={page}
          onNavigate={setPage}
          sizing={sizing}
          onSizingChange={setSizing}
          errorCount={errorCount}
          warningCount={warningCount}
          theme={theme}
          onThemeChange={setTheme}
          open={drawerOpen}
          desktop={desktop}
          onClose={closeDrawer}
          canDelete={stored}
          onDelete={(button) => {
            deleteOpener.current = desktop ? button : burgerRef.current
            setDrawerOpen(false)
            setConfirmDelete(true)
          }}
          onOpenWelcome={(button) => {
            // In the drawer the button disappears with it: focus then comes back to the burger button.
            welcomeOpener.current = desktop ? button : burgerRef.current
            setWelcomeFromButton(true)
            setDrawerOpen(false)
            setWelcomeOpen(true)
          }}
        />
        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-card px-3 py-2 lg:hidden">
            <Button
              ref={burgerRef}
              size="icon"
              aria-label={t.shell.openMenu}
              aria-expanded={drawerOpen}
              aria-controls="app-sidebar"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu aria-hidden="true" />
            </Button>
            <div className="min-w-0">
              <div className="truncate text-xs text-muted-foreground">{t.app.title}</div>
              <div className="truncate text-[15px] font-semibold leading-tight">{t.tabs[page]}</div>
            </div>
          </header>
          <div className="mx-auto max-w-[1500px] px-4 pb-8 pt-4">
            {source.origin === 'demo' && (
              <div>
                <ExampleBadge
                  edited={source.edited}
                  onOpenImport={() => {
                    setCameFromChecks(false)
                    setPage('configure', 'import-export')
                    setScrollTo((current) => ({ section: 'import', request: (current?.request ?? 0) + 1, focus: true }))
                  }}
                />
              </div>
            )}
            {(storeNotice !== null || saveFailed) && (
              <div className="mb-3 flex flex-col gap-1.5" data-testid="storage-notices">
                {saveFailed && (
                  <p className="flex items-start gap-2 rounded-md border border-status-warning bg-card px-3 py-2 text-sm" role="alert" data-notice="saveFailed">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
                    {t.storage.saveFailed}
                  </p>
                )}
                {storeNotice !== null && (
                  <p className="flex items-start gap-2 rounded-md border bg-card px-3 py-2 text-sm" role="status" data-notice={storeNotice}>
                    <span className="min-w-0 flex-1">{t.storage[storeNotice]}</span>
                    <button type="button" className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted" aria-label={t.common.dismiss} title={t.common.dismiss} onClick={() => setStoreNotice(null)}>
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </p>
                )}
              </div>
            )}
            <h1 className="mb-3 hidden text-2xl font-semibold leading-tight lg:block">{t.tabs[page]}</h1>
            <main ref={mainRef} tabIndex={-1} className="min-w-0 outline-none">
                {page === 'group-allocation' && (
                  <DashboardView
                    key={generation}
                    config={config}
                    tree={tree}
                    sizing={sizing}
                    allocation={allocation}
                    errorCount={errorCount}
                    warningCount={warningCount}
                    onOpenChecks={() => {
                      setCameFromChecks(false)
                      setPage('configure', 'checks')
                    }}
                  />
                )}
                {page === 'configure' && (
                  <ConfigureView
                    config={config}
                    tree={tree}
                    findings={findings}
                    tab={configTab}
                    onTabChange={(next) => {
                      // The way back to the checks is only offered right after arriving from a finding.
                      setCameFromChecks(false)
                      go(`#configure/${next}`)
                    }}
                    scrollTo={scrollTo}
                    cameFromChecks={cameFromChecks}
                    focusPeriod={focusPeriod}
                    sourceChoice={source.origin === 'created' ? { chosen: managerChosen, note: managerNote } : null}
                    onChooseManager={chooseManager}
                    onManagerChange={(mode) => {
                      // Selectors already there are converted so that the routing stays the same. The first
                      // answer converts nothing to speak of: the note is for a change of an earlier choice.
                      setManagerNote(managerChosen ? switchManager(config, mode).note : null)
                      setManagerChosen(true)
                      dispatch({ type: 'setMode', mode })
                    }}
                    onEditFinding={(target) => {
                      // A finding on a selector opens the selectors tab, one on a quota period the
                      // global settings of the groups tab, any other one its group.
                      const field = target.field
                      const next = target.selectorId !== null && field === null ? 'selectors' : 'groups'
                      setHighlightedSelectorId(field === null ? target.selectorId : null)
                      if (target.selectorId === null && field === null) setSelectedId(target.groupId)
                      if (field !== null) setFocusPeriod((current) => ({ field, request: (current?.request ?? 0) + 1 }))
                      go(`#configure/${next}`)
                      setCameFromChecks(true)
                      window.scrollTo(0, 0)
                    }}
                    selectedGroupId={selectedId}
                    onSelectGroup={setSelectedId}
                    highlightedSelectorId={highlightedSelectorId}
                    generation={generation}
                    dispatch={dispatch}
                    onSeeAllocation={() => setPage('group-allocation')}
                    importNotice={importNotice}
                    onDismissNotice={() => setImportNotice(null)}
                    onLoad={(loaded, origin, remarks, readAs, files) => {
                      setStoreNotice(null)
                      setImportInfo({ readAs, files })
                      if (origin === 'demo') {
                        // The example replaces what was stored, and is not stored itself.
                        removeStored(browserStorage())
                        setStored(false)
                        setSaveFailed(false)
                      } else {
                        // Saved at once, so that an import followed by a reload is not lost.
                        save({ config: loaded, source: { origin, edited: false, readAs, files, managerChosen: origin !== 'created' } })
                      }
                      setManagerChosen(origin !== 'created')
                      setImportNotice(origin === 'imported' ? { groups: loaded.groups.length, selectors: loaded.selectors.length, remarks, readAs } : null)
                      rawDispatch({ type: 'load', config: loaded })
                      setSource(nextSource(source, { type: 'load', origin }))
                      setManagerNote(null)
                      setFocusPeriod(null)
                      setSelectedId(null)
                      setHighlightedSelectorId(null)
                      setGeneration((current) => current + 1)
                      go('#configure/groups')
                    }}
                  />
                )}
                {page === 'selector-tester' && (
                  <SelectorTester
                    config={config}
                    tree={tree}
                    inputs={testerInputs}
                    onInputsChange={setTesterInputs}
                    origin={source.origin === 'imported' ? importInfo.readAs ?? 'imported' : source.origin}
                    needsManager={source.origin === 'created' && !managerChosen}
                    onChooseManager={chooseManager}
                  />
                )}
                {page === 'glossary' && (
                  <GlossaryView
                    config={config}
                    tree={tree}
                    sizing={sizing}
                    tab={glossaryTab}
                    category={glossaryCategories[glossaryTab] ?? null}
                    typed={glossarySearch.typed}
                    query={glossarySearch.query}
                    onType={typeGlossary}
                    onSettle={settleGlossary}
                    onTabChange={(next) => go(glossaryHash(next, glossaryCategories[next] ?? null, glossarySearch.typed))}
                    onCategoryChange={(next) => go(glossaryHash(glossaryTab, next, glossarySearch.query), 'replace')}
                  />
                )}
            </main>
            <footer className="mt-8 text-center"><AuthorCredit /></footer>
          </div>
        </div>
      </div>
      {confirmDelete && (
        <DeleteConfigDialog
          opener={deleteOpener}
          onCancel={() => setConfirmDelete(false)}
          onExport={() => {
            setConfirmDelete(false)
            setCameFromChecks(false)
            setPage('configure', 'import-export')
            setScrollTo((current) => ({ section: 'export', request: (current?.request ?? 0) + 1 }))
          }}
          onConfirm={() => {
            // The key is removed first, then the page goes back to the example, as on a first visit.
            removeStored(browserStorage())
            setStored(false)
            setSaveFailed(false)
            setConfirmDelete(false)
            rawDispatch({ type: 'load', config: demoConfig() })
            setSource(DEMO_SOURCE)
            setImportInfo({ readAs: null, files: [] })
            setManagerChosen(true)
            setImportNotice(null)
            setManagerNote(null)
            setFocusPeriod(null)
            setSelectedId(null)
            setHighlightedSelectorId(null)
            setGeneration((current) => current + 1)
            setStoreNotice('deleted')
            // The button that opened the dialog is gone with the stored configuration.
            window.setTimeout(() => mainRef.current?.focus(), 0)
          }}
        />
      )}
      {welcomeOpen && (
        <WelcomeModal
          dismissed={isWelcomeDismissed(browserStorage())}
          // On a first visit nothing opened the dialog: focus goes to the main content.
          opener={welcomeFromButton ? welcomeOpener : mainRef}
          onClose={(remember) => {
            if (remember !== null) saveWelcomeChoice(browserStorage(), remember)
            setWelcomeOpen(false)
          }}
          onImport={(remember) => {
            saveWelcomeChoice(browserStorage(), remember)
            setWelcomeOpen(false)
            setCameFromChecks(false)
            setPage('configure', 'import-export')
            // The dialog hands the focus back to where it came from: the import button then takes it.
            setScrollTo((current) => ({ section: 'import', request: (current?.request ?? 0) + 1, focus: true }))
          }}
        />
      )}
      </HelpValuesContext.Provider>
      </HelpExamplesContext.Provider>
    </TooltipProvider>
  )
}
