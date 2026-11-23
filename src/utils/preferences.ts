/**
 * Viewer preferences (language, theme) kept in the browser. Storage can be
 * unavailable, in a private window for example, so every access is guarded
 * and the page works without it. The configuration is stored apart, by `configStore.ts`.
 */
const PREFIX = 'rg-studio.'

export function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

export function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(PREFIX + key, value)
  } catch {
    // Preferences are a convenience: ignore a storage that refuses writes.
  }
}
