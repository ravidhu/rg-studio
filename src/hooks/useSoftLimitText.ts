import { useI18n } from '@/hooks/useI18n'
import type { SoftLimitRivals } from '@/utils/softLimit'
import { listNames } from '@/utils/softLimit'

export interface SoftLimitValues {
  group: string
  soft: string
  hard: string
  queued: string
}

export type SoftLimitZone = 'runs' | 'lower' | 'queued' | 'rejected'

/**
 * Sentence that explains one zone of a group between zero queries and
 * rejection, with its own limits and the names of the groups it competes
 * with. One wording for the diagram, the dashboard bars and the help.
 */
export function useSoftLimitText(): (zone: SoftLimitZone, values: SoftLimitValues, rivals: SoftLimitRivals) => string {
  const { t, fill, plural } = useI18n()
  return (zone, values, rivals) => {
    const texts = t.softHard
    if (zone === 'runs') return fill(texts.runs, { ...values })
    if (zone === 'queued') return fill(texts.queued, { ...values })
    if (zone === 'rejected') return fill(texts.rejected, { ...values })
    if (rivals.kind === 'root') return fill(texts.lowerRoot, { ...values })
    if (rivals.kind === 'alone') return fill(texts.lowerAlone, { ...values, parent: rivals.parent })
    const siblings = listNames(rivals.siblings, texts.and, (count) => plural(count, texts.others))
    return fill(rivals.siblings.length === 1 ? texts.lowerOne : texts.lower, { ...values, siblings, parent: rivals.parent })
  }
}
