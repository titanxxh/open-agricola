import type { ReactNode } from 'react'
import { t, type Locale } from '../../../shared/i18n'
import type { EncyclopediaFieldText } from './encyclopedia-text'

/** The mark leads the text because faces clip long text at the end. */
export function EncyclopediaFieldValue({ text, locale, markId, children }: {
  text: EncyclopediaFieldText
  locale: Locale
  markId?: string
  children: ReactNode
}) {
  if (text.status !== 'fallback') return <>{children}</>
  const label = t(locale, 'ui.encyclopedia.fallback.english')
  return (
    <>
      <span id={markId} className="encyclopedia-fallback-mark" role="img" aria-label={label} title={label} />
      <span lang="en">{children}</span>
    </>
  )
}
