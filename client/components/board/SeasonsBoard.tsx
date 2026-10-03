import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { ActionSpace, PlayerState } from '../../../shared/contract/types'
import type { SeasonId, ThroughTheSeasonsState } from '../../../shared/seasons/types'
import { seasonActionIdBySeason } from '../../../shared/projections/season-actions'

type Props = {
  locale: Locale
  throughTheSeasons: ThroughTheSeasonsState
  seasonActions: ActionSpace[]
  players: PlayerState[]
  canTakeAction: (space: ActionSpace) => boolean
  takeAction: (spaceId: string) => void
}

const seasonOrder: SeasonId[] = ['winter', 'spring', 'autumn', 'summer']

const seasonLabelKey: Record<SeasonId, string> = {
  winter: 'ui.seasons.winter',
  spring: 'ui.seasons.spring',
  summer: 'ui.seasons.summer',
  autumn: 'ui.seasons.autumn',
}

const englishSeasonToken: Record<SeasonId, string> = {
  winter: 'W', spring: 'Sp', summer: 'S', autumn: 'A',
}

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

const boardLabelKeys = [
  ['season-winter', 'ui.seasons.winter'],
  ['season-spring', 'ui.seasons.spring'],
  ['season-summer', 'ui.seasons.summer'],
  ['season-autumn', 'ui.seasons.autumn'],
  ['winter-fishing', 'ui.seasons.boardCopy.winterFishing'],
  ['summer-no-heating', 'ui.seasons.boardCopy.summerNoHeating'],
] as const

const seasonResourceAdjustments: SeasonResourceAdjustment[] = [
  {
    className: 'winter-basic',
    accumulation: true,
    items: [{ icon: 'clay', text: '-1' }, { icon: 'reed', text: '-1' }],
  },
  {
    className: 'winter-plow',
    labelKey: 'ui.seasons.boardCopy.winterPlowShort',
    items: [{ icon: 'food', text: '1', arrowAfter: true }, { icon: 'field' }],
  },
  {
    className: 'spring-basic',
    accumulation: true,
    items: [{ icon: 'wood', text: '-1' }, { icon: 'stone', text: '+1' }],
  },
  {
    className: 'spring-fences',
    labelKey: 'ui.seasons.boardCopy.springFencesShort',
    items: [{ icon: 'fence-icon', text: '+2' }],
  },
  {
    className: 'summer-basic',
    accumulation: true,
    items: [{ icon: 'clay', text: '+1' }, { icon: 'stone', text: '-1' }],
  },
  {
    className: 'summer-fishing',
    labelKey: 'actions.fishing.name',
    items: [{ icon: 'food', text: '+1' }],
  },
  {
    className: 'summer-build-rooms',
    labelKey: 'ui.seasons.boardCopy.summerBuildRoomsShort',
    items: [{ icon: 'barn', text: '1' }],
  },
  {
    className: 'summer-day-laborer',
    labelKey: 'actions.day-laborer.name',
    items: [{ icon: 'grain', text: '+1' }],
  },
  {
    className: 'autumn-basic',
    accumulation: true,
    items: [{ icon: 'wood', text: '+1' }, { icon: 'reed', text: '+1' }],
  },
  {
    className: 'autumn-major',
    labelKey: 'ui.seasons.boardCopy.autumnMajorShort',
    items: [
      { icon: 'wood', text: '-1', dividerAfter: true },
      { icon: 'clay', dividerAfter: true },
      { icon: 'reed', dividerAfter: true },
      { icon: 'stone' },
    ],
  },
]

const SeasonActionBody = ({ locale, season }: { locale: Locale; season: SeasonId }) => {
  if (season === 'winter') {
    return (
      <span className="seasons-board__action-copy seasons-board__action-copy--winter">
        <span className="seasons-board__winter-family">
          <span className="seasons-board__large-plus">+</span>
          <SeasonIcon icon="child-free" />
          <span>{t(locale, 'ui.seasons.actionCard.winter.family')}</span>
        </span>
        <span className="seasons-board__winter-harvest">
          {t(locale, 'ui.seasons.actionCard.winter.harvestPrefix')}
          <span className="seasons-board__inline-icons">
            <span>1</span>
            <SeasonIcon icon="food" />
          </span>
          {t(locale, 'ui.seasons.actionCard.winter.harvestSuffix')}
          <span className="seasons-board__inline-icons">
            <span>2</span>
            <SeasonIcon icon="wood" />
          </span>
        </span>
      </span>
    )
  }

  if (season === 'spring') {
    return (
      <span className="seasons-board__action-copy seasons-board__action-copy--spring">
        <span className="seasons-board__spring-text">
          <span>{t(locale, 'ui.seasons.actionCard.spring.breeding')}</span>
          <span>{t(locale, 'ui.seasons.actionCard.spring.andOr')}</span>
          <strong>{t(locale, 'ui.seasons.actionCard.spring.sow')}</strong>
        </span>
        <SeasonIcon icon="sow" />
      </span>
    )
  }

  if (season === 'summer') {
    return (
      <span className="seasons-board__action-copy seasons-board__action-copy--summer">
        <span className="seasons-board__summer-plow">
          <strong>{t(locale, 'ui.seasons.actionCard.summer.plow')}</strong>
          <SeasonIcon icon="field" />
        </span>
        <span className="seasons-board__action-and-or">{t(locale, 'ui.seasons.actionCard.summer.andOr')}</span>
        <span className="seasons-board__summer-market">
          <strong>{t(locale, 'ui.seasons.actionCard.summer.bakeBread')}</strong>
          <SeasonIcon icon="bake" />
          <span>{t(locale, 'ui.seasons.actionCard.summer.or')}</span>
          <strong>{t(locale, 'ui.seasons.actionCard.summer.sellGrain')}</strong>
          <span className="seasons-board__trade-line">
            <span>-1x</span>
            <SeasonIcon icon="grain" />
            <span>→</span>
            <span>4</span>
            <SeasonIcon icon="food" />
          </span>
        </span>
      </span>
    )
  }

  return (
    <span className="seasons-board__action-copy seasons-board__action-copy--autumn">
      <span className="seasons-board__autumn-field">
        <span>{t(locale, 'ui.seasons.actionCard.autumn.fieldPhase')}</span>
        <span>{t(locale, 'ui.seasons.actionCard.autumn.andOr')}</span>
      </span>
      <span className="seasons-board__autumn-vegetable">
        <span>+1</span>
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
          {locale === 'zh' ? t(locale, `ui.seasons.short.${currentSeason}`) : englishSeasonToken[currentSeason]}
        </div>
        {seasonOrder.map((season) => {
          const action = actionById.get(seasonActionIdBySeason[season])
          const seasonName = t(locale, seasonLabelKey[season])
          const actionName = action ? t(locale, action.nameKey) : t(locale, 'ui.seasons.missingAction')
          const isCurrent = currentSeason === season
          const occupantRef = action?.takenBy[0]
          const occupant = occupantRef ? playerById.get(occupantRef.playerId) : undefined
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
                <span className="seasons-board__worker" data-player-color={occupant.color}>
                  {occupant.name}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
