import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'A27_OvenSite'
const OVEN_IDS = ['Major_ClayOven', 'Major_StoneOven'] as const

// BGA isBuyable: requires both a Fireplace (Major_Fireplace1/2 or A60 OrientalFireplace)
// AND a Cooking Hearth (Major_CookingHearth1/2).
const FIREPLACE_IDS = ['Major_Fireplace1', 'Major_Fireplace2', 'A60_OrientalFireplace']
const HEARTH_IDS = ['Major_CookingHearth1', 'Major_CookingHearth2']
registerPrerequisite('Both Fireplace and Cooking Hearth', (player) => {
  const owned = new Set<string>([...player.improvements, ...player.minorPlayed])
  const hasFireplace = FIREPLACE_IDS.some((id) => owned.has(id))
  const hasHearth = HEARTH_IDS.some((id) => owned.has(id))
  return hasFireplace && hasHearth
})

const computeCostsListener: CardListenerRegistration = {
  id: 'A27-oven-site-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
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

export const A27_OvenSite = new MinorImprovement({
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
  newSet: true,
})

export const A27_OvenSite_impl = {
  listeners: [computeCostsListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => ({
    type: 'seq',
    children: [
      gainLeaf(CARD_ID, { wood: 2 }),
      {
        type: 'leaf',
        actionId: 'improvement-any',
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
  reaches: [] as readonly string[],
} satisfies CardImpl
