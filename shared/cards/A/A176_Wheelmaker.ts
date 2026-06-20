import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A176_Wheelmaker'
const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const hasAnotherOccupation = player.occupationPlayed.some((id) => id !== CARD_ID)
      if (!hasAnotherOccupation) return
      const ownWood = player.resources.wood ?? 0
      const otherWood = state.players
        .filter((otherPlayer) => otherPlayer.id !== player.id)
        .reduce((total, otherPlayer) => total + (otherPlayer.resources.wood ?? 0), 0)
      if (ownWood <= otherWood || ownWood >= 15) return
      return gainLeaf(CARD_ID, { wood: 15 - ownWood })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A176_Wheelmaker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Wheelmaker',
    deck: 'A',
    number: 176,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['When you play this card, if you have another occupation in play and more wood than all other players combined, you immediately get wood from the general supply until you have 15 wood.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const A176_Wheelmaker_impl = A176_Wheelmaker.impl
