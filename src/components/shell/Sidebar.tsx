import { CircleHelp, CloudOff, Trash2, X } from 'lucide-react'
import type { RefObject } from 'react'
import { SeverityIcon } from '@/components/config/GroupEditor'
import { SizingInputs } from '@/components/SizingPanel'
import { AuthorCredit } from '@/components/AuthorCredit'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/input'
import { useI18n, type Lang } from '@/hooks/useI18n'
import type { ThemeChoice } from '@/hooks/useTheme'
import type { ClusterSizing } from '@/types/model'
import { cn } from '@/utils/cn'
import { PAGES, type PageName } from '@/utils/pages'

interface SidebarProps {
  ref: RefObject<HTMLElement | null>
  page: PageName
  onNavigate: (page: PageName) => void
  sizing: ClusterSizing
  onSizingChange: (sizing: ClusterSizing) => void
  errorCount: number
  warningCount: number
  theme: ThemeChoice
  onThemeChange: (theme: ThemeChoice) => void
  /** Drawer state, used below the desktop breakpoint only. */
  open: boolean
  desktop: boolean
  onClose: () => void
  /** Reopens the welcome dialog. The button is passed so that focus can come back to it. */
  onOpenWelcome: (button: HTMLButtonElement) => void
  /** A configuration is stored in this browser and can be deleted. */
  canDelete: boolean
  onDelete: (button: HTMLButtonElement) => void
}

/**
 * Navigation, cluster size and preferences. A persistent column from 1024 px,
 * an off-canvas drawer below. It is one element in both cases, so what is
 * typed in the size fields is never lost when the window is resized.
 */
export function Sidebar({ ref, page, onNavigate, sizing, onSizingChange, errorCount, warningCount, theme, onThemeChange, open, desktop, onClose, onOpenWelcome, canDelete, onDelete }: SidebarProps) {
  const { t, lang, setLang } = useI18n()
  const langs: Lang[] = ['en', 'fr']
  const modal = !desktop && open
  return (
    <>
      {modal && <div className="fixed inset-0 z-40 bg-black/55" onClick={onClose} data-testid="drawer-overlay" />}
      <aside
        ref={ref}
        id="app-sidebar"
        role={desktop ? undefined : 'dialog'}
        aria-modal={modal ? true : undefined}
        aria-label={t.shell.navigation}
        inert={!desktop && !open}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[17.5rem] max-w-[86vw] flex-col border-r bg-sidebar transition-transform duration-200 motion-reduce:transition-none lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:max-w-none lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="h-1 shrink-0 bg-linear-to-r from-brand via-brand-mid to-brand-deep" aria-hidden="true" />
        <div className="flex items-start justify-between gap-2 px-4 pb-2 pt-3">
          <div className="min-w-0">
            <div className="text-[17px] font-semibold leading-tight">{t.app.title}</div>
          </div>
          <Button size="icon" variant="ghost" className="lg:hidden" aria-label={t.shell.closeMenu} onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <nav aria-label={t.shell.navigation}>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {PAGES.map((name) => (
                <li key={name}>
                  <a
                    href={`#${name}`}
                    aria-current={page === name ? 'page' : undefined}
                    onClick={(event) => {
                      event.preventDefault()
                      onNavigate(name)
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-md border-l-[3px] border-transparent px-2.5 py-2 text-sm font-medium text-muted-foreground no-underline hover:bg-muted',
                      page === name && 'border-brand bg-accent text-accent-foreground',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{t.tabs[name]}</span>
                    {name === 'configure' && errorCount > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-xs" title={t.checks.severity.error} data-sidebar-count="error">
                        <SeverityIcon severity="error" /><span className="sr-only">{t.checks.severity.error} </span>{errorCount}
                      </span>
                    )}
                    {name === 'configure' && warningCount > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-xs" title={t.checks.severity.warning} data-sidebar-count="warning">
                        <SeverityIcon severity="warning" /><span className="sr-only">{t.checks.severity.warning} </span>{warningCount}
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <section className="mt-4 border-t pt-3" aria-label={t.sizing.title}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.sizing.title}</h2>
            <SizingInputs sizing={sizing} onChange={onSizingChange} />
          </section>
        </div>
        <div className="shrink-0 border-t px-3 py-3">
          <Button className="mb-2.5 w-full" onClick={(event) => onOpenWelcome(event.currentTarget)}>
            <CircleHelp aria-hidden="true" />
            {t.welcome.open}
          </Button>
          {/* Offered only while a configuration is stored in this browser. Its label wraps instead of being cut when the column is too narrow. */}
          {canDelete && (
            <Button variant="destructive" className="mb-2.5 h-auto min-h-9 w-full whitespace-normal py-1.5 text-left" data-testid="delete-config" onClick={(event) => onDelete(event.currentTarget)}>
              <Trash2 aria-hidden="true" />
              {t.storage.delete}
            </Button>
          )}
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border p-0.5" role="group" aria-label={t.app.language}>
              {langs.map((code) => (
                <button
                  key={code}
                  type="button"
                  lang={code}
                  aria-pressed={lang === code}
                  onClick={() => setLang(code)}
                  className={cn('cursor-pointer rounded px-2.5 py-1 text-sm font-medium uppercase', lang === code ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
                >
                  {code}
                </button>
              ))}
            </div>
            <NativeSelect className="min-w-0 flex-1" aria-label={t.app.theme} value={theme} onChange={(event) => onThemeChange(event.target.value as ThemeChoice)}>
              <option value="system">{t.app.themeSystem}</option>
              <option value="light">{t.app.themeLight}</option>
              <option value="dark">{t.app.themeDark}</option>
            </NativeSelect>
          </div>
          <p className="mt-2.5 flex items-start gap-2 text-xs text-muted-foreground">
            <CloudOff className="mt-0.5 size-3.5 shrink-0 text-status-good" aria-hidden="true" />
            <span>{t.app.privacy} {t.app.savedShort}</span>
          </p>
          <AuthorCredit className="mt-2" />
        </div>
      </aside>
    </>
  )
}
