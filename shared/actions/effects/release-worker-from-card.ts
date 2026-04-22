import type { ActionDefinition } from '../../game/types'
import { releaseWorkerFromCard } from '../../cards/helpers/card-held-workers'

export const releaseWorkerFromCardAction: ActionDefinition = {
  id: 'release-worker-from-card',
  nameKey: 'actions.release-worker-from-card.name',
  descriptionKey: 'actions.release-worker-from-card.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, sourceCard }) => {
    if (!sourceCard) {
      return { type: 'fail', logKey: 'log.actionFail' }
    }
    releaseWorkerFromCard(player, sourceCard)
    return { type: 'ok' }
  },
}
