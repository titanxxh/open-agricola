import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C69_LandConsolidation'

/**
 * C69 Land Consolidation (MinorImprovement, C, 69)
 * Anytime (once per round): exchange 3 grain from your supply for 1 vegetable.
 */
registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    setCardFlag(player, CARD_ID, false)
  },
})

const anytimeListener: CardListenerRegistration = {
  id: 'C69-land-consolidation-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.grain < 3) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 3 } }),
          gainLeaf(CARD_ID, { vegetable: 1 }),
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C69_LandConsolidation.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const C69_LandConsolidation = new MinorImprovement({
  id: CARD_ID,
  name: 'Land Consolidation',
  deck: 'C',
  number: 69,
  category: 'CROP_PROVIDER',
  desc: ['At any time, if you have a grain field with exactly 3 sown <GRAIN>, you can exchange the <GRAIN> on the field for 1 <VEGETABLE> on the field.'],
  cost: {},
})
