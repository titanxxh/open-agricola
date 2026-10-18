import type { ActionDefinition, Resource } from '../../../contract/types'
import { getCardStack, popFromCardStack } from '../../../cards/helpers/card-state'
import { REAL_RESOURCE_KEYS } from '../../../contract/resource-keys'
import { receiveFromCardLeaf } from '../receive'

const realResourceKeys = new Set<string>(REAL_RESOURCE_KEYS)

const isRealResourceKey = (resource: string): resource is keyof Resource =>
  realResourceKeys.has(resource)

export const popCardStackAction: ActionDefinition = {
  id: 'pop-card-stack',
  nameKey: 'actions.pop-card-stack.name',
  descriptionKey: 'actions.pop-card-stack.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  previewEffect: ({ player, sourceCard }) => {
    const resource = sourceCard ? getCardStack(player, sourceCard).at(-1) : undefined
    return sourceCard && resource && isRealResourceKey(resource) ? {
      kind: 'resourceMovement', resources: { [resource]: 1 }, from: { kind: 'card', cardId: sourceCard }, to: { kind: 'player' },
    } : undefined
  },
  execute: ({ player, sourceCard, eventSink }) => {
    if (!sourceCard) {
      return { type: 'fail', errorKey: 'log.actionFail' }
    }
    const resource = popFromCardStack(player, sourceCard)
    if (!resource) {
      return { type: 'ok' }
    }
    if (!isRealResourceKey(resource)) {
      eventSink?.emit<'card.stackChanged'>({
        type: 'card.stackChanged',
        cardId: sourceCard,
        targetPlayerId: player.id,
        delta: -1,
        reason: 'take',
      })
      return { type: 'ok' }
    }
    const gain: Partial<Resource> = { [resource]: 1 }
    eventSink?.emit<'card.stackChanged'>({
      type: 'card.stackChanged',
      cardId: sourceCard,
      targetPlayerId: player.id,
      resources: gain,
      delta: -1,
      reason: 'take',
    })
    return { type: 'flow', flow: receiveFromCardLeaf(sourceCard, gain) }
  },
}
