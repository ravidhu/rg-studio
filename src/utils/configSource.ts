/** Where the configuration in use comes from, and whether it was changed since. */
export interface ConfigSource {
  origin: 'demo' | 'imported' | 'created'
  edited: boolean
}

export type ConfigOrigin = ConfigSource['origin']

export type SourceEvent = { type: 'load'; origin: ConfigOrigin } | { type: 'edit' }

export const DEMO_SOURCE: ConfigSource = { origin: 'demo', edited: false }

/** Loading replaces the source, editing only marks the current one as changed. */
export function nextSource(current: ConfigSource, event: SourceEvent): ConfigSource {
  if (event.type === 'load') return { origin: event.origin, edited: false }
  return current.edited ? current : { ...current, edited: true }
}
