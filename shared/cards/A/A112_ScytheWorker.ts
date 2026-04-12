import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A112_ScytheWorker'

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    return gainLeaf(CARD_ID, { grain: 1 })
  },
  onHarvestFieldPhase: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const grainFieldCount = player.fields.filter(
      (field) => field.crop === 'grain' && field.remaining > 0,
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
