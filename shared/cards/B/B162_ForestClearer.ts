import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { sumResourceMovedToPlayer } from '../helpers/event-provenance'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B162_ForestClearer'
/**
 * B162 Forest Clearer:
 * Each time you obtain exactly 2/3/4 wood from a wood accumulation space,
 * you get 1 additional wood and 1/0/1 food.
 *
 * BGA: isCollectEvent + getGains checks wood collected.
 *   wood 2 → +1 wood +1 food
 *   wood 3 → +1 wood
 *   wood 4 → +1 wood +1 food
 */
const listener: CardListenerRegistration = {
  id: 'B162-forest-clearer-after-collect',
  cardIds: [CARD_ID],
  actions: ['collect'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const events = context.actionEvents ?? context.transactionEvents
    const woodGained = sumResourceMovedToPlayer(events, 'wood', context.player.id, (event) =>
      event.from.kind === 'actionSpace',
    )
    if (woodGained < 2 || woodGained > 4) return

    const gain: Partial<Resource> = { wood: 1 }
    // 2 wood or 4 wood → also get 1 food; 3 wood → no food
    if (woodGained === 2 || woodGained === 4) {
      gain.food = 1
    }
    return { flow: gainLeaf(CARD_ID, gain), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B162_ForestClearer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Forest Clearer',
    deck: 'B',
    number: 162,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: [
        'Each time you obtain exactly 2/3/4 <WOOD> from a wood accumulation space, you get 1 additional <WOOD> and 1/0/1 <FOOD>.',
      ],
    cost: {},
    players: '4+',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const B162_ForestClearer_impl = B162_ForestClearer.impl
