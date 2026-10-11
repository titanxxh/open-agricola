import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { countTriggerCardsAs } from '../helpers/trigger-snapshot'
import type { CardImpl } from '../registry'
import type { ActionFlow } from '../../contract/types'
import { collectCardsAs } from '../helpers/card-type'

const CARD_ID = 'E089_Stallwright'
const TRIGGER_COUNTS = new Set([2, 3, 5, 7])
const stableFlow = (occupationCount: number): ActionFlow | undefined => {
  if (!TRIGGER_COUNTS.has(occupationCount)) return
  return {
    type: 'leaf',
    actionId: 'stables',
    optional: true,
    sourceCard: CARD_ID,
    actionContext: { max: 1, exactCost: { max: 1 }, trueAction: false },
  }
}

const listener: CardListenerRegistration = {
  id: 'E89-stallwright-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const flow = stableFlow(countTriggerCardsAs(context, context.player, 'occupation'))
    if (!flow) return
    return {
      flow,
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => stableFlow(collectCardsAs(player, 'occupation').length),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E089_Stallwright = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Stallwright',
    deck: 'E',
    number: 89,
    category: 'FARMYARD_-_STABLE_BUILDING',
    desc: [
        'After you play your 2nd, 3rd, 5th, and 7th occupation (including this one), you can build 1 <STABLE> at no cost.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const E089_Stallwright_impl = E089_Stallwright.impl
