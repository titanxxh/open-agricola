import { useId } from 'react'
import type { CardEdition } from '../../shared/contract/card-edition'
import { useLocale } from '../contexts/LocaleContext'
import { classicDeckPoolNotice, type useClassicDeckPool } from './classic-card-setup'

type Props = {
  edition: CardEdition
  onEditionChange: (edition: CardEdition) => void
  pool: ReturnType<typeof useClassicDeckPool>
  onDeckToggle: (deck: string) => void
  incompatibleDescriptionId: string
}

export function CardEditionSetup({ edition, onEditionChange, pool, onDeckToggle, incompatibleDescriptionId }: Props) {
  const id = useId()
  const { t } = useLocale()
  const notice = edition === 'classic' ? classicDeckPoolNotice(t, pool) : null
  return (
    <>
      <fieldset className="card-edition-field">
        <legend>{t('platform.cardEditionLabel')}</legend>
        <div className="card-edition-radio-row">
          <label>
            <input type="radio" name={id} checked={edition === 'revised'} onChange={() => onEditionChange('revised')} />
            {t('platform.cardEditionRevised')}
          </label>
          <label>
            <input type="radio" name={id} checked={edition === 'classic'} onChange={() => onEditionChange('classic')} />
            {t('platform.cardEditionClassic')}
          </label>
        </div>
      </fieldset>
      {edition === 'classic' && (
        <>
          {pool.status === 'ready' && (
            <fieldset className="card-edition-field">
              <legend>{t('platform.classicDecksLabel')}</legend>
              {pool.decks.map(({ deck, occupation, minor }) => (
                <label key={deck}>
                  <input
                    type="checkbox"
                    disabled={occupation + minor === 0}
                    checked={pool.selectedDeckIds.includes(deck)}
                    onChange={() => onDeckToggle(deck)}
                  />
                  {t('platform.classicDeckCount', { deck, occupations: occupation, minors: minor })}
                </label>
              ))}
            </fieldset>
          )}
          {notice && <p role="status" className="card-edition-notice">{notice}</p>}
          <p id={incompatibleDescriptionId} className="card-edition-notice">{t('platform.classicIncompatibleOptions')}</p>
        </>
      )}
    </>
  )
}
