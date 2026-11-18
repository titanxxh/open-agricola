import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CFL035_Freemason'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onWorkStart: (_state, player) => {
      if (player.roomTiles.length !== 2 || player.houseType === 'wood') return
      return gainLeaf(CARD_ID, player.houseType === 'clay' ? { clay: 2 } : { stone: 2 })
    },
  },
} satisfies CardImpl

export const CFL035_Freemason = defineOccupationCard({
  meta: {
    id: 'CFL035_Freemason',
    name: 'Freemason',
    deck: 'CFL',
    number: 35,
    players: '1+',
    desc: [
      'At the start of each work phase, if you live in a clay/stone house with exactly 2 rooms, you get 2 <CLAY>/<STONE>.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL035.png',
  },
  impl: cardImpl,
})
