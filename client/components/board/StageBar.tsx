import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'

export const STAGE_BREAKPOINTS = [4, 7, 9, 11, 13, 14] as const

interface Props {
  currentRound: number
  totalRounds?: number
  locale?: Locale
}

export function StageBar({ currentRound, totalRounds = 14, locale = 'zh' }: Props) {
  const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1)
  const nextHarvest = STAGE_BREAKPOINTS.find((r) => r >= currentRound)
  const remaining = nextHarvest ? nextHarvest - currentRound : 0

  return (
    <div className="stage-bar">
      <div className="stage-bar__cells" role="list">
        {rounds.map((r) => {
          const isHarvest = (STAGE_BREAKPOINTS as readonly number[]).includes(r)
          const isCurrent = r === currentRound
          const isPast = r < currentRound
          const label = t(locale, isHarvest ? 'log.harvest' : 'ui.roundHeader', { round: r })
          return (
            <div
              key={r}
              role="listitem"
              data-round={r}
              className={[
                'stage-bar__cell',
                isCurrent && 'is-current',
                isHarvest && 'is-harvest',
                isPast && 'is-past',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={label}
              title={label}
            >
              {isHarvest ? <span className="res-icon res-icon-grain" aria-hidden /> : r}
            </div>
          )
        })}
      </div>
      {nextHarvest && nextHarvest > currentRound && (
        <p className="stage-bar__hint">
          {t(locale, 'ui.nextHarvestHint', { remaining, round: nextHarvest })}
        </p>
      )}
    </div>
  )
}
