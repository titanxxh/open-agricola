import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C58_Woodcraft'

// C58 Woodcraft: Each time you use a wood accumulation space, if immediately afterward
// you have at most 5 WOOD in your supply, you get 1 FOOD.
// BGA uses "immediatelyAfter" phase check.
const listener: CardListenerRegistration = {
  id: 'C58-woodcraft-immediately-after-collect',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gainPerRound = context.space?.gainPerRound ?? {}
    if ((gainPerRound.wood ?? 0) <= 0) return
    if ((context.player.resources.wood ?? 0) > 5) return
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

export const C58_Woodcraft = new MinorImprovement({
  id: CARD_ID,
  name: 'Woodcraft',
  deck: 'C',
  number: 58,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you use a wood accumulation space, if immediately afterward you have at most 5 <WOOD> in your supply, you get 1 <FOOD>.',
  ],
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
  newSet: true,
})

export const C58_Woodcraft_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
