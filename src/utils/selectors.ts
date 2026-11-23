import type { RgConfig, Selector, SelectorRegexField } from '@/types/model'
import { SELECTOR_REGEX_FIELDS } from '@/types/model'
import type { GroupTree } from '@/utils/tree'

const MAX_PATTERN_LENGTH = 2000
const MAX_SUBJECT_LENGTH = 4000

export type CompiledRegex =
  | { ok: true; regex: RegExp }
  | { ok: false; reason: 'tooLong' | 'javaOnly' | 'invalid'; message: string }

/** Letters that mean the same after a backslash in Java and in JavaScript. */
const SHARED_LETTER_ESCAPES = new Set('dDwWsSbBnrtfvkxuc0123456789'.split(''))

function hasJavaOnlyEscape(pattern: string): boolean {
  for (let index = 0; index < pattern.length - 1; index += 1) {
    if (pattern[index] !== '\\') continue
    const next = pattern[index + 1] ?? ''
    if (/[a-zA-Z0-9]/.test(next) && !SHARED_LETTER_ESCAPES.has(next)) return true
    index += 1
  }
  return false
}

/**
 * Compiles a selector pattern, written for `java.util.regex`, as a JavaScript
 * regular expression anchored on both ends, because the engine requires the whole
 * value to match. Java-only syntax (possessive quantifiers, atomic groups,
 * `\Q..\E`, POSIX classes such as `\p{Alpha}`, most inline flags) is reported
 * instead of being evaluated wrongly. A leading `(?i)`, `(?s)` or `(?m)` is
 * translated to the matching JavaScript flag.
 */
export function compileJavaRegex(pattern: string): CompiledRegex {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return { ok: false, reason: 'tooLong', message: `${pattern.length} > ${MAX_PATTERN_LENGTH}` }
  }
  let body = pattern
  let flags = ''
  const inline = /^\(\?([a-zA-Z]+)\)/.exec(body)
  if (inline) {
    for (const flag of inline[1] ?? '') {
      if (!'ism'.includes(flag)) return { ok: false, reason: 'javaOnly', message: `(?${flag})` }
      if (!flags.includes(flag)) flags += flag
    }
    body = body.slice(inline[0].length)
  }
  // Escapes that exist only in Java, or that exist in both with another
  // meaning (the `\p` classes), are never evaluated.
  if (hasJavaOnlyEscape(body)) return { ok: false, reason: 'javaOnly', message: '' }
  const anchored = `^(?:${body})$`
  try {
    return { ok: true, regex: new RegExp(anchored, `${flags}u`) }
  } catch {
    // The strict mode rejects harmless escapes such as `\#` that Java accepts.
    try {
      return { ok: true, regex: new RegExp(anchored, flags) }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      // Possessive quantifiers and atomic groups are valid in Java only.
      const javaOnly = /[*+?}]\+|\(\?>/.test(body)
      return { ok: false, reason: javaOnly ? 'javaOnly' : 'invalid', message }
    }
  }
}

/** Selectors in evaluation order: list order (file) or descending priority (database). */
export function orderedSelectors(config: RgConfig): Selector[] {
  if (config.mode === 'file') return [...config.selectors]
  const priorityOf = (selector: Selector): number => {
    const value = Number(selector.priority)
    return selector.priority.trim() === '' || Number.isNaN(value) ? 0 : value
  }
  return config.selectors
    .map((selector, index) => ({ selector, index }))
    .sort((a, b) => priorityOf(b.selector) - priorityOf(a.selector) || a.index - b.index)
    .map((entry) => entry.selector)
}

/** True when the selector has no condition, or only patterns that accept anything. */
export function isCatchAll(selector: Selector): boolean {
  if (selector.clientTags.length > 0 || selector.queryType.trim() !== '') return false
  if (selector.userGroup.trim() !== '') return false
  return SELECTOR_REGEX_FIELDS.every((field) => ['', '.*', '(.*)', '^.*$'].includes(selector[field].trim()))
}

export interface QueryContext {
  user: string
  originalUser: string
  authenticatedUser: string
  userGroups: string[]
  source: string
  clientTags: string[]
  queryType: string
  queryText: string
}

export type ConditionField = SelectorRegexField | 'queryType' | 'clientTags'
export type Outcome = 'match' | 'noMatch' | 'unsupported'

export interface ConditionTrace {
  field: ConditionField
  expected: string
  outcome: Outcome
}

export interface SelectorTrace {
  selector: Selector
  outcome: Outcome
  conditions: ConditionTrace[]
}

export interface RoutingResult {
  traces: SelectorTrace[]
  matched: Selector | null
  /** Target path with template variables expanded, `null` when nothing matched. */
  groupPath: string | null
  /** A pattern evaluated before the match could not be run in the browser. */
  uncertain: boolean
}

function clip(value: string): string {
  return value.slice(0, MAX_SUBJECT_LENGTH)
}

function expandTemplate(path: string, variables: ReadonlyMap<string, string>): string {
  return path.replace(/\$\{([A-Za-z0-9_]+)\}/g, (whole, name: string) => variables.get(name) ?? whole)
}

/** Runs the selectors against one query, in evaluation order, first match wins. */
export function routeQuery(config: RgConfig, tree: GroupTree, query: QueryContext): RoutingResult {
  const traces: SelectorTrace[] = []
  let matched: Selector | null = null
  let groupPath: string | null = null
  let uncertain = false

  for (const selector of orderedSelectors(config)) {
    const conditions: ConditionTrace[] = []
    const variables = new Map<string, string>([
      ['USER', query.user],
      ['SOURCE', query.source],
    ])
    const subjects: Record<SelectorRegexField, string[]> = {
      user: [query.user],
      originalUser: [query.originalUser],
      authenticatedUser: [query.authenticatedUser],
      userGroup: query.userGroups,
      source: [query.source],
      queryText: [query.queryText],
    }
    for (const field of SELECTOR_REGEX_FIELDS) {
      const pattern = selector[field]
      if (pattern === '') continue
      const compiled = compileJavaRegex(pattern)
      if (!compiled.ok) {
        conditions.push({ field, expected: pattern, outcome: 'unsupported' })
        continue
      }
      let outcome: Outcome = 'noMatch'
      for (const subject of subjects[field]) {
        const result = compiled.regex.exec(clip(subject))
        if (!result) continue
        outcome = 'match'
        for (const [name, value] of Object.entries(result.groups ?? {})) {
          if (value !== undefined) variables.set(name, value)
        }
        break
      }
      conditions.push({ field, expected: pattern, outcome })
    }
    if (selector.queryType.trim() !== '') {
      const same = selector.queryType.trim().toUpperCase() === query.queryType.trim().toUpperCase()
      conditions.push({ field: 'queryType', expected: selector.queryType, outcome: same ? 'match' : 'noMatch' })
    }
    if (selector.clientTags.length > 0) {
      const all = selector.clientTags.every((tag) => query.clientTags.includes(tag))
      conditions.push({ field: 'clientTags', expected: selector.clientTags.join(', '), outcome: all ? 'match' : 'noMatch' })
    }
    let outcome: Outcome = 'match'
    if (conditions.some((condition) => condition.outcome === 'noMatch')) outcome = 'noMatch'
    else if (conditions.some((condition) => condition.outcome === 'unsupported')) outcome = 'unsupported'
    traces.push({ selector, outcome, conditions })
    if (matched !== null) continue
    if (outcome === 'unsupported') uncertain = true
    if (outcome === 'match') {
      matched = selector
      const node = selector.groupId === null ? undefined : tree.byId.get(selector.groupId)
      groupPath = expandTemplate(node ? node.path : selector.unresolvedTarget, variables)
    }
  }
  return { traces, matched, groupPath, uncertain }
}

/** Another selector that matches the same query with the same priority as the one that wins. */
export interface PriorityTie {
  /** Position in evaluation order, from 1. */
  position: number
  /** It targets the same group as the winner: whichever wins, the query lands in the same place. */
  sameTarget: boolean
}

/**
 * Under the database manager, selectors of equal priority have no guaranteed
 * order. Lists those that match the query at the priority of the winner:
 * for such a query, another run could pick any of them.
 */
export function tiedMatches(config: RgConfig, result: RoutingResult): PriorityTie[] {
  const winner = result.matched
  if (config.mode !== 'db' || winner === null) return []
  const priorityOf = (selector: Selector): number => {
    const value = Number(selector.priority)
    return selector.priority.trim() === '' || Number.isNaN(value) ? 0 : value
  }
  const targetOf = (selector: Selector): string => (selector.groupId === null ? `?${selector.unresolvedTarget}` : selector.groupId)
  const ties: PriorityTie[] = []
  result.traces.forEach((trace, index) => {
    if (trace.selector === winner || trace.outcome !== 'match' || priorityOf(trace.selector) !== priorityOf(winner)) return
    ties.push({ position: index + 1, sameTarget: targetOf(trace.selector) === targetOf(winner) })
  })
  return ties
}
