import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C73_SeaweedFertilizer'

const isUnconditionalSow = (context: CardListenerContext): boolean => {
  const actionContext = context.actionContext ?? {}
  if (actionContext.checkedReplaceAction === true) return false
  return actionContext.maxSelections === undefined && actionContext.cropType === undefined
}

// C73 Seaweed Fertilizer: Each time after you take an unconditional Sow action,
// you get 1 GRAIN from the general supply. From round 11 on, you can get 1 VEGETABLE instead.
const listener: CardListenerRegistration = {
  id: 'C73-seaweed-fertilizer-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isUnconditionalSow(context)) return
    if (context.state.round < 11) {
      return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
    } else {
      return {
        flow: {
          type: 'xor',
          children: [
            gainLeaf(CARD_ID, { grain: 1 }),
            gainLeaf(CARD_ID, { vegetable: 1 }),
          ],
        },
        sourceCard: CARD_ID,
      }
    }
  },
}

registerCardListener(listener)

export const C73_SeaweedFertilizer = new MinorImprovement({
  id: CARD_ID,
  name: 'Seaweed Fertilizer',
  deck: 'C',
  number: 73,
  category: 'CROP_PROVIDER',
  desc: [
    'Each time after you take an unconditional __Sow__ action, you get 1 <GRAIN> from the general supply. From round 11 on, you can get 1 <VEGETABLE> instead.',
  ],
  cost: { food: 2 },
  newSet: true,
})
