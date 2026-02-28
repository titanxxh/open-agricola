import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { PlayerState, Resource } from '../../../shared/game/types'
import { formatResources } from '../../../shared/logic/format'
import { getMajorCardEffect } from '../../../shared/cards/major'
import { emptyResources } from '../../../shared/logic/state'
import { canPayResources } from '../../../shared/actions/effects/pay'
import { ResourceLine } from '../common/ResourceLine'
import { PlayerCard } from '../common/PlayerCard'

type Props = {
  locale: Locale
  availableMajorImprovements: string[]
  currentPlayer: PlayerState
  isSelectingMajor: boolean
  isInteractive: boolean
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
  devMode: boolean
}

export const MajorImprovements = ({
  locale,
  availableMajorImprovements,
  currentPlayer,
  isSelectingMajor,
  isInteractive,
  resolveChoice,
  futureCardResources,
  devMode,
}: Props) => (
  <section className="major-improvements">
    <h2>{t(locale, 'ui.majorImprovements')}</h2>
    <div className="major-row">
      {availableMajorImprovements.map((cardId) => {
        const major = getMajorCardEffect(cardId)
        const canBuy = !!major && canPayResources(currentPlayer, major.cost)
        const canInteract = isInteractive && isSelectingMajor && canBuy
        const futureEntries = futureCardResources[cardId] ?? []
        return (
          <div key={`major-${cardId}`} className="major-card-wrapper">
            <PlayerCard
              locale={locale}
              cardId={cardId}
              cardType="major"
              devMode={devMode}
              onClick={() => {
                if (canInteract) {
                  resolveChoice(`major:${cardId}`)
                }
              }}
              disabled={!canBuy}
              selectable={isSelectingMajor && canBuy}
              className={canBuy ? '' : 'disabled'}
            />
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
                      <ResourceLine
                        locale={locale}
                        resources={{ ...emptyResources, ...entry.resources }}
                        className="card-future-text"
                      />
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  </section>
)
