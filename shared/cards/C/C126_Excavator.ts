import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C126_Excavator } from '../../cards-display/C/C126_Excavator'

const CARD_ID = C126_Excavator.id

const listener: CardListenerRegistration = {
  id: 'C126-excavator-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  // BGA C126_Excavator.php:36 — the wood + clay gain is mandatory; the
  // inner pay/stone branch stays optional. Marking the listener mandatory
  // hides __pass__ from the PARALLEL select-trigger prompt so the player
  // cannot silently skip the guaranteed effect.
  mandatory: true,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    return {
      flow: {
        type: 'seq',
        children: [
          gainLeaf(CARD_ID, { clay: 1, wood: 1 }),
          {
            type: 'seq',
            optional: true,
            children: [
              payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
              gainLeaf(CARD_ID, { stone: 1 }),
            ],
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const C126_Excavator_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
