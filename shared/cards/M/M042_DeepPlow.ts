import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { buildMoorToFieldFlow, buildPlaceTerrainFlow } from '../../moor/terrain-flow'

const CARD_ID = 'M042_DeepPlow'

const countImprovements = (player: { improvements: string[]; minorPlayed: string[] }) =>
  player.improvements.length + player.minorPlayed.length

const farmlandListener: CardListenerRegistration = {
  id: 'M042-deep-plow-after-farmland',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'farmland' && context.space?.id !== 'cultivation') return
    const flow = buildMoorToFieldFlow(CARD_ID, context.player, true)
    if (!flow) return
    return { flow, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  prerequisiteCheck: (player) => countImprovements(player) >= 2,
  listeners: [farmlandListener],
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => buildPlaceTerrainFlow(CARD_ID, player, 'moor', true),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M042_DeepPlow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Deep Plow",
    deck: "M",
    number: 42,
    category: "FARM_PLANNER",
    desc: [
        "You can immediately place 1 <MOOR> on an unused farmyard space. Each time you use the __Farmland__ or __Cultivation__ action space, you can also exchange 1 <MOOR> for 1 <FIELD> tile."
    ],
    cost: {
        "wood": 3
    },
    vp: 2,
    prerequisite: "2 Improvements",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M042_DeepPlow_impl = M042_DeepPlow.impl
