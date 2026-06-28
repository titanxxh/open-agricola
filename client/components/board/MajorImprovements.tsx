import { useState } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { MajorSupplyStack, PlayerState, Resource } from '../../../shared/contract/types'
import { formatResources } from '../../utils/format'
import { emptyResources } from '../../../shared/contract/state-constants'
import { ResourceLine } from '../common/ResourceLine'
import { PlayerCard } from '../common/PlayerCard'

type Props = {
  locale: Locale
  availableMajorImprovements: string[]
  majorImprovementSupply?: MajorSupplyStack[]
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
  majorImprovementSupply,
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
  const stackRows = majorImprovementSupply?.length
    ? majorImprovementSupply
      .filter((stack) => stack.visibleId && availableMajorImprovements.includes(stack.visibleId))
      .map((stack) => ({ stack, cardId: stack.visibleId as string }))
    : availableMajorImprovements.map((cardId) => ({ stack: null, cardId }))
  const collapsedCount = majorImprovementSupply?.length
    ? stackRows.length
    : availableMajorImprovements.length

  return (
    <section className={`major-improvements ${shouldExpand ? 'expanded' : 'collapsed'}`}>
      <h2 onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        {t(locale, 'ui.majorImprovements')}
        <span className="collapse-toggle">{shouldExpand ? ' ▼' : ` ▶ (${collapsedCount})`}</span>
      </h2>
      {shouldExpand && (
        <div className="major-row">
          {stackRows.map(({ stack, cardId }) => {
            const canBuy = cardAvailability[`major:${cardId}`] !== false
            const isPendingSelectable = !isSelectingMajor || selectableMajorIds.has(cardId)
            const canInteract = isSelectingMajor
              ? isInteractive && isPendingSelectable
              : isInteractive && canBuy && isPendingSelectable
            const isDisabled = isSelectingMajor
              ? !isPendingSelectable
              : !canBuy || !isPendingSelectable
            const futureEntries = futureCardResources[cardId] ?? []
            const coveredCardIds = stack?.cardIds.filter((id) => id !== cardId) ?? []
            return (
              <div key={`major-${cardId}`} className="major-card-wrapper">
                {stack && stack.cardIds.length > 1 ? (
                  <span
                    className="major-stack-count"
                    data-testid={`major-stack-count-${stack.familyId}`}
                    title={stack.cardIds.join(', ')}
                  >
                    {stack.cardIds.length}
                  </span>
                ) : null}
                <div className={coveredCardIds.length > 0 ? 'major-stack' : 'major-stack single'}>
                  {coveredCardIds.map((coveredCardId) => (
                    <PlayerCard
                      key={`covered-${cardId}-${coveredCardId}`}
                      locale={locale}
                      cardId={coveredCardId}
                      cardType="major"
                      devMode={devMode}
                      className="major-stack-card major-stack-card-covered"
                    />
                  ))}
                  <PlayerCard
                    locale={locale}
                    cardId={cardId}
                    cardType="major"
                    devMode={devMode}
                    onClick={() => {
                      if (canInteract) {
                        resolveChoice(cardId)
                      }
                    }}
                    disabled={isDisabled}
                    selectable={isSelectingMajor && isPendingSelectable}
                    className={`${isDisabled ? 'disabled ' : ''}major-stack-card major-stack-card-top`}
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
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
