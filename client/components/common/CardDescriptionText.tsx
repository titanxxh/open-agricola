import { t, type Locale } from '../../../shared/i18n'
import { useContext } from 'react'
import { ActionReferencePlayerCount } from '../../contexts/ActionReferenceContext'
import { ActionTextReference } from './ActionTextReference'
import { ResourceText } from './ResourceText'

export function CardDescriptionText({ locale, text, className }: { locale: Locale; text: string; className?: string }) {
  const playerCount = useContext(ActionReferencePlayerCount)
  return <ResourceText text={text} className={className} renderReference={reference => reference.kind === 'invalid'
    ? <span role="alert">{reference.label ? `${reference.label}: ` : ''}{t(locale, 'ui.actionReference.invalid')}</span>
    : (
    <ActionTextReference key={`${locale}:${playerCount}:${reference.kind}:${reference.ids.join(',')}:${reference.label}`} locale={locale} reference={reference} />
  )} />
}
