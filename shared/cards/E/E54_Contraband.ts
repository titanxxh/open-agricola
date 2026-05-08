import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getMinorImprovementCard } from '../catalog'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E54_Contraband } from '../../cards-display/E/E54_Contraband'

const CARD_ID = E54_Contraband.id

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

export const E54_Contraband_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
