import type { GameState, PlayerState } from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { findPlayerIndexById } from '../../domain/player'

export const completeMinorCardPass = ({
  state, player, cardId, sourceActionId, sourceCardId, eventSink,
}: {
  state: Pick<GameState, 'players'>
  player: PlayerState
  cardId: string
  sourceActionId: string
  sourceCardId: string
  eventSink?: EventSink
}): PlayerState | undefined => {
  if (state.players.length === 1) {
    eventSink?.emit<'card.destroyed'>({
      type: 'card.destroyed', cardId, playerId: player.id, reason: 'passed',
      sourceActionId, sourceCardId,
    })
    return undefined
  }
  const index = findPlayerIndexById(state, player.id)
  const recipient = state.players[(index + 1) % state.players.length]
  if (index < 0 || !recipient) throw new Error('Passing player must be a participant')
  if (!recipient.minorHand.includes(cardId)) recipient.minorHand.push(cardId)
  eventSink?.emit<'card.passed'>({
    type: 'card.passed', cardId, fromPlayerId: player.id, toPlayerId: recipient.id,
    sourceActionId, sourceCardId,
  })
  return recipient
}
