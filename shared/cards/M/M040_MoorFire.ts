import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { buildMoorToFieldFlow, getTerrainTiles } from '../../moor/terrain-flow'

const CARD_ID = 'M040_MoorFire'

const anytimeListener: CardListenerRegistration = {
  id: 'M040-moor-fire-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (getTerrainTiles(context.player, 'moor').length !== 1) return
    const flow = buildMoorToFieldFlow(CARD_ID, context.player)
    if (!flow) return
    return {
      flow,
      sourceCard: CARD_ID,
      labelKey: 'cards.M040_MoorFire.anytime',
    }
  },
}

const cardImpl = {
  prerequisiteCheck: (player) => getTerrainTiles(player, 'moor').length >= 2,
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M040_MoorFire = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Moor Fire",
    deck: "M",
    number: 40,
    category: "FARM_PLANNER",
    desc: [
        "Once you only have 1 remaining <MOOR>, at any time, you can exchange it for 1 <FIELD> tile."
    ],
    cost: {},
    prerequisite: "2 Moors",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M040_MoorFire_impl = M040_MoorFire.impl
