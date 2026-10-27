import type { ActionDefinition } from '../../../contract/types'
import { cardEffectHandChangedEvent } from '../../../session/private-hand-events'
import { completeMinorCardPass } from '../../helpers/minor-card-passing'

const ACTION_ID = 'pass-minor-card-to-left'

const readCardId = (params?: Record<string, unknown>) =>
  typeof params?.cardId === 'string' && params.cardId.length > 0 ? params.cardId : null

const removeCard = (cards: string[], cardId: string) => {
  const index = cards.indexOf(cardId)
  if (index < 0) return false
  cards.splice(index, 1)
  return true
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
    const removed = removeCard(player.minorPlayed, cardId) || removeCard(player.improvements, cardId)
    if (!removed) return { type: 'fail', errorKey: 'log.cardEffectFail' }
    if (player.cardStates) {
      delete player.cardStates[cardId]
    }
    const target = completeMinorCardPass({
      state, player, cardId, sourceActionId: ACTION_ID,
      sourceCardId: sourceCard ?? cardId, eventSink,
    })
    if (target) emitPrivateEvent?.(cardEffectHandChangedEvent(
      target.id,
      [cardId],
      'minor',
      sourceCard ?? cardId,
      ACTION_ID,
    ))
    return { type: 'ok' }
  },
}
