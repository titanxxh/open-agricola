import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import { canPlaceWorkerOnSpace } from '../../actions/helpers/placement-availability'
import { getLeftRoundActionSpaceId } from '../helpers/round-action-topology'
import { payLeaf } from '../helpers/pay-gain-node'
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
  const targetSpace = context.state.actionSpaces.find((space) => space.id === targetSpaceId)
  if (!owner || !targetSpace) return false
  return canPlaceWorkerOnSpace(context.state, owner, targetSpace, {
    actionHooks: context.actionHooks, sourceCard: CARD_ID, reserve: { food: 1 },
  })
}

const listener: CardListenerRegistration = {
  id: 'A171-sidekick-after-round-card',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter'],
  actionSpaces: 'all',
  requiresNewPlacement: true,
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
