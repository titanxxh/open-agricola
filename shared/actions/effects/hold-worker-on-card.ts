import type { ActionDefinition } from '../../game/types'
import { holdWorkerOnCard } from '../../cards/helpers/card-held-workers'

export const holdWorkerOnCardAction: ActionDefinition = {
  id: 'hold-worker-on-card',
  nameKey: 'actions.hold-worker-on-card.name',
  descriptionKey: 'actions.hold-worker-on-card.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, sourceCard, params }) => {
    if (!sourceCard) {
      return { type: 'fail', logKey: 'log.actionFail' }
    }
    const workerId = (params as { workerId?: string } | undefined)?.workerId
    if (typeof workerId !== 'string' || !workerId) {
      return { type: 'fail', logKey: 'log.actionFail' }
    }
    holdWorkerOnCard(player, sourceCard, workerId)
    return { type: 'ok' }
  },
}
