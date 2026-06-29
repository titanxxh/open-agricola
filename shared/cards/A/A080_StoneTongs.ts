import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A080_StoneTongs'
/**
 * A80 Stone Tongs — Each time you use a stone accumulation space
 * (eastern-quarry or western-quarry), you get 1 additional stone.
 *
 * BGA reference: A_80_StoneTongs.php
 */
const STONE_SPACES = ['eastern-quarry', 'western-quarry']

const listener: CardListenerRegistration = {
  id: 'A80-stone-tongs-after-stone',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !STONE_SPACES.includes(context.space.id)) return
    return { flow: gainLeaf(CARD_ID, { stone: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A080_StoneTongs = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Stone Tongs",
    deck: "A",
    number: 80,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Each time you use a stone accumulation space, you get 1 additional <STONE>.",
      ],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const A080_StoneTongs_impl = A080_StoneTongs.impl
