import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { canEnterSpace } from '../../actions/helpers/placement-availability'
import { workersAvailable } from '../../domain/player'
import { isSpaceBlocked } from '../../domain/space'
import { isResourceMarketSpaceId } from '../helpers/action-space-categories'
import type { CardImpl } from '../registry'

const CARD_ID = 'B178_TagAlong'

const canFollow = (context: CardListenerContext): boolean => {
  const owner = context.ownerPlayer
  const space = context.space
  if (!owner || !space) return false
  if (context.player.id === owner.id) return false
  if (!isResourceMarketSpaceId(space.id)) return false
  if (workersAvailable(context.state, owner) <= 0) return false
  if (!canEnterSpace(space, owner, context.state)) return false
  if (isSpaceBlocked(space)) return false
  return space.canBeExecutedByPlayer(context.state, owner)
}

const listener: CardListenerRegistration = {
  id: 'B178-tag-along-after-resource-market',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!canFollow(context)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'place-farmer-on-space',
        optional: true,
        sourceCard: CARD_ID,
        targetPlayerId: context.ownerPlayer!.id,
        params: {
          spaceId: context.space!.id,
          allowOccupied: true,
          sourceCard: CARD_ID,
        },
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B178_TagAlong = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Tag-Along',
    deck: 'B',
    number: 178,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Immediately after each time another player uses the "Resource Market" action space, you can also place a person there to take the action as well.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const B178_TagAlong_impl = B178_TagAlong.impl
