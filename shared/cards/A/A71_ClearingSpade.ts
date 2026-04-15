import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'A71_ClearingSpade'

const anytimeListener: CardListenerRegistration = {
  id: 'A71-clearing-spade-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const sourceFields = context.player.fields.filter(f => f.crop && f.remaining >= 2)
    const emptyFields = context.player.fields.filter(f => f.crop === null)
    if (sourceFields.length === 0 || emptyFields.length === 0) return

    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'field-select',
            sourceCard: CARD_ID,
            actionContext: {
              fieldFilter: 'has-2-plus-crops',
              maxSelections: 1,
              fieldEffect: 'store-source-field',
            },
          },
          {
            type: 'leaf',
            actionId: 'field-select',
            sourceCard: CARD_ID,
            actionContext: {
              fieldFilter: 'empty-plowed',
              maxSelections: 1,
              fieldEffect: 'move-crop-from-source',
            },
          },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.A71_ClearingSpade.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const A71_ClearingSpade = new MinorImprovement({
  id: CARD_ID,
  name: 'Clearing Spade',
  deck: 'A',
  number: 71,
  category: 'CROP_PROVIDER',
  desc: ['At any time, you can move 1 crop from a planted field containing at least 2 crops to an empty field.'],
  cost: { wood: 1 },
})
