import { fillNodes, useI18n } from '@/hooks/useI18n'
import { messageCodeKeys, type Finding } from '@/utils/checks'

/** The text of a finding, with the names of groups and selectors shown as inline code. */
export function CheckMessage({ finding }: { finding: Finding }) {
  const { t } = useI18n()
  const params = { ...finding.params, against: finding.params.against === 'parent' ? t.checks.against.parent : t.checks.against.cluster }
  return <>{fillNodes(t.checks.messages[finding.code], params, messageCodeKeys(finding.code))}</>
}
