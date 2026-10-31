import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { ActionSpace, PlayerState } from '../../../shared/contract/types'
import type { SeasonId, ThroughTheSeasonsState } from '../../../shared/seasons/types'
import { seasonActionIdBySeason } from '../../../shared/projections/season-actions'
import { seasonBoardAdjustments, seasonBoardNotes, seasonDisplay } from '../../../shared/projections/season-display'
import { getPlayerDisplayName } from '../../utils/player-name'
import { SeasonActionCard, SeasonAdjustment, SeasonBoardCopy } from './SeasonBoardPieces'

type Props = {
  locale: Locale
  throughTheSeasons: ThroughTheSeasonsState
  seasonActions: ActionSpace[]
  players: PlayerState[]
  canTakeAction: (space: ActionSpace) => boolean
  takeAction: (spaceId: string) => void
}

const seasonOrder: SeasonId[] = ['winter', 'spring', 'autumn', 'summer']

const boardLabelKeys: readonly (readonly [string, string])[] = [
  ...Object.entries(seasonDisplay).map(([season, display]) => [`season-${season}`, display.nameKey] as const),
  ...seasonBoardNotes.map((note) => [note.id, note.labelKey] as const),
]

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
        {boardLabelKeys.map(([id, labelKey]) => (
          <SeasonBoardCopy key={id} id={id}>{t(locale, labelKey)}</SeasonBoardCopy>
        ))}
        {seasonBoardAdjustments.map((adjustment) => (
          <SeasonAdjustment key={adjustment.id} locale={locale} adjustment={adjustment} />
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
              <SeasonActionCard locale={locale} season={season} actionName={actionName} />
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
