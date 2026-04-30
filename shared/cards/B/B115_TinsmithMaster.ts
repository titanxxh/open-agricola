import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { AnimalZone } from '../../actions/effects/animals'
import type { PlayerState } from '../../game/types'
import { fieldTopStack } from '../../game/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'B115_TinsmithMaster'

/**
 * B115 Tinsmith Master (Occupation):
 *
 * EFFECT 1 (passive): Each pasture WITHOUT a stable gets +1 animal capacity.
 *   - Implemented via onComputeAnimalZones
 *
 * EFFECT 2 (after sow): BGA actAddAdditionalGood iterates every freshly sown
 *   field and adds 1 crop to each — no player selection. We mirror this by
 *   bumping every fresh field's top stack remaining by 1 directly in the
 *   after-sow listener.
 */

/** Initial remaining values for each crop type when freshly sown. */
const INITIAL_REMAINING: Record<string, number> = { grain: 3, vegetable: 2 }

/** Detect fields that were freshly sown (top stack at full initial remaining). */
const getFreshlySownFields = (context: CardListenerContext) =>
  context.player.fields.filter((f) => {
    const top = fieldTopStack(f)
    return !!top && top.remaining === INITIAL_REMAINING[top.kind]
  })

// --- After sow: every freshly sown field gets +1 crop directly ---
const afterSowListener: CardListenerRegistration = {
  id: 'B115-tinsmith-master-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const freshFields = getFreshlySownFields(context)
    if (freshFields.length === 0) return
    for (const field of freshFields) {
      const top = fieldTopStack(field)
      if (top) top.remaining += 1
    }
  },
}

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

export const B115_TinsmithMaster_impl = {
  listeners: [afterSowListener],
  effect: {
  id: CARD_ID,
  onComputeAnimalZones: (player: PlayerState, zones: AnimalZone[]) => {
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl
