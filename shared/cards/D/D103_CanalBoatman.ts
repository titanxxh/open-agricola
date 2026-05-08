import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'
import { D103_CanalBoatman } from '../../cards-display/D/D103_CanalBoatman'
export { D103_CanalBoatman }

const CARD_ID = D103_CanalBoatman.id

const TRIGGER_SPACE_IDS = new Set(['fishing', 'reed-bank'])

const listener: CardListenerRegistration = {
  id: 'D103-canal-boatman-after-place-farmer',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !TRIGGER_SPACE_IDS.has(context.space.id)) return
    if (workersAvailable(context.state, context.player) <= 0) return
    if (context.player.resources.food < 1) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          { type: 'leaf', actionId: 'spend-worker', sourceCard: CARD_ID },
          {
            type: 'xor',
            children: [
              gainLeaf(
                CARD_ID,
                { stone: 3 },
                'ui.interactionResourceExchange',
                { resourcesGained: { stone: 3 } },
              ),
              gainLeaf(
                CARD_ID,
                { grain: 1, vegetable: 1 },
                'ui.interactionResourceExchange',
                { resourcesGained: { grain: 1, vegetable: 1 } },
              ),
            ],
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D103_CanalBoatman_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
