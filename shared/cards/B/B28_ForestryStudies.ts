import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'B28_ForestryStudies'

// B28 Forestry Studies: After using Forest, can return 2 wood to the space
// then play 1 occupation for free (no occupation cost).
const listener: CardListenerRegistration = {
  id: 'B28-forestry-studies-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'forest') return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'return-to-space',
            params: { wood: 2 },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'play-occupation',
            sourceCard: CARD_ID,
            params: { costOverride: {} },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const B28_ForestryStudies = new MinorImprovement({
  id: CARD_ID,
  name: 'Forestry Studies',
  deck: 'B',
  number: 28,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each time after you use the __Forest__ accumulation space, you can return 2 <WOOD> to that space to play 1 occupation without paying an occupation costs.'],
  cost: { food: 2 },
  newSet: true,
})
