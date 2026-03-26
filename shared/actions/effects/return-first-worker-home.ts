import type { ActionDefinition } from '../../game/types'
import { setCardFlag } from '../../cards/helpers/card-state'
import { getRoundPlacementOrder } from '../../cards/helpers/round-placement'

const MEETING_PLACE_IDS = new Set(['meeting-place'])

export const returnFirstWorkerHomeAction: ActionDefinition = {
  id: 'return-first-worker-home',
  nameKey: 'actions.return-first-worker-home.name',
  descriptionKey: 'actions.return-first-worker-home.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params, sourceCard }) => {
    const [firstSpaceId] = getRoundPlacementOrder(player)
    if (!firstSpaceId || MEETING_PLACE_IDS.has(firstSpaceId)) {
      if (sourceCard && params?.flagSourceCard) {
        setCardFlag(player, sourceCard, true)
      }
      return sourceCard && params?.logCardTrigger
        ? { type: 'ok', logKey: 'log.cardEffectTrigger', logParams: { cardId: sourceCard } }
        : { type: 'ok' }
    }
    const firstSpace = state.actionSpaces.find((space) => space.id === firstSpaceId)
    if (!firstSpace || firstSpace.takenBy !== player.id) {
      if (sourceCard && params?.flagSourceCard) {
        setCardFlag(player, sourceCard, true)
      }
      return sourceCard && params?.logCardTrigger
        ? { type: 'ok', logKey: 'log.cardEffectTrigger', logParams: { cardId: sourceCard } }
        : { type: 'ok' }
    }
    firstSpace.takenBy = null
    player.workersAvailable += 1
    if (sourceCard && params?.flagSourceCard) {
      setCardFlag(player, sourceCard, true)
    }
    return sourceCard && params?.logCardTrigger
      ? { type: 'ok', logKey: 'log.cardEffectTrigger', logParams: { cardId: sourceCard } }
      : { type: 'ok' }
  },
}
