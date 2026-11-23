import { Heart } from 'lucide-react'
import { useI18n } from '@/hooks/useI18n'
import { cn } from '@/utils/cn'

/**
 * Credit of the author, asked for by the author: the one personal name of the
 * application. The heart is a drawing, so the sentence is also given in words
 * for a screen reader.
 */
export function AuthorCredit({ className }: { className?: string }) {
  const { t, fill } = useI18n()
  const [before = '', after = ''] = t.app.credit.split('{heart}')
  return (
    <p className={cn('text-xs text-muted-foreground', className)} data-testid="author-credit">
      <span className="sr-only">{fill(t.app.credit, { heart: t.app.creditHeart })}</span>
      <span aria-hidden="true">
        {before}
        <Heart className="mx-0.5 inline size-3.5 -translate-y-px fill-current text-brand" />
        {after}
      </span>
    </p>
  )
}
