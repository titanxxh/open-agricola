import { MinorImprovement } from '../types'
import type { BonusModifier } from '../../contract/types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'B15_CarpentersBench'

// B15 Carpenter's Bench: Immediately after each time you use a wood accumulation
// space, you can use the taken wood (and only that) to build exactly 1 pasture.
// One of the fences is free.
// BGA L39-64 counts the wood meeples actually picked up from the space (n);
// the resulting fence flow runs with max=n+1 and benchWood=n. Our listener
// reads `result.resourcesGained.wood` to mirror "actually collected".

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

const collectedWood = (context: CardListenerContext): number => {
  if (context.result?.type !== 'ok') return 0
  return context.result.resourcesGained?.wood ?? 0
}

const afterCollectListener: CardListenerRegistration = {
  id: 'B15-carpenters-bench-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    const n = collectedWood(context)
    if (n <= 0) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'fence',
            sourceCard: CARD_ID,
            // BGA L55-59 args: { CarpentersBench: true, costs: { WOOD => 1 },
            // max: n+1, benchWood: n }. We pass max + benchWood through
            // actionContext for the fence interaction; trueAction=false so the
            // engine treats this as a card-driven side flow.
            actionContext: {
              trueAction: false,
              max: n + 1,
              benchWood: n,
            },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

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

export const B15_CarpentersBench_impl = {
  listeners: [afterCollectListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
