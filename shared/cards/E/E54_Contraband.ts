import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getMinorImprovementCard } from '../catalog'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E54_Contraband'

const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

// E54 Contraband: Each time you play or build an improvement after this, you can pay 1 additional
// building resource of a type in the printed cost to get 3 FOOD.
const listener: CardListenerRegistration = {
  id: 'E54-contraband-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const choice = context.choice ?? ''
    const builtId = choice.replace(/^major:/, '').replace(/^minor:/, '')
    if (!builtId || builtId === CARD_ID) return
    // Get card cost to find valid resource types
    const card = getMinorImprovementCard(builtId)
    if (!card) return
    const costResources = new Set<string>()
    const allCosts = [card.cost, ...(card.altCosts ?? [])].filter(Boolean)
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

export const E54_Contraband = new MinorImprovement({
  id: CARD_ID,
  name: 'Contraband',
  deck: 'E',
  number: 54,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you play or build an improvement after this, you can pay 1 additional building resource of a type in the printed cost to get 3 <FOOD>.',
  ],
  cost: { food: 1 },
})

export const E54_Contraband_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
