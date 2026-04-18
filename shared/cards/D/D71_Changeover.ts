import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { registerFieldEffect } from '../../actions/effects/field-effect-registry'
import { fieldTotalRemaining } from '../../game/field'

const CARD_ID = 'D71_Changeover'

registerFieldEffect('discard-single-crop', ({ player, fields }) => {
  for (const key of fields) {
    const [r, c] = key.split('-').map(Number)
    const field = player.fields.find(f => f.row === r && f.col === c)
    if (field && fieldTotalRemaining(field) === 1) {
      field.stacks.length = 0
    }
  }
})

const anytimeListener: CardListenerRegistration = {
  id: 'D71-changeover-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const eligibleFields = context.player.fields.filter(f => fieldTotalRemaining(f) === 1)
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
            actionContext: { allowedFields: 'fromSelectedFields', sourceCard: CARD_ID },
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
