import { positionKey } from '../../domain/farm'
import type { PlayerState } from '../../contract/types'
import { readCardExtraData } from '../helpers/card-state'
import { registerHarvestCountModifier } from '../../actions/helpers/harvest-count-registry'
import { fieldIsEmpty, fieldTopStack, fieldTotalRemaining } from '../../domain/field'
import type { CardImpl } from '../registry'
import { D72_StableManure } from '../../cards-display/D/D72_StableManure'

const CARD_ID = D72_StableManure.id

registerHarvestCountModifier(CARD_ID, ({ player, field }) => {
  const selected = readCardExtraData<string[]>(player, CARD_ID, 'selectedPositions') ?? []
  if (!selected.includes(positionKey(field))) return
  if (fieldIsEmpty(field)) return
  return { delta: 1, sources: [CARD_ID] }
})

/**
 * Count stables not inside any fenced pasture.
 * A stable is "unfenced" if its tile does not belong to any pasture.
 */
const countUnfencedStables = (player: PlayerState): number => {
  const pastureTileKeys = new Set<string>()
  for (const pasture of player.pastures) {
    for (const tile of pasture.tiles) {
      pastureTileKeys.add(positionKey(tile))
    }
  }
  return player.stableTiles.filter(s => !pastureTileKeys.has(positionKey(s))).length
}

const hasGrainThief = (player: PlayerState) =>
  player.occupationPlayed.includes('E112_GrainThief')
  || player.minorPlayed.includes('E112_GrainThief')

const eligibleFields = (player: PlayerState) =>
  player.fields.filter((field) => {
    const top = fieldTopStack(field)
    if (!top) return false
    const min = hasGrainThief(player) && top.kind === 'grain' ? 1 : 2
    return fieldTotalRemaining(field) >= min
  })

export const D72_StableManure_impl = {
  effect: {
  id: CARD_ID,
  onStartHarvestFieldPhase: (_state, player) => {
    const unfencedCount = countUnfencedStables(player)
    if (unfencedCount === 0) return

    const croppedFields = eligibleFields(player)
    if (croppedFields.length === 0) return

    return {
      type: 'leaf',
      actionId: 'selection',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        selectionKind: 'farm-position',
        maxSelections: Math.min(unfencedCount, croppedFields.length),
        selectableTiles: croppedFields.map(({ row, col }) => ({ row, col })),
      },
    }
  },
  onEndHarvest: () => ({
    type: 'leaf',
    actionId: 'special-effect',
    sourceCard: CARD_ID,
    params: { kind: 'set-extra-data', key: 'selectedPositions', value: undefined },
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
