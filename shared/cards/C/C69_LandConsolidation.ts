import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'C69_LandConsolidation'

/**
 * C69 Land Consolidation (MinorImprovement, C, 69)
 * BGA: At any time, if you have a grain field with exactly 3 sown grain,
 * swap the grain on that field for 1 vegetable (remaining=1) on the same field.
 * No supply cost, no per-round limit — trigger is field-local.
 */
const anytimeListener: CardListenerRegistration = {
  id: 'C69-land-consolidation-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const qualifying = context.player.fields.filter(
      (f) => f.crop === 'grain' && f.remaining === 3,
    )
    if (qualifying.length === 0) return

    if (qualifying.length === 1) {
      const field = qualifying[0]!
      return {
        flow: {
          type: 'leaf',
          actionId: 'swap-field-grain-to-veg',
          params: { row: field.row, col: field.col },
          sourceCard: CARD_ID,
        },
        sourceCard: CARD_ID,
        labelKey: 'cards.C69_LandConsolidation.anytime',
      }
    }

    return {
      flow: {
        type: 'xor',
        children: qualifying.map((field) => ({
          type: 'leaf' as const,
          actionId: 'swap-field-grain-to-veg',
          params: { row: field.row, col: field.col },
          sourceCard: CARD_ID,
          choiceLabelKey: 'ui.interactionFieldChoice',
          choiceLabelParams: { row: field.row, col: field.col },
        })),
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
  desc: [
    'At any time, if you have a grain field with exactly 3 sown <GRAIN>, you can exchange the <GRAIN> on the field for 1 <VEGETABLE> on the field.',
  ],
  cost: {},
})
