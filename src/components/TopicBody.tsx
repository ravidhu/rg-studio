import { CircleCheck } from 'lucide-react'
import { Highlight } from '@/components/Highlight'
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/hooks/useI18n'
import { useHelpExamples, useHelpValues } from '@/hooks/useHelpExamples'
import type { TopicKey } from '@/i18n/en'
import { relatedSettings, SOURCE_URLS, topicMeta } from '@/utils/topics'

/** Explanation of one topic: names, values, default, effect and what was verified in the source code. */
export function TopicBody({ topic, terms, walk }: { topic: TopicKey; terms?: readonly string[]; walk?: readonly string[] }) {
  const { t, fill } = useI18n()
  // Figures of the cluster quoted inside a text, such as the query memory.
  const values = useHelpValues()
  // Sentence with the values of the loaded configuration, when the topic has one.
  const example = useHelpExamples()[topic]
  const text = t.topics[topic]
  const meta = topicMeta(topic)
  const names: [string, string][] = []
  if (meta && meta.section !== 'concept') {
    names.push([t.glossary.jsonKey, meta.jsonKey ?? t.glossary.notInFile])
    names.push([t.glossary.dbColumn, meta.dbColumn === null ? t.glossary.notInDb : meta.section === 'global' ? `${meta.dbColumn} (${t.glossary.globalTable})` : meta.dbColumn])
  }
  if (text.unit) names.push([t.glossary.unit, text.unit])
  if (text.fallback) names.push([t.glossary.fallback, text.fallback])
  const related = relatedSettings(topic)
  return (
    <div className="text-sm" data-topic={topic}>
      {names.length > 0 && (
        <dl className="mb-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[13px]">
          {names.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="m-0"><code><Highlight text={value} terms={terms} /></code></dd>
            </div>
          ))}
        </dl>
      )}
      <p><Highlight text={fill(text.what, values)} terms={terms} /></p>
      {example && <p className="mt-2 rounded-md border bg-background p-2 tabular-nums">{example}</p>}
      {/* The rule above, applied to the figures of the card that opened this help. Absent in the glossary, which has no chart. */}
      {walk && walk.length > 0 && (
        <div className="mt-2 space-y-1 rounded-md border bg-background p-2 tabular-nums" data-help-walk="">
          <h4 className="text-[13px] font-semibold text-muted-foreground">{t.common.onScreen}</h4>
          {walk.map((line) => <p key={line}>{line}</p>)}
        </div>
      )}
      {text.interaction && (
        <>
          <h4 className="mt-2 text-[13px] font-semibold text-muted-foreground">{t.glossary.interaction}</h4>
          <p><Highlight text={text.interaction} terms={terms} /></p>
        </>
      )}
      {text.verified && (
        <p className="mt-2 rounded-md border bg-background p-2 text-[13px]" data-verified="">
          <Badge className="mr-1.5 gap-1"><CircleCheck className="size-3.5 text-status-good" aria-hidden="true" />{t.common.verified}</Badge>
          <Highlight text={text.verified} terms={terms} />
        </p>
      )}
      {meta?.source && (
        <p className="mt-2 text-[13px]">
          <a className="text-primary underline" href={SOURCE_URLS[meta.source]} target="_blank" rel="noopener noreferrer">{t.glossary.docLink}</a>
        </p>
      )}
      {/* The names tell the reader which fields change what the concept describes. They are plain names, and the glossary search finds them. */}
      {related.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[13px]" data-related-settings="">
          <dt className="text-muted-foreground">{t.glossary.relatedSettings}</dt>
          <dd className="m-0">
            {related.map((key, i) => (
              <span key={key}>
                {i > 0 && ', '}
                <code><Highlight text={t.topics[key].title} terms={terms} /></code>
              </span>
            ))}
          </dd>
        </dl>
      )}
    </div>
  )
}
