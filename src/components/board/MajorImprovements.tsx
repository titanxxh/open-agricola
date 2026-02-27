import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { PlayerState, Resource } from '../../../shared/game/types'
import { formatResources } from '../../../shared/logic/format'
import { getMajorCardEffect } from '../../../shared/cards/major'
import { emptyResources } from '../../../shared/logic/state'
import { canPayResources } from '../../../shared/actions/effects/pay'
import { ResourceLine } from '../common/ResourceLine'
import { CardWithCopy } from '../common/CardWithCopy'

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
}

export const MajorImprovements = ({
  locale,
  availableMajorImprovements,
  currentPlayer,
  isSelectingMajor,
  isInteractive,
  resolveChoice,
  futureCardResources,
}: Props) => (
  <section className="major-improvements">
    <h2>{t(locale, 'ui.majorImprovements')}</h2>
    <div className="major-row">
      {availableMajorImprovements.map((cardId) => {
        const major = getMajorCardEffect(cardId)
        const canBuy = !!major && canPayResources(currentPlayer, major.cost)
        const canInteract = isInteractive && isSelectingMajor && canBuy
        const costResources = major
          ? { ...emptyResources, ...major.cost }
          : {}
        const futureEntries = futureCardResources[cardId] ?? []
        return (
          <CardWithCopy
            key={`major-${cardId}`}
            locale={locale}
            cardId={cardId}
            onClick={() => {
              if (canInteract) {
                resolveChoice(`major:${cardId}`)
              }
            }}
            disabled={!isInteractive}
            className={`major-card${canBuy ? '' : ' disabled'}${
              isSelectingMajor && canBuy ? ' selectable' : ''
            }`}
          >
            <div className="hand-title">{t(locale, `improvements.${cardId}.name`)}</div>
            <div className="hand-meta">
              {t(locale, `improvements.${cardId}.description`)}
            </div>
            <div className="hand-meta">
              <span className="hand-label">{t(locale, 'ui.handCostLabel')}</span>
              <ResourceLine
                locale={locale}
                resources={costResources}
                emptyLabel={t(locale, 'ui.noCost')}
              />
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
          </CardWithCopy>
        )
      })}
    </div>
  </section>
)
