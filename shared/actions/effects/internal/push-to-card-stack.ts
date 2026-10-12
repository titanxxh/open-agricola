import type { ActionDefinition } from '../../../contract/types'
import { pushToCardStack } from '../../../cards/helpers/card-state'

export const pushCardStackAction: ActionDefinition = {
  id: 'push-to-card-stack',
  nameKey: 'actions.push-to-card-stack.name',
  descriptionKey: 'actions.push-to-card-stack.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  previewEffect: ({ sourceCard, params }) => sourceCard && typeof params?.item === 'string' ? { kind: 'cardStack', cardId: sourceCard, item: params.item, amount: 1 } : undefined,
  execute: ({ player, sourceCard, params }) => {
    if (!sourceCard) {
      return { type: 'fail', errorKey: 'log.actionFail' }
    }
    const item = (params as { item?: string } | undefined)?.item
    if (!item) {
      return { type: 'fail', errorKey: 'log.actionFail' }
    }
    pushToCardStack(player, sourceCard, [item])
    return { type: 'ok' }
  },
}
