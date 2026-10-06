import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { AnimalZone } from '../../domain'
import type { ActionFlow, PlayerState } from '../../contract/types'
import type { FarmSownEvent } from '../../contract/events'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { extraCropPlacementActionContext } from '../../actions/helpers/extra-crop-placement-context'
import type { CardImpl } from '../registry'
import { getLogicalFields, mutateLogicalFields } from '../helpers/card-field'
import { parseFarmPositionKey } from '../../domain/farm-position-selection'

const CARD_ID = 'B115_TinsmithMaster'
const SELECTION_EFFECT = 'B115-tinsmith-master-add-additional-good'

/**
 * B115 Tinsmith Master (Occupation):
 *
 * EFFECT 1 (passive): Each pasture WITHOUT a stable gets +1 animal capacity.
 *   - Implemented via onComputeAnimalZones
 *
 * EFFECT 2 (after sow): Optionally add 1 crop to selected freshly sown fields.
 */

const getFreshlySownFields = (context: CardListenerContext) => {
  const cropByPosition = new Map(
    (context.actionEvents ?? context.transactionEvents)
      .flatMap((event) =>
        event.type === 'farm.sown'
          ? (event as Pick<FarmSownEvent, 'sows'>).sows
          : [],
      )
      .flatMap((sow) => {
        const location = sow.location
        if (location.kind !== 'field') return []
        if (location.playerId !== context.player.id) return []
        if (sow.crop !== 'grain' && sow.crop !== 'vegetable') return []
        return [[`${location.row}-${location.col}`, sow.crop] as const]
      }),
  )
  return getLogicalFields(context.player).flatMap((field) => {
    const slot = field.slots.find((candidate) => {
      const crop = cropByPosition.get(`${candidate.tile.row}-${candidate.tile.col}`)
      return !!crop && candidate.stack?.kind === crop && candidate.stack.remaining > 0
    })
    return slot ? [{ field, slot }] : []
  })
}

registerSelectionEffect(SELECTION_EFFECT, ({ state, player, positions, sourceCard, eventSink }) => {
  const mutations = mutateLogicalFields(state, player, { sourceCard, eventSink })
  for (const key of positions) {
    const tile = parseFarmPositionKey(key)
    if (tile) mutations.grow(tile)
  }
})

const afterSowListener: CardListenerRegistration = {
  id: 'B115-tinsmith-master-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const freshFields = getFreshlySownFields(context)
    if (freshFields.length === 0) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'selection',
        sourceCard: CARD_ID,
        optional: true,
        actionContext: extraCropPlacementActionContext({
          selectionKind: 'farm-position',
          selectableTiles: freshFields.map(({ field, slot }) => field.kind === 'farmyard'
            ? { row: field.row, col: field.col }
            : {
                ...slot.tile,
                sourceCard: field.sourceCard,
                groupKey: field.groupKey,
                cardFieldSlot: slot.index,
              }),
          minSelections: 1,
          maxSelections: freshFields.length,
          selectionEffect: SELECTION_EFFECT,
        }),
      } satisfies ActionFlow,
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [afterSowListener],
  effect: {
  id: CARD_ID,
  onComputeAnimalZones: (player: PlayerState, zones: AnimalZone[], _state) => {
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

export const B115_TinsmithMaster = defineOccupationCard({
  presentation: { stack: true },
  meta: {
    id: CARD_ID,
    name: 'Tinsmith Master',
    deck: 'B',
    number: 115,
    category: 'CROP_PROVIDER',
    desc: ['You can hold 1 additional animal in each pasture without a <STABLE>. Each time you sow in a <FIELD>, you can place 1 additional crop of the respective type in that <FIELD>.'],
    cost: {},
    players: '1+',
    implemented: true,
  },
  impl: cardImpl,
})

export const B115_TinsmithMaster_impl = B115_TinsmithMaster.impl
