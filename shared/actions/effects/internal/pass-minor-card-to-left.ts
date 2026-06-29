import type { ActionDefinition, PlayerState } from '../../../contract/types'
import { cardEffectHandChangedEvent } from '../../../session/private-hand-events'

const ACTION_ID = 'pass-minor-card-to-left'

const readCardId = (params?: Record<string, unknown>) =>
  typeof params?.cardId === 'string' && params.cardId.length > 0 ? params.cardId : null

const removeCard = (cards: string[], cardId: string) => {
  const index = cards.indexOf(cardId)
  if (index < 0) return false
  cards.splice(index, 1)
  return true
}

const leftPlayerOf = (players: PlayerState[], player: PlayerState) => {
  const index = players.findIndex((candidate) => candidate.id === player.id)
  if (index < 0 || players.length === 0) return undefined
  return players[(index + 1) % players.length]
}

export const passMinorCardToLeftAction: ActionDefinition = {
  id: ACTION_ID,
  nameKey: 'actions.pass-minor-card-to-left.name',
  descriptionKey: 'actions.pass-minor-card-to-left.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params, sourceCard, emitPrivateEvent, eventSink }) => {
    const cardId = readCardId(params)
    if (!cardId) return { type: 'fail', errorKey: 'log.cardEffectFail' }
    const target = leftPlayerOf(state.players, player)
    if (!target || target.id === player.id) return { type: 'fail', errorKey: 'log.cardEffectFail' }
    const removed = removeCard(player.minorPlayed, cardId) || removeCard(player.improvements, cardId)
    if (!removed) return { type: 'fail', errorKey: 'log.cardEffectFail' }
    if (player.cardStates) {
      delete player.cardStates[cardId]
    }
    if (!target.minorHand.includes(cardId)) {
      target.minorHand.push(cardId)
    }
    eventSink?.emit<'card.passed'>({
      type: 'card.passed',
      cardId,
      fromPlayerId: player.id,
      toPlayerId: target.id,
      sourceActionId: ACTION_ID,
      sourceCardId: sourceCard ?? cardId,
    })
    emitPrivateEvent?.(cardEffectHandChangedEvent(
      target.id,
      [cardId],
      'minor',
      sourceCard ?? cardId,
      ACTION_ID,
    ))
    return { type: 'ok' }
  },
}
