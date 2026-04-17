import type { ActionDefinition } from '../../game/types'
import { setCardFlag } from '../../cards/helpers/card-state'
import { getRoundPlacementDetails } from '../../cards/helpers/round-placement'
import { removeWorkerRef, spaceHasPlayer } from '../../game/space'

const MEETING_PLACE_IDS = new Set(['meeting-place'])

export const returnFirstWorkerHomeAction: ActionDefinition = {
  id: 'return-first-worker-home',
  nameKey: 'actions.return-first-worker-home.name',
  descriptionKey: 'actions.return-first-worker-home.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params, sourceCard }) => {
    const first = getRoundPlacementDetails(player)[0]
    if (!first || MEETING_PLACE_IDS.has(first.spaceId)) {
      if (sourceCard && params?.flagSourceCard) {
        setCardFlag(player, sourceCard, true)
      }
      return sourceCard && params?.logCardTrigger
        ? { type: 'ok', logKey: 'log.cardEffectTrigger', logParams: { cardId: sourceCard } }
        : { type: 'ok' }
    }
    const firstSpace = state.actionSpaces.find((space) => space.id === first.spaceId)
    if (!firstSpace || !spaceHasPlayer(firstSpace, player.id)) {
      if (sourceCard && params?.flagSourceCard) {
        setCardFlag(player, sourceCard, true)
      }
      return sourceCard && params?.logCardTrigger
        ? { type: 'ok', logKey: 'log.cardEffectTrigger', logParams: { cardId: sourceCard } }
        : { type: 'ok' }
    }
    removeWorkerRef(firstSpace, player.id, first.workerId)
    if (sourceCard && params?.flagSourceCard) {
      setCardFlag(player, sourceCard, true)
    }
    return sourceCard && params?.logCardTrigger
      ? { type: 'ok', logKey: 'log.cardEffectTrigger', logParams: { cardId: sourceCard } }
      : { type: 'ok' }
  },
}
