import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A116_WoodCutter } from '../../cards-display/A/A116_WoodCutter'
export { A116_WoodCutter }

const CARD_ID = A116_WoodCutter.id

/**
 * A116 Wood Cutter — Each time you use a wood accumulation space
 * (forest, copse, grove), you get 1 additional wood.
 *
 * BGA reference: A_116_WoodCutter.php
 */
const WOOD_SPACES = ['forest', 'copse', 'grove']

const listener: CardListenerRegistration = {
  id: 'A116-wood-cutter-after-wood',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !WOOD_SPACES.includes(context.space.id)) return
    return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
  },
}

export const A116_WoodCutter_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
