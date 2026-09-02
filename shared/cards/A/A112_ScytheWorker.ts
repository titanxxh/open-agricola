import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { readCardExtraData } from '../helpers/card-state'
import { positionKey } from '../../domain/farm'
import { fieldTopStack } from '../../domain/field'
import {
  computeHarvestSelectionThreshold,
  registerHarvestCountModifier,
} from '../../actions/helpers/harvest-count-registry'
import type { GameState, PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'
import { getLogicalFields } from '../helpers/card-field'

const CARD_ID = 'A112_ScytheWorker'
registerHarvestCountModifier(CARD_ID, ({ player, field, logicalField }) => {
  const selected = readCardExtraData<string[]>(player, CARD_ID, 'selectedPositions') ?? []
  const selectedField = logicalField
    ? logicalField.slots.some((slot) => selected.includes(positionKey(slot.tile)))
    : selected.includes(positionKey(field))
  if (!selectedField) return
  const top = fieldTopStack(field)
  if (top?.kind !== 'grain') return
  return { delta: 1, sources: [CARD_ID] }
})

const eligibleFields = (state: GameState, player: PlayerState) => {
  return getLogicalFields(player).flatMap((logicalField) => {
    const slot = [...logicalField.slots].reverse().find((candidate) => candidate.stack)
    if (!slot) return []
    const field = {
      row: logicalField.row,
      col: logicalField.col,
      stacks: logicalField.stacks.map((stack) => ({ ...stack })),
    }
    const top = fieldTopStack(field)
    const min = computeHarvestSelectionThreshold(state, player, field, {
      sourceCard: CARD_ID,
      baseThreshold: 2,
      logicalField,
    }).threshold
    return top?.kind === 'grain' && top.remaining >= min ? [{ logicalField, slot }] : []
  })
}

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return gainLeaf(CARD_ID, { grain: 1 })
  },
  onStartHarvestFieldPhase: (state, player) => {
    const fields = eligibleFields(state, player)
    if (fields.length === 0) return
    return {
      type: 'leaf',
      actionId: 'selection',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        selectionKind: 'farm-position',
        maxSelections: fields.length,
        selectableTiles: fields.map(({ logicalField, slot }) => ({
          ...slot.tile,
          ...(logicalField.sourceCard
            ? {
                sourceCard: logicalField.sourceCard,
                groupKey: logicalField.groupKey,
                cardFieldSlot: slot.index,
              }
            : {}),
        })),
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

export const A112_ScytheWorker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Scythe Worker",
    deck: "A",
    number: 112,
    category: "CROP_PROVIDER",
    desc: ["When you play this card, you immediately get 1 <GRAIN>. In the field phase of each harvest, you can harvest 1 additional <GRAIN> from each of your <GRAIN> <FIELD>."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const A112_ScytheWorker_impl = A112_ScytheWorker.impl
