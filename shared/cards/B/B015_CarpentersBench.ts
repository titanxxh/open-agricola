import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { sumResourceMovedToPlayer } from '../helpers/event-provenance'
import type { CardImpl } from '../registry'

const CARD_ID = 'B015_CarpentersBench'
const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

const collectedWood = (context: CardListenerContext): number => {
  const events = context.actionEvents ?? context.transactionEvents
  return sumResourceMovedToPlayer(events, 'wood', context.player.id, (event) =>
    event.from.kind === 'actionSpace',
  )
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
            actionId: 'reserve-fence-bonus',
            sourceCard: CARD_ID,
            params: {
              freeFences: 1,
              counterKey: 'benchFreeFences',
            },
          },
          {
            type: 'leaf',
            actionId: 'fence',
            sourceCard: CARD_ID,
            actionContext: {
              trueAction: false,
              fencePolicy: {
                allowedSegmentTypes: ['fence'],
                segmentBounds: { total: { min: 1 } },
                newPastureBounds: { count: { min: 1, max: 1 } },
                costPolicy: { fence: { wood: 1 } },
                paymentBudget: { wood: n },
                cancelPolicy: 'forbidCancel',
                promptHintKey: 'ui.interactionCarpentersBenchFenceHint',
              },
            },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [afterCollectListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B015_CarpentersBench = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Carpenter's Bench",
    deck: 'B',
    number: 15,
    category: 'FARM_PLANNER',
    desc: ["Immediately after each time you use a <WOOD> accumulation space, you can use the taken <WOOD> (and only that) to build exactly 1 pasture. If you do, one of the <FENCE> is free."],
    cost: { wood: 1 },
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const B015_CarpentersBench_impl = B015_CarpentersBench.impl
