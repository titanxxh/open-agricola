import { defineMinorCard } from '../card-source'
import { positionKey } from '../../domain/farm'
import type { GameState, PlayerState } from '../../contract/types'
import { readCardExtraData } from '../helpers/card-state'
import {
  computeHarvestSelectionThreshold,
  registerHarvestCountModifier,
} from '../../actions/helpers/harvest-count-registry'
import { fieldIsEmpty, fieldTopStack, fieldTotalRemaining } from '../../domain/field'
import { getUnfencedStableCountForCards } from '../../domain/stables'
import type { CardImpl } from '../registry'

const CARD_ID = 'D072_StableManure'
registerHarvestCountModifier(CARD_ID, ({ player, field }) => {
  const selected = readCardExtraData<string[]>(player, CARD_ID, 'selectedPositions') ?? []
  if (!selected.includes(positionKey(field))) return
  if (fieldIsEmpty(field)) return
  return { delta: 1, sources: [CARD_ID] }
})

const eligibleFields = (state: GameState, player: PlayerState) =>
  player.fields.filter((field) => {
    const top = fieldTopStack(field)
    if (!top) return false
    const min = computeHarvestSelectionThreshold(state, player, field, {
      sourceCard: CARD_ID,
      baseThreshold: 2,
    }).threshold
    return fieldTotalRemaining(field) >= min
  })

const cardImpl = {
  effect: {
  id: CARD_ID,
  onStartHarvestFieldPhase: (state, player) => {
    const unfencedCount = getUnfencedStableCountForCards(player)
    if (unfencedCount === 0) return

    const croppedFields = eligibleFields(state, player)
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

export const D072_StableManure = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Stable Manure",
    deck: "D",
    number: 72,
    category: "CROP_PROVIDER",
    desc: ["In the field phase of each harvest, you can harvest 1 additional good from a number of fields equal to the number of unfenced stables you have."],
    cost: {},
    prerequisite: "At Most 1 Occupation",
    occupationPrerequisites: {"max":1},
  },
  impl: cardImpl,
})

export const D072_StableManure_impl = D072_StableManure.impl
