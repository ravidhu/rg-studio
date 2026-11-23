import { CloudOff, X } from 'lucide-react'
import { useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { useDrawer } from '@/hooks/useDrawer'
import { useI18n, type Lang } from '@/hooks/useI18n'
import { cn } from '@/utils/cn'
import type { PageName } from '@/utils/pages'

/** Small drawings of the four steps, in the colours of the application. */
const ILLUSTRATIONS: Record<PageName, ReactNode> = {
  configure: (
    <>
      <path d="M14 6h20l8 8v28a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" fill="var(--card)" stroke="currentColor" strokeWidth="2" />
      <path d="M34 6v8h8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M18 24h14M18 30h10" stroke="var(--series-1)" strokeWidth="3" strokeLinecap="round" />
      <path d="M44 40V28m-5 5l5-5 5 5" fill="none" stroke="var(--series-1)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  'group-allocation': (
    <>
      <path d="M28 4a24 24 0 0 1 22.6 32L39.3 32A12 12 0 0 0 28 16z" fill="var(--series-1)" />
      <path d="M50.6 36A24 24 0 0 1 9 42.7l9.5-7.3A12 12 0 0 0 39.3 32z" fill="var(--series-2)" />
      <path d="M9 42.7A24 24 0 0 1 28 4v12a12 12 0 0 0-9.5 19.4z" fill="var(--series-3)" />
      <circle cx="28" cy="28" r="8" fill="var(--card)" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  'selector-tester': (
    <>
      <circle cx="10" cy="28" r="6" fill="var(--series-1)" />
      <path d="M18 28h10m0 0l8-12h4m-12 12l8 12h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <rect x="40" y="8" width="13" height="14" rx="3" fill="var(--series-2)" />
      <rect x="40" y="34" width="13" height="14" rx="3" fill="var(--card)" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
    </>
  ),
  glossary: (
    <>
      <path d="M8 10h17a5 5 0 0 1 5 5v31a5 5 0 0 0-5-4H8z" fill="var(--card)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M48 10H33a5 5 0 0 0-5 5v31a5 5 0 0 1 5-4h15z" fill="var(--card)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M13 20h10M13 27h10" stroke="var(--series-1)" strokeWidth="3" strokeLinecap="round" />
      <path d="M35 20h8M35 27h8M35 34h5" stroke="var(--series-3)" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
}

const STEPS: readonly PageName[] = ['configure', 'group-allocation', 'selector-tester', 'glossary']

interface WelcomeModalProps {
  /** Whether "do not show again" is already stored: the box starts in that state. */
  dismissed: boolean
  /** Element that gets the focus back when the dialog closes. */
  opener: RefObject<HTMLElement | null>
  /** Closes the dialog. `remember` is the state of the box, `null` when closed without confirming. */
  onClose: (remember: boolean | null) => void
  /** Confirms with the state of the box, then opens the import section. */
  onImport: (remember: boolean) => void
}

/**
 * Welcome dialog: what the application does, the four steps with the page of
 * each, and the statement that everything stays in the browser. Modal: focus
 * is kept inside, Escape closes it, and the page behind does not scroll.
 */
export function WelcomeModal({ dismissed, opener, onClose, onImport }: WelcomeModalProps) {
  const { t, lang, setLang } = useI18n()
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const [remember, setRemember] = useState(dismissed)
  // Escape and the close button leave the stored preference as it is.
  useDrawer(true, dialogRef, opener, () => onClose(null))
  const langs: Lang[] = ['en', 'fr']
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-6">
      {/* Dimmed everywhere, and blurred where the browser supports it. */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onClose(null)} data-testid="welcome-backdrop" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-full w-full max-w-3xl flex-col rounded-xl border bg-card text-card-foreground shadow-xl"
      >
        <div className="h-1 shrink-0 rounded-t-xl bg-linear-to-r from-brand via-brand-mid to-brand-deep" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-6">
          <h2 id={titleId} className="min-w-0 text-xl font-semibold leading-snug">{t.welcome.title}</h2>
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="flex rounded-md border p-0.5" role="group" aria-label={t.app.language}>
              {langs.map((code) => (
                <button
                  key={code}
                  type="button"
                  lang={code}
                  aria-pressed={lang === code}
                  onClick={() => setLang(code)}
                  className={cn('cursor-pointer rounded px-2 py-0.5 text-[13px] font-medium uppercase', lang === code ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
                >
                  {code}
                </button>
              ))}
            </div>
            <Button size="icon" variant="ghost" aria-label={t.common.close} title={t.common.close} onClick={() => onClose(null)}>
              <X aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2 sm:px-6">
          <ol className="m-0 mt-1 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-4">
            {STEPS.map((page, index) => (
              <li key={page} className="flex items-start gap-3 rounded-lg border bg-background p-3 md:flex-col md:items-stretch">
                <svg viewBox="0 0 56 52" className="h-12 w-14 shrink-0 text-foreground" aria-hidden="true">{ILLUSTRATIONS[page]}</svg>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-muted-foreground">{index + 1}. {t.tabs[page]}</div>
                  <div className="text-[15px] font-semibold leading-snug">{t.welcome.steps[page].title}</div>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{t.welcome.steps[page].text}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 flex items-start gap-2 rounded-lg border bg-background px-3 py-2.5 text-sm">
            <CloudOff className="mt-0.5 size-5 shrink-0 text-status-good" aria-hidden="true" />
            <span>{t.welcome.offline} {t.app.savedShort}</span>
          </p>
          <p className="mt-2 text-[13px] text-muted-foreground" data-testid="compatibility">
            <span className="font-medium text-foreground">{t.welcome.compatibilityTitle}</span> {t.welcome.compatibility}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-6">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 cursor-pointer accent-[var(--primary)]" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            {t.welcome.dontShow}
          </label>
          <Button variant="default" onClick={() => onImport(remember)}>{t.welcome.importMine}</Button>
        </div>
      </div>
    </div>
  )
}
