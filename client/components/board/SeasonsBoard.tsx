import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { ActionSpace } from '../../../shared/contract/types'
import type { SeasonId, ThroughTheSeasonsState } from '../../../shared/seasons/types'
import { seasonActionIdBySeason } from '../../../shared/seasons/action-spaces'

type Props = {
  locale: Locale
  throughTheSeasons: ThroughTheSeasonsState
  seasonActions: ActionSpace[]
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

export const SeasonsBoard = ({
  locale,
  throughTheSeasons,
  seasonActions,
  canTakeAction,
  takeAction,
}: Props) => {
  const actionById = new Map(seasonActions.map((action) => [action.id, action]))

  return (
    <section className="seasons-board" aria-label={t(locale, 'ui.seasons.board')}>
      <div className="seasons-board__center" aria-hidden="true">
        <span className="seasons-board__counter">{t(locale, seasonLabelKey[throughTheSeasons.currentSeason])}</span>
      </div>
      {seasonOrder.map((season) => {
        const action = actionById.get(seasonActionIdBySeason[season])
        const seasonName = t(locale, seasonLabelKey[season])
        const actionName = action ? t(locale, action.nameKey) : t(locale, 'ui.seasons.missingAction')
        const isCurrent = throughTheSeasons.currentSeason === season
        const available = !!action && canTakeAction(action)
        const stateLabel = isCurrent ? t(locale, 'ui.seasons.current') : t(locale, 'ui.seasons.inactive')
        const availabilityLabel = available ? t(locale, 'ui.seasons.available') : t(locale, 'ui.seasons.disabled')
        return (
          <button
            key={season}
            type="button"
            className={`seasons-board__tile seasons-board__tile--${season}${isCurrent ? ' is-current' : ''}`}
            disabled={!available}
            aria-label={`${seasonName} ${actionName} ${stateLabel} ${availabilityLabel}`}
            title={`${seasonName}: ${actionName}`}
            onClick={() => {
              if (action && available) takeAction(action.id)
            }}
          >
            <span className="seasons-board__season">{seasonName}</span>
            <span className="seasons-board__action">{actionName}</span>
          </button>
        )
      })}
    </section>
  )
}
