import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A30_BakingSheet'

// A30 Baking Sheet: Each time you take a Bake Bread action, you can use this card to
// exchange exactly 1 grain for 2 food and 1 bonus score.
// BGA checks: isActionEvent($event, 'Exchange') && $event['trigger'] == BREAD
// In our system: actions: ['bake-bread']
const listener: CardListenerRegistration = {
  id: 'A30-baking-sheet-after-bake',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return payGainNode({
      cardId: CARD_ID,
      cost: { grain: 1 },
      gain: { food: 2, score: 1 },
    })
  },
}

export const A30_BakingSheet = new MinorImprovement({
  id: CARD_ID,
  name: 'Baking Sheet',
  deck: 'A',
  number: 30,
  category: 'POINTS_PROVIDER',
  desc: ['Each time you take a __Bake Bread__ action, you can use this card to exchange exactly 1 <GRAIN> for 2 <FOOD> and 1 bonus <SCORE>.'],
  cost: {},
  prerequisite: 'No Grain Field',
  newSet: true,
  extraVp: true,
})

export const A30_BakingSheet_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
