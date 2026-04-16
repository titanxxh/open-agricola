import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { AnimalZone } from '../../actions/effects/animals'
import { registerFieldEffect } from '../../actions/effects/field-effect-registry'
import type { ActionFlow, PlayerState } from '../../game/types'

const CARD_ID = 'B115_TinsmithMaster'

/**
 * B115 Tinsmith Master (Occupation):
 *
 * EFFECT 1 (passive): Each pasture WITHOUT a stable gets +1 animal capacity.
 *   - Implemented via onComputeAnimalZones
 *
 * EFFECT 2 (after sow): Each time you sow, you can place 1 additional
 *   crop of the respective type in ONE field that was just sown.
 *   - If 1 field sown: auto-add 1 crop
 *   - If multiple: player selects which field gets the bonus
 *   - Implemented via after sow listener
 */

/** Initial remaining values for each crop type when freshly sown. */
const INITIAL_REMAINING: Record<string, number> = { grain: 3, vegetable: 2 }

/** Detect fields that were freshly sown (have initial remaining value). */
const getFreshlySownFields = (context: CardListenerContext) =>
  context.player.fields.filter(
    (f) => f.crop !== null && f.remaining === INITIAL_REMAINING[f.crop],
  )

// Field effect: add 1 crop to the selected field (matching its crop type)
registerFieldEffect('tinsmith-master-bonus-crop', ({ player, fields }) => {
  for (const key of fields) {
    const [r, c] = key.split('-').map(Number)
    const field = player.fields.find((f) => f.row === r && f.col === c)
    if (field && field.crop !== null && field.remaining > 0) {
      field.remaining += 1
      break // only 1 field
    }
  }
})

// --- Card Effect: pasture capacity ---
registerCardEffect({
  id: CARD_ID,
  onComputeAnimalZones: (player: PlayerState, zones: AnimalZone[]) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    for (const zone of zones) {
      if (zone.zoneType !== 'pasture') continue
      const pastureIndex = zone.pastureIndex
      if (pastureIndex === undefined) continue
      const pasture = player.pastures[pastureIndex]
      if (!pasture) continue
      if (pasture.stables === 0) {
        zone.capacity += 1
      }
    }
  },
})

// --- After sow: find freshly sown fields, add 1 bonus crop to one ---
const afterSowListener: CardListenerRegistration = {
  id: 'B115-tinsmith-master-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return

    const freshFields = getFreshlySownFields(context)
    if (freshFields.length === 0) return

    if (freshFields.length === 1) {
      // Auto-add 1 crop to the single field
      freshFields[0]!.remaining += 1
      return
    }

    // Multiple fields sown — player selects which one gets the bonus
    return {
      flow: {
        type: 'leaf',
        actionId: 'field-select',
        sourceCard: CARD_ID,
        actionContext: {
          fieldFilter: 'has-crop',
          maxSelections: 1,
          fieldEffect: 'tinsmith-master-bonus-crop',
        },
      } as ActionFlow,
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(afterSowListener)

export const B115_TinsmithMaster = new Occupation({
  id: CARD_ID,
  name: 'Tinsmith Master',
  deck: 'B',
  number: 115,
  category: 'CROP_PROVIDER',
  desc: ['You can hold 1 additional animal in each pasture without a stable. Each time you sow in a field, you can place 1 additional crop of the respective type in that field.'],
  cost: {},
  players: '1+',
  implemented: true,
})
