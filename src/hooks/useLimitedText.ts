import { useI18n } from '@/hooks/useI18n'
import type { LimitedBy } from '@/utils/dashboard'

/** Wording of what limits a group, for tooltips and the table. */
export function useLimitedText(): (reason: LimitedBy) => string {
  const { t, fill } = useI18n()
  return (reason) => fill(t.dashboard.limited[reason.kind], 'holder' in reason ? { group: reason.holder.group.name } : {})
}
