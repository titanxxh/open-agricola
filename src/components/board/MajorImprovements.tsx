import type { Locale } from '../../i18n'
import { t } from '../../i18n'
import type { PlayerState, Resource } from '../../game/types'
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
  futureCardResources: Record<
    string,
    {
      playerId: string
      name: string
      color: PlayerState['color']
      resources: Partial<Resource>
    }[]
  >
}

export const MajorImprovements = ({
  locale,
  availableMajorImprovements,
  currentPlayer,
  isSelectingMajor,
  resolveChoice,
  futureCardResources,
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
        const futureEntries = futureCardResources[cardId] ?? []
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
            {futureEntries.length > 0 ? (
              <div className="card-future">
                {futureEntries.map((entry, index) => {
                  const label = formatResources(
                    locale,
                    { ...emptyResources, ...entry.resources },
                    true,
                  )
                  return (
                    <div
                      key={`future-${cardId}-${entry.playerId}-${index}`}
                      className="card-future-item"
                      title={`${entry.name}: ${label}`}
                    >
                      <span className={`card-future-dot meeple-${entry.color}`} />
                      <span className="card-future-text">{label}</span>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </button>
        )
      })}
    </div>
  </section>
)
