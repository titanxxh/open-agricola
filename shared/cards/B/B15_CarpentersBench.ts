import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { sumResourceMovedToPlayer } from '../helpers/event-provenance'
import type { CardImpl } from '../registry'
import { B15_CarpentersBench } from '../../cards-display/B/B15_CarpentersBench'

const CARD_ID = B15_CarpentersBench.id

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
                segmentBounds: { total: { min: 1, max: n + 1 } },
                newPastureBounds: { count: { min: 1, max: 1 } },
                costPolicy: { fence: { wood: 1 } },
                cancelPolicy: 'forbidCancel',
              },
            },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const B15_CarpentersBench_impl = {
  listeners: [afterCollectListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
