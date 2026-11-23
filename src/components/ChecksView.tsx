import { CircleCheck } from 'lucide-react'
import { SeverityIcon } from '@/components/config/GroupEditor'
import { ExplainRow } from '@/components/ExplainButton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/hooks/useI18n'
import type { Severity } from '@/types/model'
import type { Finding } from '@/utils/checks'

export type PeriodField = 'cpuQuotaPeriod' | 'physicalDataScanQuotaPeriod'

/** What a finding points at in the editors. */
export interface EditTarget {
  groupId: string | null
  selectorId: string | null
  /** Period field of the global settings to focus. The finding then opens that field, not a group. */
  field: PeriodField | null
}

function periodFieldOf(finding: Finding): PeriodField | null {
  return finding.field === 'cpuQuotaPeriod' || finding.field === 'physicalDataScanQuotaPeriod' ? finding.field : null
}

interface ChecksViewProps {
  /** A configuration started from scratch has no manager yet: the findings on selector order wait for it. */
  needsManager: boolean
  onChooseManager: () => void
  findings: Finding[]
  /** Opens the editor on what the finding is about: a selector first, else a group. */
  onEdit: (target: EditTarget) => void
  /** Empties a quota period that no group uses. */
  onClearPeriod: (field: PeriodField) => void
}

const SEVERITIES: readonly Severity[] = ['error', 'warning', 'info']

export function ChecksView({ needsManager, onChooseManager, findings, onEdit, onClearPeriod }: ChecksViewProps) {
  const { t, fill } = useI18n()
  const message = (finding: Finding): string =>
    fill(t.checks.messages[finding.code], {
      ...finding.params,
      against: finding.params.against === 'parent' ? t.checks.against.parent : t.checks.against.cluster,
    })
  return (
    <Card>
      <CardTitle>{t.checks.title}</CardTitle>
      <CardDescription>{t.checks.lead}</CardDescription>
      {needsManager && (
        <p className="mt-3 rounded-md border border-status-warning bg-background px-3 py-2 text-sm" data-testid="manager-prompt">
          {t.source.prompt}{' '}
          <button type="button" className="cursor-pointer rounded text-primary underline" onClick={onChooseManager}>{t.source.promptLink}</button>
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {SEVERITIES.map((severity) => (
          <Badge key={severity} className="gap-1.5 px-2.5 py-1 text-[13px] text-foreground">
            <SeverityIcon severity={severity} />
            {fill(t.checks.count[severity], { count: findings.filter((finding) => finding.severity === severity).length })}
          </Badge>
        ))}
      </div>
      {findings.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm">
          <CircleCheck className="size-4 text-status-good" aria-hidden="true" />
          {t.checks.none}
        </p>
      ) : (
        <ul className="m-0 mt-4 list-none space-y-2 p-0">
          {findings.map((finding, index) => (
            <li key={index} className="flex items-start gap-2.5 rounded-md border bg-background px-3 py-2">
              <SeverityIcon severity={finding.severity} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-wide">{t.checks.severity[finding.severity]}</span>
                  <code>
                    {finding.groupId !== null
                      ? String(finding.params.group ?? '')
                      : finding.selectorId !== null
                        ? fill(t.checks.selector, { position: finding.params.position ?? '' })
                        : t.checks.global}
                  </code>
                </div>
                <p className="mt-0.5 text-sm [overflow-wrap:anywhere]">{message(finding)}</p>
              </div>
              {(finding.code === 'cpuPeriodUnused' || finding.code === 'scanPeriodUnused') && (
                <Button size="sm" className="shrink-0" onClick={() => onClearPeriod(finding.code === 'cpuPeriodUnused' ? 'cpuQuotaPeriod' : 'physicalDataScanQuotaPeriod')}>
                  {t.checks.clear}
                </Button>
              )}
              {(finding.groupId !== null || finding.selectorId !== null || periodFieldOf(finding) !== null) && (
                <Button size="sm" className="shrink-0" onClick={() => onEdit({ groupId: finding.groupId, selectorId: finding.selectorId, field: periodFieldOf(finding) })}>
                  {t.checks.edit}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ExplainRow topics={['conceptAncestors', 'conceptSoftHard', 'conceptPolicies', 'conceptSelectorOrder']} />
    </Card>
  )
}
