import type { Locale } from '../../i18n'
import { t } from '../../i18n'
import type { PlayerState, Resource } from '../../game/types'
import { formatResources } from '../../logic/format'
import { getMajorCardEffect } from '../../actions/cards/major'
import { emptyResources } from '../../logic/state'
import { canPayResources } from '../../actions/effects/pay'
import { ResourceLine } from '../common/ResourceLine'

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
        const costResources = major
          ? { ...emptyResources, ...major.cost }
          : {}
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
          </button>
        )
      })}
    </div>
  </section>
)
