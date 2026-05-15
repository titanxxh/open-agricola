import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'
import { A11_MudPatch } from '../../cards-display/A/A11_MudPatch'

const CARD_ID = A11_MudPatch.id

export const A11_MudPatch_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { boar: 1 }),
  onComputeAnimalZones: (player, zones, _state) => {
    const emptyFields = player.fields.filter(f => fieldIsEmpty(f)).length
    if (emptyFields === 0) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      capacity: emptyFields,
      animalType: 'boar',
      animalCount: 0,
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
