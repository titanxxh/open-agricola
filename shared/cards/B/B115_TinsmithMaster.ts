import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { AnimalZone } from '../../domain'
import type { ActionFlow, PlayerState } from '../../contract/types'
import type { FarmSownEvent } from '../../contract/events'
import { fieldTopStack } from '../../domain/field'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { extraCropPlacementActionContext } from '../../actions/helpers/extra-crop-placement-context'
import type { CardImpl } from '../registry'

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
  return context.player.fields.filter((field) => {
    const crop = cropByPosition.get(`${field.row}-${field.col}`)
    const top = fieldTopStack(field)
    return !!crop && !!top && top.kind === crop && top.remaining > 0
  })
}

registerSelectionEffect(SELECTION_EFFECT, ({ player, positions }) => {
  const selected = positions.map((key) => {
    const [r, c] = key.split('-').map(Number)
    const field = player.fields.find((f) => f.row === r && f.col === c)
    const top = field ? fieldTopStack(field) : null
    if (!field || !top) return null
    return top
  })
  const selectedStacks = selected.filter((top): top is NonNullable<typeof top> => top !== null)
  if (selectedStacks.length !== selected.length) return
  for (const top of selectedStacks) {
    top.remaining += 1
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
          selectableTiles: freshFields.map(({ row, col }) => ({ row, col })),
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
