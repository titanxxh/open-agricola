import type { ReactNode } from 'react'
import { t, type Locale } from '../../../shared/i18n'
import { ResourceText } from '../../components/common/ResourceText'
import { EncyclopediaFieldValue } from './EncyclopediaFieldValue'
import type { EncyclopediaItem } from './encyclopedia-item'
import { encyclopediaFieldText } from './encyclopedia-text'

export function EncyclopediaTextFace({ item, locale, imageMissing = false, children }: {
  item: EncyclopediaItem
  locale: Locale
  imageMissing?: boolean
  children?: ReactNode
}) {
  const name = encyclopediaFieldText(item, 'name', locale)
  const body = encyclopediaFieldText(item, 'body', locale)
  const missing = t(locale, 'ui.encyclopedia.fallback.missing')
  return (
    <article className="encyclopedia-text-face" data-face={item.entry.face.kind}>
      {item.entry.displayNumber ? <span className="encyclopedia-text-face__number">{item.entry.displayNumber}</span> : null}
      <h3 className="encyclopedia-text-face__name">
        {name ? <EncyclopediaFieldValue text={name} locale={locale}>{name.text || missing}</EncyclopediaFieldValue> : missing}
      </h3>
      {imageMissing ? <p className="encyclopedia-text-face__image-missing">{t(locale, 'ui.encyclopedia.image.missing')}</p> : null}
      {body ? (
        <div className="encyclopedia-text-face__body">
          <EncyclopediaFieldValue text={body} locale={locale}>{body.text ? <ResourceText text={body.text} /> : missing}</EncyclopediaFieldValue>
        </div>
      ) : null}
      {children}
    </article>
  )
}
