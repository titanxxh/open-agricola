import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { writeCardExtraData, readCardExtraData } from '../helpers/card-state'
import { registerSelectionEffect } from '../../actions/effects/selection-effect-registry'

const CARD_ID = 'A71_ClearingSpade'

registerSelectionEffect('store-source-field', ({ player, positions, sourceCard }) => {
  if (sourceCard && positions.length > 0) {
    const [r, c] = positions[0]!.split('-').map(Number)
    const field = player.fields.find(f => f.row === r && f.col === c)
    if (field && field.crop && field.remaining >= 2) {
      writeCardExtraData(player, sourceCard, 'moveSourceField', positions[0])
    }
  }
})

registerSelectionEffect('move-crop-from-source', ({ player, positions, sourceCard }) => {
  const sourceKey = readCardExtraData<string>(player, sourceCard!, 'moveSourceField')
  if (sourceKey && positions.length > 0) {
    const [tr, tc] = positions[0]!.split('-').map(Number)
    const targetField = player.fields.find(f => f.row === tr && f.col === tc)
    if (!targetField || targetField.crop !== null) return
    const [sr, sc] = sourceKey.split('-').map(Number)
    const sourceField = player.fields.find(f => f.row === sr && f.col === sc)
    if (sourceField && sourceField.remaining >= 2 && sourceField.crop) {
      sourceField.remaining -= 1
      targetField.crop = sourceField.crop
      targetField.remaining = 1
    }
  }
})

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
            actionId: 'selection',
            sourceCard: CARD_ID,
            actionContext: {
              selectionKind: 'farm-position',
              positionFilter: 'has-2-plus-crops',
              maxSelections: 1,
              selectionEffect: 'store-source-field',
            },
          },
          {
            type: 'leaf',
            actionId: 'selection',
            sourceCard: CARD_ID,
            actionContext: {
              selectionKind: 'farm-position',
              positionFilter: 'empty-plowed',
              maxSelections: 1,
              selectionEffect: 'move-crop-from-source',
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
