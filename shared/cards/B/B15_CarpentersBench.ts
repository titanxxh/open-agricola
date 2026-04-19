import { MinorImprovement } from '../types'
import type { BonusModifier } from '../../game/types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'B15_CarpentersBench'

// B15 Carpenter's Bench: After using a wood accumulation space, optionally build
// exactly 1 pasture. One of the fences is free (provided by the BonusModifier).

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

const afterCollectListener: CardListenerRegistration = {
  id: 'B15-carpenters-bench-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'fence',
            sourceCard: CARD_ID,
            actionContext: { trueAction: false },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(afterCollectListener)

export const B15_CarpentersBench = new MinorImprovement({
  id: CARD_ID,
  name: "Carpenter's Bench",
  deck: 'B',
  number: 15,
  category: 'FARM_PLANNER',
  desc: ["Immediately after each time you use a wood accumulation space, you can use the taken wood (and only that) to build exactly 1 pasture. If you do, one of the fences is free."],
  cost: { wood: 1 },
  evenMoreSet: true,
  modifier: {
    type: 'bonus',
    cardId: 'B15_CarpentersBench',
    appliesTo: ['fencing'],
    discount: { wood: 1 },
  } as BonusModifier,
})
