import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A27_OvenSite } from '../../cards-display/A/A27_OvenSite'

const CARD_ID = A27_OvenSite.id

const OVEN_IDS = ['Major_ClayOven', 'Major_StoneOven'] as const

const FIREPLACE_IDS = ['Major_Fireplace1', 'Major_Fireplace2', 'A60_OrientalFireplace']

const HEARTH_IDS = ['Major_CookingHearth1', 'Major_CookingHearth2']

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
    const owned = new Set<string>([...player.improvements, ...player.minorPlayed])
    const hasFireplace = FIREPLACE_IDS.some((id) => owned.has(id))
    const hasHearth = HEARTH_IDS.some((id) => owned.has(id))
    return hasFireplace && hasHearth
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
