import { applyAnimalPayment, isAnimalResourceKey } from '../../domain/animal-payment'
import { receiveFromPlayerLeaf } from './receive'
import type { ActionDefinition, ActionFlow } from '../../contract/types'
import { marketplaceRequest, validateMarketplaceTransfers } from '../../team/marketplace'

export const marketplaceAction: ActionDefinition = {
  id: 'marketplace', nameKey: 'actions.marketplace.name', descriptionKey: 'actions.marketplace.description',
  roundAvailable: 1, gainPerRound: {}, players: [4, 6],
  canBeExecutedByPlayer(state, player) {
    const request = marketplaceRequest(state, player)
    return request.teammates.length > 0 && request.goods.some(good => (request.availableByResource[good] ?? 0) >= 2
      || request.teammates.some(mate => (mate.availableByResource[good] ?? 0) >= 2))
  },
  execute: ({ state, player }) => ({ type: 'request', request: { ...marketplaceRequest(state, player), anytimeWindow: { allowed: false } }, promptKey: 'ui.marketplace.prompt' }),
  resolveChoice: ({ state, player, eventSink }, _choice, payload) => {
    const validation = validateMarketplaceTransfers(state, player, payload?.marketplaceTransfers)
    if (!validation.ok) return { type: 'fail', errorKey: validation.error, recoverable: true }
    const children: ActionFlow[] = []
    for (const { giver, receiver, resource, amount } of validation.settlements) {
      if (isAnimalResourceKey(resource)) applyAnimalPayment(giver, state, resource, amount + 1)
      else giver.resources[resource] = (giver.resources[resource] ?? 0) - amount - 1
      eventSink?.emit<'resource.moved'>({
        type: 'resource.moved', resources: { [resource]: 1 },
        from: { kind: 'player', playerId: giver.id }, to: { kind: 'supply' }, reason: 'return',
      })
      children.push(receiveFromPlayerLeaf({ giverPlayerId: giver.id, receiverPlayerId: receiver.id,
        resources: { [resource]: amount }, marketplaceTax: 1 }))
    }
    return { type: 'flow', flow: { type: 'seq', children } }
  },
}
