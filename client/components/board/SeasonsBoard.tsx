import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { ActionSpace, PlayerState } from '../../../shared/contract/types'
import type { SeasonId, ThroughTheSeasonsState } from '../../../shared/seasons/types'
import { seasonActionIdBySeason } from '../../../shared/projections/season-actions'
import {
  seasonActionCardCopy,
  seasonBoardAdjustments,
  seasonBoardNotes,
  seasonDisplay,
  type SeasonIconToken,
} from '../../../shared/projections/season-display'
import { getPlayerDisplayName } from '../../utils/player-name'

type Props = {
  locale: Locale
  throughTheSeasons: ThroughTheSeasonsState
  seasonActions: ActionSpace[]
  players: PlayerState[]
  canTakeAction: (space: ActionSpace) => boolean
  takeAction: (spaceId: string) => void
}

const seasonOrder: SeasonId[] = ['winter', 'spring', 'autumn', 'summer']

type SeasonIconKind =
  | 'wood'
  | 'clay'
  | 'reed'
  | 'stone'
  | 'food'
  | 'grain'
  | 'vegetable'
  | 'sheep'
  | 'field'
  | 'sow'
  | 'bake'
  | 'child-free'
  | 'barn'
  | 'fence-icon'

type SeasonIconItem = {
  icon: SeasonIconKind
  text?: string
  dividerAfter?: boolean
  arrowAfter?: boolean
}

type SeasonResourceAdjustment = {
  className: string
  labelKey?: string
  accumulation?: boolean
  items: SeasonIconItem[]
}

const SeasonIcon = ({ icon }: { icon: SeasonIconKind }) => (
  <span className={`res-icon res-icon-${icon}`} aria-hidden="true" />
)

const SeasonIconRow = ({ items }: { items: SeasonIconItem[] }) => (
  <span className="seasons-board__icon-row">
    {items.map((item, index) => (
      <span key={`${item.icon}-${index}`} className="seasons-board__icon-item">
        {item.text ? <span className="seasons-board__icon-text">{item.text}</span> : null}
        <SeasonIcon icon={item.icon} />
        {item.dividerAfter ? <span className="seasons-board__icon-separator">/</span> : null}
        {item.arrowAfter ? <span className="seasons-board__icon-arrow">→</span> : null}
      </span>
    ))}
  </span>
)

const boardLabelKeys: readonly (readonly [string, string])[] = [
  ...Object.entries(seasonDisplay).map(([season, display]) => [`season-${season}`, display.nameKey] as const),
  ...seasonBoardNotes.map((note) => [note.id, note.labelKey] as const),
]

const seasonIconByToken: Record<SeasonIconToken, SeasonIconKind> = {
  WOOD: 'wood',
  CLAY: 'clay',
  REED: 'reed',
  STONE: 'stone',
  FOOD: 'food',
  GRAIN: 'grain',
  FIELD: 'field',
  FENCE: 'fence-icon',
  STABLE: 'barn',
}

const seasonResourceAdjustments: SeasonResourceAdjustment[] = seasonBoardAdjustments.map((adjustment) => ({
  className: adjustment.id,
  labelKey: adjustment.labelKey,
  accumulation: adjustment.accumulation,
  items: adjustment.items.map(({ token, ...item }) => ({ ...item, icon: seasonIconByToken[token] })),
}))

const SeasonActionBody = ({ locale, season }: { locale: Locale; season: SeasonId }) => {
  if (season === 'winter') {
    const copy = seasonActionCardCopy.winter
    return (
      <span className="seasons-board__action-copy seasons-board__action-copy--winter">
        <span className="seasons-board__winter-family">
          <span className="seasons-board__large-plus">+</span>
          <SeasonIcon icon="child-free" />
          <span>{t(locale, copy.family.labelKey)}</span>
        </span>
        <span className="seasons-board__winter-harvest">
          {t(locale, copy.harvestPrefix.labelKey)}
          <span className="seasons-board__inline-icons">
            <span>{copy.foodPerHarvest}</span>
            <SeasonIcon icon="food" />
          </span>
          {t(locale, copy.harvestSuffix.labelKey)}
          <span className="seasons-board__inline-icons">
            <span>{copy.wood}</span>
            <SeasonIcon icon="wood" />
          </span>
        </span>
      </span>
    )
  }

  if (season === 'spring') {
    const copy = seasonActionCardCopy.spring
    return (
      <span className="seasons-board__action-copy seasons-board__action-copy--spring">
        <span className="seasons-board__spring-text">
          <span>{t(locale, copy.breeding.labelKey)}</span>
          <span>{t(locale, copy.andOr.labelKey)}</span>
          <strong>{t(locale, copy.sow.labelKey)}</strong>
        </span>
        <SeasonIcon icon="sow" />
      </span>
    )
  }

  if (season === 'summer') {
    const copy = seasonActionCardCopy.summer
    return (
      <span className="seasons-board__action-copy seasons-board__action-copy--summer">
        <span className="seasons-board__summer-plow">
          <strong>{t(locale, copy.plow.labelKey)}</strong>
          <SeasonIcon icon="field" />
        </span>
        <span className="seasons-board__action-and-or">{t(locale, copy.andOr.labelKey)}</span>
        <span className="seasons-board__summer-market">
          <strong>{t(locale, copy.bakeBread.labelKey)}</strong>
          <SeasonIcon icon="bake" />
          <span>{t(locale, copy.or.labelKey)}</span>
          <strong>{t(locale, copy.sellGrain.labelKey)}</strong>
          <span className="seasons-board__trade-line">
            <span>{`-${copy.grainSold}x`}</span>
            <SeasonIcon icon="grain" />
            <span>→</span>
            <span>{copy.foodPerGrain}</span>
            <SeasonIcon icon="food" />
          </span>
        </span>
      </span>
    )
  }

  const copy = seasonActionCardCopy.autumn
  return (
    <span className="seasons-board__action-copy seasons-board__action-copy--autumn">
      <span className="seasons-board__autumn-field">
        <span>{t(locale, copy.fieldPhase.labelKey)}</span>
        <span>{t(locale, copy.andOr.labelKey)}</span>
      </span>
      <span className="seasons-board__autumn-vegetable">
        <span>{`+${copy.vegetable}`}</span>
        <SeasonIcon icon="vegetable" />
      </span>
    </span>
  )
}

export const SeasonsBoard = ({
  locale,
  throughTheSeasons,
  seasonActions,
  players,
  canTakeAction,
  takeAction,
}: Props) => {
  const actionById = new Map(seasonActions.map((action) => [action.id, action]))
  const playerById = new Map(players.map((player) => [player.id, player]))
  const currentSeason = throughTheSeasons.currentSeason

  return (
    <section className="seasons-board" aria-label={t(locale, 'ui.seasons.board')}>
      <h2 className="seasons-board__title">{t(locale, 'ui.seasons.board')}</h2>
      <div className="seasons-board__map" data-board-art="clean-background">
        {boardLabelKeys.map(([className, labelKey]) => (
          <span key={className} className={`seasons-board__board-copy seasons-board__board-copy--${className}`}>
            {t(locale, labelKey)}
          </span>
        ))}
        {seasonResourceAdjustments.map((adjustment) => (
          <span
            key={adjustment.className}
            className={`seasons-board__resource-adjustment seasons-board__resource-adjustment--${adjustment.className}`}
          >
            {adjustment.labelKey ? (
              <span className="seasons-board__adjustment-label">{t(locale, adjustment.labelKey)}</span>
            ) : null}
            {adjustment.accumulation ? <span className="seasons-board__accumulation-arrow" aria-hidden="true" /> : null}
            <SeasonIconRow items={adjustment.items} />
          </span>
        ))}
        <div className="seasons-board__route" aria-hidden="true">
          <span className="seasons-board__route-node seasons-board__route-node--winter" />
          <span className="seasons-board__route-node seasons-board__route-node--spring" />
          <span className="seasons-board__route-node seasons-board__route-node--summer" />
          <span className="seasons-board__route-node seasons-board__route-node--autumn" />
          <span className="seasons-board__route-arrow seasons-board__route-arrow--winter-spring">➜</span>
          <span className="seasons-board__route-arrow seasons-board__route-arrow--spring-summer">➜</span>
          <span className="seasons-board__route-arrow seasons-board__route-arrow--summer-autumn">➜</span>
          <span className="seasons-board__route-arrow seasons-board__route-arrow--autumn-winter">➜</span>
        </div>
        <div className={`seasons-board__token seasons-board__token--${currentSeason}`} aria-hidden="true">
          {t(locale, `ui.seasons.token.${currentSeason}`)}
        </div>
        {seasonOrder.map((season) => {
          const action = actionById.get(seasonActionIdBySeason[season])
          const seasonName = t(locale, seasonDisplay[season].nameKey)
          const actionName = action ? t(locale, action.nameKey) : t(locale, 'ui.seasons.missingAction')
          const isCurrent = currentSeason === season
          const occupantRef = action?.takenBy[0]
          const occupant = occupantRef ? playerById.get(occupantRef.playerId) : undefined
          const occupantName = occupant
            ? getPlayerDisplayName(locale, occupant.name, players.indexOf(occupant), occupant.nameIsDefault)
            : undefined
          const occupyingWorker = occupant?.workers.find(worker => worker.id === occupantRef?.workerId)
          const isOccupied = !!occupantRef
          const available = !!action && !isOccupied && canTakeAction(action)
          const status = isOccupied ? 'occupied' : available ? 'current' : 'locked'
          const stateLabel = isCurrent ? t(locale, 'ui.seasons.current') : t(locale, 'ui.seasons.inactive')
          const availabilityLabel = available ? t(locale, 'ui.seasons.available') : t(locale, 'ui.seasons.disabled')
          return (
            <button
              key={season}
              type="button"
              className={`seasons-board__space-button seasons-board__space-button--${season}${isCurrent ? ' is-current' : ''}`}
              disabled={!available}
              aria-label={`${seasonName} ${actionName} ${stateLabel} ${availabilityLabel}`}
              title={`${seasonName}: ${actionName}`}
              data-season-status={status}
              data-season={season}
              onClick={() => {
                if (action && available) takeAction(action.id)
              }}
            >
              <span className="seasons-board__season-action-card">
                <span className="seasons-board__action-header">
                  {actionName}
                </span>
                <SeasonActionBody locale={locale} season={season} />
                <span className="seasons-board__action-footer" />
              </span>
              <span className="seasons-board__badge">
                {isOccupied ? t(locale, 'ui.seasons.occupied') : available ? t(locale, 'ui.seasons.open') : t(locale, 'ui.seasons.locked')}
              </span>
              {occupant ? (
                <span className="seasons-board__worker" data-player-color={occupant.color}
                  role="img" aria-label={occupantName} title={occupantName}>
                  <span className={`action-farmer action-farmer-${occupant.color}${occupyingWorker?.isNewborn ? ' child' : ''}`}
                    aria-hidden="true" />
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
