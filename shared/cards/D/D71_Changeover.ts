import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'D71_Changeover'

const anytimeListener: CardListenerRegistration = {
  id: 'D71-changeover-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const eligibleFields = context.player.fields.filter(f => f.crop !== null && f.remaining === 1)
    if (eligibleFields.length === 0) return
    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'field-select',
            sourceCard: CARD_ID,
            actionContext: {
              fieldFilter: 'has-exactly-1-crop',
              maxSelections: 1,
              fieldEffect: 'discard-single-crop',
            },
          },
          {
            type: 'leaf',
            actionId: 'sow',
            sourceCard: CARD_ID,
            optional: true,
          },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.D71_Changeover.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const D71_Changeover = new MinorImprovement({
  id: CARD_ID,
  name: 'Changeover',
  deck: 'D',
  number: 71,
  category: 'CROP_PROVIDER',
  desc: ['At any time, if a field contains exactly 1 good as a result of a harvest, you can discard that good and immediately take a __Sow__ action limited to that field.'],
  cost: {},
  newSet: true,
})
