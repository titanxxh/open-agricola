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
}

export const MajorImprovements = ({
  locale,
  availableMajorImprovements,
  currentPlayer,
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
          <div
            key={`major-${cardId}`}
            className={`major-card${canBuy ? '' : ' disabled'}`}
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
          </div>
        )
      })}
    </div>
  </section>
)
