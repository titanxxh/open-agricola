import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { isHollowSpaceId } from '../helpers/action-space-categories'

const CARD_ID = 'B143_ClayWarden'
/**
 * B143 Clay Warden (Occupation, B, 143)
 * Each time another player uses a Hollow accumulation space, card owner
 * gets 1 clay (plus extra per player count). Fires for both the 3P
 * `hollow` space and the 4P `hollow-4` space.
 */
const listener: CardListenerRegistration = {
  id: 'B143-clay-warden-opponent-hollow',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isHollowSpaceId(context.space?.id)) return
    const playerCount = context.state.players?.length ?? 2
    const gain: { clay: number; food?: number } = { clay: 1 }
    if (playerCount === 3) gain.clay = 2
    if (playerCount === 4) gain.food = 1
    return { flow: gainLeaf(CARD_ID, gain), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B143_ClayWarden = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Clay Warden',
    deck: 'B',
    number: 143,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: [
        'Each time another player uses the __Hollow__ accumulation space, you get 1 <CLAY>. In a 3-/4-player game, you also get 1 additional <CLAY>/<FOOD>.',
      ],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const B143_ClayWarden_impl = B143_ClayWarden.impl
