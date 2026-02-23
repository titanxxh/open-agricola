import { useMemo } from 'react'
import type { Locale } from '../../i18n'
import { t } from '../../i18n'
import type { ActionSpace, FutureMeeple, PlayerState, Resource } from '../../game/types'
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
  futureMeeples: FutureMeeple[]
  canTakeAction: (space: ActionSpace, player: PlayerState) => boolean
  takeAction: (space: ActionSpace) => void
  currentRound: number
  devMode: boolean
}

export const ActionBoard = ({
  locale,
  baseActions,
  roundSlots,
  currentPlayer,
  players,
  futureMeeples,
  canTakeAction,
  takeAction,
  currentRound,
  devMode,
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

  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  )

  const buildStackItems = (action: ActionSpace) => {
    const items = new Map<
      string,
      { resource: keyof Resource; amount: number; player?: PlayerState }
    >()
    const addItem = (
      resource: keyof Resource,
      amount: number,
      player?: PlayerState,
    ) => {
      if (amount <= 0) return
      const key = `${player?.id ?? 'none'}:${resource}`
      const existing = items.get(key)
      if (existing) {
        existing.amount += amount
        return
      }
      items.set(key, { resource, amount, player })
    }
    Object.entries(action.resources).forEach(([key, value]) => {
      const amount = value ?? 0
      if (amount <= 0) return
      addItem(key as keyof Resource, amount)
    })
    futureMeeples
      .filter((entry) => entry.actionId === action.id)
      .forEach((entry) => {
        const owner = playerById.get(entry.playerId)
        Object.entries(entry.resources).forEach(([key, value]) => {
          const amount = value ?? 0
          if (amount <= 0) return
          addItem(key as keyof Resource, amount, owner)
        })
      })
    return Array.from(items.values())
  }

  const renderStack = (action: ActionSpace) => {
    const items = buildStackItems(action)
    if (items.length === 0) return null
    return (
      <div className="action-stack">
        {items.map((item, index) => {
          const label = `${t(locale, `resources.${item.resource}`)} ${item.amount}`
          const title = item.player ? `${item.player.name}: ${label}` : label
          return (
            <div
              key={`stack-${action.id}-${index}`}
              className={`resource-chip resource-${item.resource}`}
              title={title}
              data-resource={item.resource}
              data-amount={item.amount}
            >
              {item.player ? (
                <span className={`resource-owner meeple-${item.player.color}`} />
              ) : null}
              <span className="resource-chip-text">{label}</span>
            </div>
          )
        })}
      </div>
    )
  }

  const renderRoundSlot = (slot: RoundSlot) => {
    const isOpen = devMode || currentRound >= slot.round
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
    const canUse = isOpen && canTakeAction(action, currentPlayer)
    const takenPlayer = players.find((player) => player.id === action.takenBy)
    return (
      <div key={`round-${slot.round}`} className="round-slot">
        <div className="round-label">
          {t(locale, 'ui.roundLabel', { round: slot.round })}
        </div>
        <button
          className={`action-card ${action.takenBy ? 'taken' : ''}${
            isOpen ? '' : ' locked'
          }`}
          onClick={() => takeAction(action)}
          disabled={!canUse}
        >
          {isOpen ? (
            <>
              <div className="action-title">{t(locale, action.nameKey)}</div>
              <div className="action-desc">{t(locale, action.descriptionKey)}</div>
            </>
          ) : null}
          {renderStack(action)}
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
                {renderStack(space)}
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
