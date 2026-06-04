import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { playerHasCardCapability } from '../helpers/card-type'
import type { CardImpl } from '../registry'

const CARD_ID = 'A27_OvenSite'
const OVEN_IDS = ['Major_ClayOven', 'Major_StoneOven'] as const

const computeCostsListener: CardListenerRegistration = {
  id: 'A27-oven-site-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.actionCardId !== CARD_ID) return
    if (!context.cardId) return
    if (!OVEN_IDS.includes(context.cardId as (typeof OVEN_IDS)[number])) return

    // Override base cost to exactly { clay: 1, stone: 1 }.
    // Base costs: ClayOven = { clay: 3, stone: 1 }, StoneOven = { clay: 1, stone: 3 }.
    // Delta makes both become clay:1, stone:1.
    if (context.cardId === 'Major_ClayOven') {
      // 3 clay + 1 stone → 1 clay + 1 stone
      return { costs: { clay: -2 } }
    }
    if (context.cardId === 'Major_StoneOven') {
      // 1 clay + 3 stone → 1 clay + 1 stone
      return { costs: { stone: -2 } }
    }
  },
}

const cardImpl = {
  listeners: [computeCostsListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => ({
    type: 'seq',
    children: [
      gainLeaf(CARD_ID, { wood: 2 }),
      {
        type: 'leaf',
        actionId: 'improvement',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
        params: {
          allowedPurchases: [...OVEN_IDS],
        },
      },
    ],
  }),
},
  prerequisiteCheck: (player) => {
    const hasFireplace = playerHasCardCapability(player, 'fireplaceIdentity', { asType: 'major' })
    const hasHearth = playerHasCardCapability(player, 'cookingHearthIdentity', { asType: 'major' })
    return hasFireplace && hasHearth
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A27_OvenSite = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Oven Site',
    deck: 'A',
    number: 27,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'When you play this card, you get 2 <WOOD> and you can immediately build the __Clay Oven__ or __Stone Oven__ major improvement. Either way, it only costs you 1 <CLAY> and 1 <STONE>.',
      ],
    prerequisite: 'Both Fireplace and Cooking Hearth',
    cost: {},
  },
  impl: cardImpl,
})

export const A27_OvenSite_impl = A27_OvenSite.impl
