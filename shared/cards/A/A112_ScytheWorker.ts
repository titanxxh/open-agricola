import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop } from '../../game/field'

const CARD_ID = 'A112_ScytheWorker'

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return gainLeaf(CARD_ID, { grain: 1 })
  },
  onHarvestFieldPhase: (_state, player) => {
    const grainFieldCount = player.fields.filter(
      (field) => fieldHasCrop(field, 'grain'),
    ).length
    if (grainFieldCount <= 0) return
    return gainLeaf(CARD_ID, { grain: grainFieldCount })
  },
})

export const A112_ScytheWorker = new Occupation({
  id: CARD_ID,
  name: "Scythe Worker",
  deck: "A",
  number: 112,
  category: "CROP_PROVIDER",
  desc: ["When you play this card, you immediately get 1 <GRAIN>. In the field phase of each harvest, you can harvest 1 additional <GRAIN> from each of your grain fields."],
  cost: {},
  players: "1+",
})
