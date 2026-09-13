import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isActionDoableInFlowContext } from '../../actions/flow'
import { canEnterSpace } from '../../actions/helpers/placement-availability'
import { getActionDefinition } from '../../actions/index'
import { isSpaceBlocked, isSpaceOccupied } from '../../domain/space'
import { workersAvailable } from '../../domain/player'
import { getLeftRoundActionSpaceId } from '../helpers/round-action-topology'
import { payLeaf } from '../helpers/pay-gain-node'
import { evaluateWithReservedResources } from '../helpers/reserved-resources'
import type { CardImpl } from '../registry'

const CARD_ID = 'A171_Sidekick'

const sidekickChain = (context: CardListenerContext): string[] => {
  const chain = context.actionContext?.sidekickChain
  return Array.isArray(chain) ? chain.filter((entry): entry is string => typeof entry === 'string') : []
}

const getLeftTargetSpaceId = (context: CardListenerContext): string | null => {
  const currentSpaceId = context.space?.id
  if (!currentSpaceId) return null
  const chain = sidekickChain(context)
  if (chain.includes(currentSpaceId)) return null
  const leftSpaceId = getLeftRoundActionSpaceId(context.state, currentSpaceId)
  if (!leftSpaceId || chain.includes(leftSpaceId)) return null
  return leftSpaceId
}

const canPlaceOnLeftTarget = (context: CardListenerContext, targetSpaceId: string): boolean => {
  const owner = context.ownerPlayer
  if (!owner) return false
  if ((owner.resources.food ?? 0) < 1) return false
  if (workersAvailable(context.state, owner) <= 0) return false
  const targetSpace = context.state.actionSpaces.find((space) => space.id === targetSpaceId)
  if (!targetSpace) return false
  if (!canEnterSpace(targetSpace, owner, context.state)) return false
  if (isSpaceBlocked(targetSpace)) return false
  if (isSpaceOccupied(targetSpace)) return false
  return evaluateWithReservedResources(context.state, owner, { food: 1 }, (state, player) => {
    return isActionDoableInFlowContext({
      actionId: targetSpace.id,
      action: targetSpace,
      state,
      player,
      space: targetSpace,
      sourceCard: CARD_ID,
      resolveAction: getActionDefinition,
    })
  })
}

const listener: CardListenerRegistration = {
  id: 'A171-sidekick-after-round-card',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  scope: 'player',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const leftSpaceId = getLeftTargetSpaceId(context)
    if (!leftSpaceId || !canPlaceOnLeftTarget(context, leftSpaceId)) return
    const chain = sidekickChain(context)
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          {
            type: 'leaf',
            actionId: 'place-farmer-on-space',
            sourceCard: CARD_ID,
            params: {
              spaceId: leftSpaceId,
              sourceCard: CARD_ID,
            },
            actionContext: {
              sidekickChain: [...chain, context.space!.id],
            },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A171_Sidekick = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Sidekick',
    deck: 'A',
    number: 171,
    category: 'ACTIONS_BOOSTER',
    desc: ['Immediately after each time you place a person on an action space card, you can pay 1 <FOOD> to place another person on the card immediately left to it (and so on).'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const A171_Sidekick_impl = A171_Sidekick.impl
