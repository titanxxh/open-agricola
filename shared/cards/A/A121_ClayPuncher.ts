import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A121_ClayPuncher } from '../../cards-display/A/A121_ClayPuncher'

const CARD_ID = A121_ClayPuncher.id

const TRIGGER_SPACES = ['lessons', 'lessons-2', 'lessons-4', 'clay-pit']

const listener: CardListenerRegistration = {
  id: 'A121-clay-puncher-after-lessons-clay',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !TRIGGER_SPACES.includes(context.space.id)) return
    return { flow: gainLeaf(CARD_ID, { clay: 1 }), sourceCard: CARD_ID }
  },
}

export const A121_ClayPuncher_impl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { clay: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
