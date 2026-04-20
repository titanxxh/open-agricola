import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D66_PotterCeramics'

/**
 * Before bake-bread: optionally exchange 1 clay for 1 grain.
 * BGA also enforces that if you use this exchange, baking becomes mandatory,
 * but we omit that enforcement for simplicity.
 */
const beforeBakeListener: CardListenerRegistration = {
  id: 'D66-potter-ceramics-before-bake',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if ((context.player.resources.clay ?? 0) < 1) return
    return {
      flow: {
        type: 'seq' as const,
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { clay: 1 } }),
          gainLeaf(CARD_ID, { grain: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

/**
 * isDoable: if player has clay and can bake (after gaining grain), bake-bread is doable.
 */
const isDoableListener: CardListenerRegistration = {
  id: 'D66-potter-ceramics-isdoable-bake',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    if ((context.player.resources.clay ?? 0) < 1) return
    // If the player has clay, they can exchange it for grain and then bake.
    // Check if the player has any baking improvement.
    const hasBakingCard = [
      ...context.player.improvements,
      ...context.player.minorPlayed,
    ].some((cardId) => {
      // Check for known baking improvements
      const bakingCards = new Set([
        'Major_Fireplace1', 'Major_Fireplace2',
        'Major_CookingHearth1', 'Major_CookingHearth2',
        'Major_ClayOven', 'Major_StoneOven',
        'E63_IronOven', 'E64_SimpleOven', 'D59_EarthOven',
        'A60_OrientalFireplace',
      ])
      return bakingCards.has(cardId)
    })
    if (hasBakingCard) {
      return { doable: true }
    }
  },
}

export const D66_PotterCeramics = new MinorImprovement({
  id: CARD_ID,
  name: "Potter Ceramics",
  deck: "D",
  number: 66,
  category: "CROP_PROVIDER",
  desc: ["Each time before you take a __Bake Bread__ action, you can exchange 1 <CLAY> for 1 <GRAIN>."],
  cost: {},
})

export const D66_PotterCeramics_impl = {
  listeners: [beforeBakeListener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
