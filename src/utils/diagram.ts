/** Constants and helpers shared by the concept diagrams. */

/** Drawing width shared by every diagram: sized for a phone, scaled up on wide screens. */
export const WIDTH = 340

export const INK = {
  first: 'var(--series-1)',
  second: 'var(--series-2)',
  third: 'var(--series-3)',
  neutral: 'var(--chart-neutral)',
  track: 'var(--chart-track)',
  line: 'var(--chart-axis)',
  muted: 'var(--muted-foreground)',
  good: 'var(--status-good)',
  bad: 'var(--status-error)',
  surface: 'var(--card)',
} as const

/** Shortens a name so that it stays inside its box. */
export function clip(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 1))}…` : text
}

/** Concepts that have a drawing: the cases of `ConceptDiagram`. */
export const DIAGRAM_TOPICS: ReadonlySet<string> = new Set([
  'conceptAncestors', 'conceptSoftHard', 'conceptLeaf', 'conceptRoots', 'conceptClusterMemory', 'conceptCpu',
  'conceptPolicies', 'conceptSelectorOrder', 'conceptRegex', 'conceptTemplates', 'conceptManager', 'conceptModel',
])
