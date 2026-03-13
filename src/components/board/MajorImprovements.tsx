import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { ComplexCost, PlayerState, Resource } from '../../../shared/game/types'
import { formatResources } from '../../../shared/logic/format'
import { getMajorCardEffect } from '../../../shared/cards/major'
import { emptyResources } from '../../../shared/logic/state'
import { canPayResources, computeAllBuyableCombinations } from '../../../shared/actions/effects/pay'
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
        const isComplex = !!major && (
          'fee' in major.cost ||
          'fees' in major.cost ||
          'trades' in major.cost ||
          'cards' in major.cost ||
          'bonuses' in major.cost
        )
        const canBuy = !!major && (
          isComplex
            ? computeAllBuyableCombinations(currentPlayer, major.cost as ComplexCost, currentPlayer.improvements).length > 0
            : canPayResources(currentPlayer, (major?.cost ?? {}) as Partial<Resource>)
        )
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
