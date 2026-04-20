import { useState } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { PlayerState, Resource } from '../../../shared/game/types'
import { formatResources } from '../../../shared/logic/format'
import { emptyResources } from '../../../shared/logic/state-constants'
import { ResourceLine } from '../common/ResourceLine'
import { PlayerCard } from '../common/PlayerCard'

type Props = {
  locale: Locale
  availableMajorImprovements: string[]
  isSelectingMajor: boolean
  selectableMajorIds: Set<string>
  cardAvailability: Record<string, boolean>
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
  isSelectingMajor,
  selectableMajorIds,
  cardAvailability,
  isInteractive,
  resolveChoice,
  futureCardResources,
  devMode,
}: Props) => {
  const [expanded, setExpanded] = useState(false)
  const shouldExpand = expanded || isSelectingMajor

  return (
    <section className={`major-improvements ${shouldExpand ? 'expanded' : 'collapsed'}`}>
      <h2 onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        {t(locale, 'ui.majorImprovements')}
        <span className="collapse-toggle">{shouldExpand ? ' ▼' : ` ▶ (${availableMajorImprovements.length})`}</span>
      </h2>
      {shouldExpand && (
        <div className="major-row">
          {availableMajorImprovements.map((cardId) => {
            const canBuy = cardAvailability[`major:${cardId}`] !== false
            const isPendingSelectable = !isSelectingMajor || selectableMajorIds.has(cardId)
            const canInteract = isSelectingMajor
              ? isInteractive && isPendingSelectable
              : isInteractive && canBuy && isPendingSelectable
            const isDisabled = isSelectingMajor
              ? !isPendingSelectable
              : !canBuy || !isPendingSelectable
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
                  disabled={isDisabled}
                  selectable={isSelectingMajor && isPendingSelectable}
                  className={isDisabled ? 'disabled' : ''}
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
      )}
    </section>
  )
}
