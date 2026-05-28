import { gainLeaf } from '../helpers/pay-gain-node'
import { readCardExtraData } from '../helpers/card-state'
import { positionKey } from '../../domain/farm'
import { fieldTopStack } from '../../domain/field'
import { registerHarvestCountModifier } from '../../actions/helpers/harvest-count-registry'
import type { PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'
import { A112_ScytheWorker } from '../../cards-display/A/A112_ScytheWorker'

const CARD_ID = A112_ScytheWorker.id

registerHarvestCountModifier(CARD_ID, ({ player, field }) => {
  const selected = readCardExtraData<string[]>(player, CARD_ID, 'selectedPositions') ?? []
  if (!selected.includes(positionKey(field))) return
  const top = fieldTopStack(field)
  if (top?.kind !== 'grain') return
  return { delta: 1, sources: [CARD_ID] }
})

const hasGrainThief = (player: PlayerState) =>
  player.occupationPlayed.includes('E112_GrainThief')
  || player.minorPlayed.includes('E112_GrainThief')

const eligibleFields = (player: PlayerState) => {
  const min = hasGrainThief(player) ? 1 : 2
  return player.fields.filter((field) => {
    const top = fieldTopStack(field)
    return top?.kind === 'grain' && top.remaining >= min
  })
}

export const A112_ScytheWorker_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return gainLeaf(CARD_ID, { grain: 1 })
  },
  onStartHarvestFieldPhase: (_state, player) => {
    const fields = eligibleFields(player)
    if (fields.length === 0) return
    return {
      type: 'leaf',
      actionId: 'selection',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        selectionKind: 'farm-position',
        maxSelections: fields.length,
        selectableTiles: fields.map(({ row, col }) => ({ row, col })),
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
