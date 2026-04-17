import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A41_VegetableSlicer'
const COOKING_HEARTH_IDS = new Set(['Major_CookingHearth1', 'Major_CookingHearth2'])
const FIREPLACE_IDS = new Set(['Major_Fireplace1', 'Major_Fireplace2'])

const listener: CardListenerRegistration = {
  id: 'A41-vegetable-slicer-after-improvement',
  cardIds: [CARD_ID],
  actions: ['improvement-any'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
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

registerCardListener(listener)

export const A41_VegetableSlicer = new MinorImprovement({
  id: CARD_ID,
  name: 'Vegetable Slicer',
  deck: 'A',
  number: 41,
  category: 'GOODS_PROVIDER',
  desc: ['Each time you upgrade a Fireplace to a Cooking Hearth, you immediately get 2 <WOOD> and 1 <VEGETABLE> (not retroactively).'],
  cost: { wood: 1 },
})
