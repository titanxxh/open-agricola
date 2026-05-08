import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { getRoundPlacementOrder } from '../helpers/round-placement'
import type { CardImpl } from '../registry'
import { A18_WheelPlow } from '../../cards-display/A/A18_WheelPlow'

const CARD_ID = A18_WheelPlow.id

const TRIGGER_SPACES = new Set(['farmland', 'cultivation'])

const listener: CardListenerRegistration = {
  id: 'A18-wheel-plow-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (!context.space || !TRIGGER_SPACES.has(context.space.id)) return
    // Must be the first person placed this round (placement count is 1 after placing)
    if (getRoundPlacementOrder(context.player).length !== 1) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          {
            type: 'seq',
            optional: true,
            children: [
              { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
              {
                type: 'seq',
                optional: true,
                children: [
                  { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
                ],
              },
            ],
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A18_WheelPlow_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
