import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E55_StoneWeir } from '../../cards-display/E/E55_StoneWeir'

const CARD_ID = E55_StoneWeir.id

const listener: CardListenerRegistration = {
  id: 'E55-stone-weir-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    const fishingFood = context.space?.resources?.food ?? 0
    if (fishingFood >= 4) return
    const bonus = 4 - fishingFood
    return { flow: gainLeaf(CARD_ID, { food: bonus }), sourceCard: CARD_ID }
  },
}

export const E55_StoneWeir_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
