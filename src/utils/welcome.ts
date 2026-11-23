/**
 * Preference of the welcome dialog: whether the viewer asked not to see it
 * again. It is the only thing stored about the welcome. Storage may be missing or refuse access (private window,
 * blocked site data): every access is guarded, and the dialog is then shown
 * at each visit.
 */
export const WELCOME_KEY = 'rg-studio.welcome.dismissed'

/** The part of the browser storage this module needs, so that tests can replace it. */
export interface PreferenceStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

/** Browser storage, or `null` when the browser does not give access to it. */
export function browserStorage(): PreferenceStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function isWelcomeDismissed(storage: PreferenceStorage | null): boolean {
  try {
    return storage?.getItem(WELCOME_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * The dialog opens by itself on a visit unless the viewer dismissed it for
 * good, or already has a configuration of their own: `configRestored` says
 * that a valid stored configuration was loaded at startup. A stored value
 * that was rejected, and the example, do not count. Nothing is written here,
 * so the rule is evaluated again at each startup.
 */
export function shouldShowWelcome(storage: PreferenceStorage | null, configRestored: boolean): boolean {
  return !configRestored && !isWelcomeDismissed(storage)
}

/**
 * Records the choice made when the dialog is confirmed. Returns whether the
 * choice could be kept: `false` means the dialog will come back next visit.
 */
export function saveWelcomeChoice(storage: PreferenceStorage | null, dismissed: boolean): boolean {
  try {
    if (!storage) return false
    if (dismissed) storage.setItem(WELCOME_KEY, '1')
    else storage.removeItem(WELCOME_KEY)
    return true
  } catch {
    return false
  }
}
