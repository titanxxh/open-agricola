import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getMinorImprovementCard } from '../catalog'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E54_Contraband'
const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

const listener: CardListenerRegistration = {
  id: 'E54-contraband-after-pay',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['pay'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const ctx = context as unknown as { costType?: string }
    const costType = ctx.costType
    if (costType !== 'major-improvement' && costType !== 'minor-improvement') return
    const builtId = context.sourceCard
    if (!builtId || builtId === CARD_ID) return
    // Get card cost to find valid resource types
    const card = getMinorImprovementCard(builtId)
    if (!card) return
    const costResources = new Set<string>()
    // Minor improvements only ever carry Partial<Resource> costs.
    const cardCost = card.cost as Partial<Record<string, number>> | undefined
    const allCosts = [cardCost, ...(card.altCosts ?? [])].filter(Boolean)
    for (const cost of allCosts) {
      for (const res of BUILDING_RESOURCES) {
        if ((cost![res] ?? 0) > 0) costResources.add(res)
      }
    }
    if (costResources.size === 0) return
    const children = [...costResources].map((res) =>
      payGainNode({ cardId: CARD_ID, cost: { [res]: 1 }, gain: { food: 3 } }).flow!,
    )
    return {
      flow: {
        type: 'xor',
        optional: true,
        children,
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E54_Contraband = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Contraband',
    deck: 'E',
    number: 54,
    category: 'FOOD',
    desc: [
        'Each time you play or build an improvement after this, you can pay 1 additional building resource of a type in the printed cost to get 3 <FOOD>.',
      ],
    cost: { food: 1 },
    waresSalesmanGains: [{ wood: 1, reed: 1 }, { clay: 1, reed: 1 }, { reed: 2 }, { stone: 1, reed: 1 }],
  },
  impl: cardImpl,
})

export const E54_Contraband_impl = E54_Contraband.impl
