import type { Locale } from '../../i18n'
import { t } from '../../i18n'
import type { ActionSpace, PlayerState } from '../../game/types'
import { formatResources } from '../../logic/format'
import { roundStageSlots } from '../../logic/state'

type RoundSlot = {
  round: number
  action?: ActionSpace
}

type Props = {
  locale: Locale
  baseActions: ActionSpace[]
  roundSlots: RoundSlot[]
  currentPlayer: PlayerState
  players: PlayerState[]
  canTakeAction: (space: ActionSpace, player: PlayerState) => boolean
  takeAction: (space: ActionSpace) => void
  currentRound: number
}

export const ActionBoard = ({
  locale,
  baseActions,
  roundSlots,
  currentPlayer,
  players,
  canTakeAction,
  takeAction,
  currentRound,
}: Props) => {
  const stageGroups = (() => {
    const groups: { stage: number; slots: RoundSlot[] }[] = []
    let offset = 0
    roundStageSlots.forEach(({ stage, count }) => {
      groups.push({ stage, slots: roundSlots.slice(offset, offset + count) })
      offset += count
    })
    return groups
  })()

  const renderRoundSlot = (slot: RoundSlot) => {
    const isOpen = currentRound >= slot.round
    const action = slot.action
    if (!action) {
      return (
        <div key={`round-${slot.round}`} className="round-slot">
          <div className="round-label">
            {t(locale, 'ui.roundLabel', { round: slot.round })}
          </div>
          <div className="round-card locked">{t(locale, 'ui.roundHidden')}</div>
        </div>
      )
    }
    if (!isOpen) {
      return (
        <div key={`round-${slot.round}`} className="round-slot">
          <div className="round-label">
            {t(locale, 'ui.roundLabel', { round: slot.round })}
          </div>
          <div className="round-card locked">{t(locale, 'ui.roundLocked')}</div>
        </div>
      )
    }
    const canUse = canTakeAction(action, currentPlayer)
    const takenPlayer = players.find((player) => player.id === action.takenBy)
    return (
      <div key={`round-${slot.round}`} className="round-slot">
        <div className="round-label">
          {t(locale, 'ui.roundLabel', { round: slot.round })}
        </div>
        <button
          className={`action-card ${action.takenBy ? 'taken' : ''}`}
          onClick={() => takeAction(action)}
          disabled={!canUse}
        >
          <div className="action-title">{t(locale, action.nameKey)}</div>
          <div className="action-desc">{t(locale, action.descriptionKey)}</div>
          <div className="action-res">
            {formatResources(locale, action.resources, true) ||
              t(locale, 'ui.noAccumulation')}
          </div>
          <div className="action-meta">
            {t(locale, 'ui.roundOpen', { round: slot.round })}
          </div>
          {takenPlayer ? (
            <div className={`meeple meeple-${takenPlayer.color}`}>
              <span className="meeple-text">{takenPlayer.name}</span>
            </div>
          ) : null}
        </button>
      </div>
    )
  }

  return (
    <section className="actions">
      <h2>{t(locale, 'ui.actionArea')}</h2>
      <div className="action-board">
        <div className="action-base">
          {baseActions.map((space) => {
            const canUse = canTakeAction(space, currentPlayer)
            const isTaken = !!space.takenBy
            const takenPlayer = players.find((player) => player.id === space.takenBy)
            return (
              <button
                key={space.id}
                className={`action-card ${isTaken ? 'taken' : ''}`}
                onClick={() => takeAction(space)}
                disabled={!canUse}
              >
                <div className="action-title">{t(locale, space.nameKey)}</div>
                <div className="action-desc">{t(locale, space.descriptionKey)}</div>
                <div className="action-res">
                  {formatResources(locale, space.resources, true) ||
                    t(locale, 'ui.noAccumulation')}
                </div>
                <div className="action-meta">{t(locale, 'ui.baseActions')}</div>
                {takenPlayer ? (
                  <div className={`meeple meeple-${takenPlayer.color}`}>
                    <span className="meeple-text">{takenPlayer.name}</span>
                  </div>
                ) : null}
              </button>
            )
          })}
        </div>
        <div className="action-rounds">
          {stageGroups.map((group) => (
            <div key={`stage-${group.stage}`} className="round-stage">
              <div className="stage-label">
                {t(locale, 'ui.stageLabel', { stage: group.stage })}
              </div>
              <div className="round-stage-row">
                {group.slots.map((slot) => renderRoundSlot(slot))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
