export const STAGE_BREAKPOINTS = [4, 7, 9, 11, 13, 14] as const

interface Props {
  currentRound: number
  totalRounds?: number
}

export function StageBar({ currentRound, totalRounds = 14 }: Props) {
  const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1)
  const nextHarvest = STAGE_BREAKPOINTS.find((r) => r >= currentRound)
  const remaining = nextHarvest ? nextHarvest - currentRound : 0

  return (
    <div className="stage-bar">
      <div className="stage-bar__cells">
        {rounds.map((r) => {
          const isHarvest = (STAGE_BREAKPOINTS as readonly number[]).includes(r)
          const isCurrent = r === currentRound
          const isPast = r < currentRound
          return (
            <div
              key={r}
              data-round={r}
              className={[
                'stage-bar__cell',
                isCurrent && 'is-current',
                isHarvest && 'is-harvest',
                isPast && 'is-past',
              ]
                .filter(Boolean)
                .join(' ')}
              title={isHarvest ? `第 ${r} 轮：收获` : `第 ${r} 轮`}
            >
              {isHarvest ? '🌾' : r}
            </div>
          )
        })}
      </div>
      {nextHarvest && nextHarvest > currentRound && (
        <p className="stage-bar__hint">
          还有 {remaining} 轮到下次收获（第 {nextHarvest} 轮）
        </p>
      )}
    </div>
  )
}
