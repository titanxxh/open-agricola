import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A41_VegetableSlicer } from '../../cards-display/A/A41_VegetableSlicer'

const CARD_ID = A41_VegetableSlicer.id

const COOKING_HEARTH_IDS = new Set(['Major_CookingHearth1', 'Major_CookingHearth2'])

const FIREPLACE_IDS = new Set(['Major_Fireplace1', 'Major_Fireplace2'])

const listener: CardListenerRegistration = {
  id: 'A41-vegetable-slicer-after-improvement',
  cardIds: [CARD_ID],
  actions: ['improvement'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const result = context.result
    if (!result || (result.type !== 'ok' && result.type !== 'flow')) return

    const payment = result.extraData?.improvementPayment as
      | { improvementId?: string; returnedCardId?: string }
      | undefined

    if (!payment) return
    if (!COOKING_HEARTH_IDS.has(payment.improvementId ?? '')) return
    if (!FIREPLACE_IDS.has(payment.returnedCardId ?? '')) return

    return {
      flow: gainLeaf(CARD_ID, { wood: 2, vegetable: 1 }),
      sourceCard: CARD_ID,
    }
  },
}

export const A41_VegetableSlicer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
