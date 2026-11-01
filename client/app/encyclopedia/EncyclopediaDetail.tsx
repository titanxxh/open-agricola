import { Fragment, useId, useState, type ReactNode } from 'react'
import type { EncyclopediaCost, EncyclopediaCostPath, EncyclopediaEntry, EncyclopediaTextField, EncyclopediaTextStatus } from '../../../shared/contract/card-encyclopedia'
import { PAYMENT_RESOURCE_KEYS } from '../../../shared/contract/resource-keys'
import { t, type Locale } from '../../../shared/i18n'
import { getCardDisplayName } from '../../components/common/cardText'
import { paymentResourceIconClass } from '../../components/common/resource-icon-class'
import { CardDescriptionText } from '../../components/common/CardDescriptionText'
import { EncyclopediaFace } from './EncyclopediaFace'
import type { EncyclopediaItem } from './encyclopedia-item'
import { encyclopediaGroupLabel, encyclopediaPointsApply, encyclopediaTypeLabel } from './encyclopedia-labels'
import { encyclopediaFieldText } from './encyclopedia-text'
import { encyclopediaShareUrl } from './encyclopedia-url'
import { useModalDialog } from './useModalDialog'

type DetailProps = {
  entryKey: string
  /** Undefined when the key is not in the catalog; the detail then reports it as unlisted. */
  item: EncyclopediaItem | undefined
  locale: Locale
  onClose: () => void
}

export function EncyclopediaDetail({ entryKey, item, locale, onClose }: DetailProps) {
  const dialogRef = useModalDialog()
  const titleId = useId()

  return (
    <dialog
      ref={dialogRef}
      className="encyclopedia-detail"
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className="encyclopedia-detail__panel">
        {item
          ? <EntryDetail key={entryKey} item={item} locale={locale} titleId={titleId} onClose={onClose} />
          : <UnlistedEntry locale={locale} titleId={titleId} onClose={onClose} />}
      </div>
    </dialog>
  )
}

function CloseButton({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  return (
    <button type="button" className="btn-secondary encyclopedia-detail__close" aria-label={t(locale, 'ui.encyclopedia.detail.close')} onClick={onClose}>
      {t(locale, 'ui.close')}
    </button>
  )
}

function UnlistedEntry({ locale, titleId, onClose }: { locale: Locale; titleId: string; onClose: () => void }) {
  return (
    <>
      <header className="encyclopedia-detail__header">
        <h2 id={titleId}>{t(locale, 'ui.encyclopedia.unknown.title')}</h2>
        <CloseButton locale={locale} onClose={onClose} />
      </header>
      <p className="encyclopedia-detail__lead">{t(locale, 'ui.encyclopedia.unknown.body')}</p>
      <div className="encyclopedia-detail__actions">
        <button type="button" className="btn-primary" onClick={onClose}>{t(locale, 'ui.encyclopedia.unknown.back')}</button>
      </div>
    </>
  )
}

type CopyState = 'idle' | 'copied' | 'failed'

const COPY_MESSAGE_KEYS: Readonly<Record<Exclude<CopyState, 'idle'>, string>> = {
  copied: 'ui.encyclopedia.detail.copied',
  failed: 'ui.encyclopedia.detail.copyFailed',
}

function EntryDetail({ item, locale, titleId, onClose }: { item: EncyclopediaItem; locale: Locale; titleId: string; onClose: () => void }) {
  const { entry } = item
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const name = encyclopediaFieldText(item, 'name', locale)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(encyclopediaShareUrl(entry.key))
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <>
      <header className="encyclopedia-detail__header">
        <div>
          {entry.displayNumber ? <p className="encyclopedia-detail__number">{entry.displayNumber}</p> : null}
          <h2 id={titleId}>{name?.text || t(locale, 'ui.encyclopedia.fallback.missing')}</h2>
          <FieldNote locale={locale} status={name?.status} />
        </div>
        <CloseButton locale={locale} onClose={onClose} />
      </header>
      <dl className="encyclopedia-detail__facts">
        <Fact label={t(locale, 'ui.encyclopedia.filters.group')}>{encyclopediaGroupLabel(locale, entry.group)}</Fact>
        <Fact label={t(locale, 'ui.encyclopedia.filters.type')}>{encyclopediaTypeLabel(locale, entry.publicType)}</Fact>
        {entry.players ? <Fact label={t(locale, 'ui.encyclopedia.detail.players')}>{playersText(entry.players, locale)}</Fact> : null}
        <Fact label={t(locale, 'platform.cost')}><CostFact cost={entry.cost} locale={locale} /></Fact>
        <Fact label={t(locale, 'ui.encyclopedia.detail.points')}><PointsFact entry={entry} locale={locale} /></Fact>
      </dl>
      <div className="encyclopedia-detail__face">
        <EncyclopediaFace item={item} locale={locale} />
      </div>
      <TextSection item={item} field="body" label={t(locale, 'ui.encyclopedia.detail.cardText')} locale={locale} />
      <TextSection item={item} field="prerequisite" label={t(locale, 'platform.prerequisite')} locale={locale} />
      <TextSection item={item} field="rules" label={t(locale, 'ui.supplementalRules')} locale={locale} />
      <p className="encyclopedia-detail__note">{t(locale, 'ui.encyclopedia.detail.staticNote')}</p>
      <div className="encyclopedia-detail__actions">
        <button type="button" className="btn-primary" onClick={() => { void copyLink() }}>{t(locale, 'ui.encyclopedia.detail.copyLink')}</button>
        <button type="button" className="btn-secondary" onClick={onClose}>{t(locale, 'ui.encyclopedia.detail.backToResults')}</button>
        <p className="encyclopedia-detail__copy-status" role="status">
          {copyState === 'idle' ? null : t(locale, COPY_MESSAGE_KEYS[copyState])}
        </p>
      </div>
    </>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="encyclopedia-detail__fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function FieldNote({ locale, status }: { locale: Locale; status: EncyclopediaTextStatus | undefined }) {
  if (status !== 'fallback') return null
  return <p className="encyclopedia-field-note">{t(locale, 'ui.encyclopedia.fallback.english')}</p>
}

function TextSection({ item, field, label, locale }: { item: EncyclopediaItem; field: EncyclopediaTextField; label: string; locale: Locale }) {
  const headingId = useId()
  const text = encyclopediaFieldText(item, field, locale)
  if (!text) return null
  return (
    <section className="encyclopedia-detail__section" aria-labelledby={headingId}>
      <h3 id={headingId}>{label}</h3>
      <FieldNote locale={locale} status={text.status} />
      {text.text
        ? <p className="encyclopedia-detail__text"><CardDescriptionText locale={locale} text={text.text} /></p>
        : <p className="encyclopedia-field-missing">{t(locale, 'ui.encyclopedia.fallback.missing')}</p>}
    </section>
  )
}

const playersText = (players: NonNullable<EncyclopediaEntry['players']>, locale: Locale): string =>
  'minimum' in players ? `${players.minimum}+` : players.counts.join(t(locale, 'ui.listSeparator'))

function CostPath({ path, locale }: { path: EncyclopediaCostPath; locale: Locale }) {
  return (
    <span className="encyclopedia-cost__path">
      {PAYMENT_RESOURCE_KEYS.filter(key => (path[key] ?? 0) > 0).map(key => (
        <span key={key} className="encyclopedia-cost__resource">
          {path[key]}
          <span className={`res-icon res-icon-${paymentResourceIconClass(key)}`} role="img" aria-label={t(locale, `resources.${key}`)} title={t(locale, `resources.${key}`)} />
        </span>
      ))}
    </span>
  )
}

const COST_STATE_KEYS: Readonly<Record<EncyclopediaCost['kind'], string>> = {
  printed: 'ui.encyclopedia.cost.printed',
  unlisted: 'ui.encyclopedia.cost.unlisted',
  notApplicable: 'ui.encyclopedia.cost.notApplicable',
}

function CostFact({ cost, locale }: { cost: EncyclopediaCost; locale: Locale }) {
  const returnNames = cost.kind === 'notApplicable' || !cost.returnCards
    ? []
    : [...new Set(cost.returnCards.map(id => getCardDisplayName(locale, id)))]
  return (
    <>
      <span className="encyclopedia-cost__state">{t(locale, COST_STATE_KEYS[cost.kind])}</span>
      {cost.kind === 'printed' ? (
        <span className="encyclopedia-cost__paths">
          {cost.paths.map((path, index) => (
            <Fragment key={index}>
              {index > 0 ? <span className="encyclopedia-cost__or">{t(locale, 'ui.encyclopedia.cost.or')}</span> : null}
              <CostPath path={path} locale={locale} />
            </Fragment>
          ))}
        </span>
      ) : null}
      {returnNames.length > 0 ? (
        <span className="encyclopedia-cost__upgrade">
          {`${t(locale, 'ui.encyclopedia.cost.upgradeReturn')} · ${returnNames.join(t(locale, 'ui.listSeparator'))}`}
        </span>
      ) : null}
    </>
  )
}

function PointsFact({ entry, locale }: { entry: EncyclopediaEntry; locale: Locale }) {
  const { fixed, extraVp } = entry.score
  const base = !encyclopediaPointsApply(entry)
    ? t(locale, 'ui.encyclopedia.points.notApplicable')
    : fixed === null
      ? t(locale, 'ui.encyclopedia.points.unlisted')
      : t(locale, 'ui.encyclopedia.points.fixed', { score: fixed })
  return (
    <>
      <span>{base}</span>
      {extraVp ? <span className="encyclopedia-points__bonus">{t(locale, 'ui.encyclopedia.points.bonus')}</span> : null}
    </>
  )
}
