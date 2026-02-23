import type { Locale } from '../../i18n'
import { t } from '../../i18n'
import type { PlayerState } from '../../game/types'
import { formatResources } from '../../logic/format'
import { getMajorCardEffect } from '../../actions/cards/major'
import { emptyResources } from '../../logic/state'
import { canPayResources } from '../../actions/effects/pay'

type Props = {
  locale: Locale
  availableMajorImprovements: string[]
  currentPlayer: PlayerState
  isSelectingMajor: boolean
  resolveChoice: (value: string) => void
}

export const MajorImprovements = ({
  locale,
  availableMajorImprovements,
  currentPlayer,
  isSelectingMajor,
  resolveChoice,
}: Props) => (
  <section className="major-improvements">
    <h2>{t(locale, 'ui.majorImprovements')}</h2>
    <div className="major-row">
      {availableMajorImprovements.map((cardId) => {
        const major = getMajorCardEffect(cardId)
        const canBuy = !!major && canPayResources(currentPlayer, major.cost)
        const costText = major
          ? formatResources(locale, { ...emptyResources, ...major.cost }, true)
          : ''
        return (
          <button
            key={`major-${cardId}`}
            type="button"
            className={`major-card${canBuy ? '' : ' disabled'}${
              isSelectingMajor && canBuy ? ' selectable' : ''
            }`}
            onClick={() => {
              if (isSelectingMajor && canBuy) {
                resolveChoice(`major:${cardId}`)
              }
            }}
          >
            <div className="hand-title">{t(locale, `improvements.${cardId}.name`)}</div>
            <div className="hand-meta">
              {t(locale, `improvements.${cardId}.description`)}
            </div>
            <div className="hand-meta">
              {t(locale, 'ui.handCost', {
                cost: costText || t(locale, 'ui.noCost'),
              })}
            </div>
          </button>
        )
      })}
    </div>
  </section>
)
