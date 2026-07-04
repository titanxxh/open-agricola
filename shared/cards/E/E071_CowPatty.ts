import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { positionKey } from '../../domain/farm'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { extraCropPlacementActionContext } from '../../actions/helpers/extra-crop-placement-context'
import type { ActionFlow, PlayerState } from '../../contract/types'
import type { FarmSownEvent } from '../../contract/events'
import { fieldTopStack } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'E071_CowPatty'

const countCattleOnBoard = (player: PlayerState): number => {
  let total = 0
  for (const pasture of player.pastures) {
    if (pasture.animalType === 'cattle') total += pasture.animalCount
  }
  if (player.houseAnimalType === 'cattle') total += player.houseAnimalCount
  for (const animal of Object.values(player.stableAnimals ?? {})) {
    if (animal === 'cattle') total += 1
  }
  return total
}

/**
 * E71 Cow Patty (Minor Improvement):
 * Each time you sow in a field that is orthogonally adjacent to a pasture,
 * you can place 1 additional good of the planted type in it.
 *
 * Prerequisite: 1 Cattle (checked at play time, not at trigger time).
 *
 * Implementation: after sow listener. Detect freshly sown fields,
 * filter to those adjacent to pastures, then offer an optional selection.
 */

registerSelectionEffect('cow-patty-bonus-crop', ({ player, positions }) => {
  const [key] = positions
  if (!key) return
  const [r, c] = key.split('-').map(Number)
  const field = player.fields.find((f) => f.row === r && f.col === c)
  if (!field) return
  const top = fieldTopStack(field)
  if (!top) return
  top.remaining += 1
})

/**
 * Check if a tile is orthogonally adjacent to any pasture tile.
 */
const isAdjacentToPasture = (
  row: number,
  col: number,
  context: CardListenerContext,
): boolean => {
  const pastureTileKeys = new Set<string>()
  for (const pasture of context.player.pastures) {
    for (const tile of pasture.tiles) {
      pastureTileKeys.add(positionKey(tile))
    }
  }
  const neighbors = [
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 },
  ]
  return neighbors.some((n) => pastureTileKeys.has(positionKey(n)))
}

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

const afterSowListener: CardListenerRegistration = {
  id: 'E71-cow-patty-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const freshFields = getFreshlySownFields(context)
    const eligible = freshFields.filter((f) => isAdjacentToPasture(f.row, f.col, context))
    if (eligible.length === 0) return

    return {
      flow: {
        type: 'leaf',
        actionId: 'selection',
        sourceCard: CARD_ID,
        optional: true,
        actionContext: extraCropPlacementActionContext({
          selectionKind: 'farm-position',
          selectableTiles: eligible.map(({ row, col }) => ({ row, col })),
          minSelections: 1,
          maxSelections: 1,
          selectionEffect: 'cow-patty-bonus-crop',
        }),
      } as ActionFlow,
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  prerequisiteCheck: (player) => countCattleOnBoard(player) >= 1,
  listeners: [afterSowListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E071_CowPatty = defineMinorCard({
  meta: {
    id: 'E071_CowPatty',
    name: 'Cow Patty',
    deck: 'E',
    number: 71,
    desc: ['Each time you sow in a <FIELD> that is orthogonally adjacent to a pasture, you can place 1 additional good of the planted type in it.'],
    cost: {},
    vp: 1,
    prerequisite: '1 Cattle',
    implemented: true,
    category: 'CROPS_-_GRAIN_AND_VEGETABLE',
  },
  impl: cardImpl,
})

export const E071_CowPatty_impl = E071_CowPatty.impl
