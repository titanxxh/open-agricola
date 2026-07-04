import { defineMinorCard } from '../card-source'
import type { GameState } from '../../contract/types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'M097_VillageHall'

const hasSpecialActionCardInFront = (state: GameState, playerId: string) =>
  state.farmersOfTheMoor?.specialActionCards.some((card) =>
    card.location.kind !== 'market' && card.location.playerId === playerId,
  ) ?? false

const cardImpl = {
  effect: {
    id: CARD_ID,
    onStartReturnHome: (state, player) => {
      if (hasSpecialActionCardInFront(state, player.id)) return
      return gainLeaf(CARD_ID, { food: 2 })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M097_VillageHall = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Village Hall",
    deck: "M",
    number: 97,
    category: "FOOD_PROVIDER",
    desc: [
        "At the start of each returning home phase in which there is no special action card in front of you, you get 2 <FOOD>."
    ],
    cost: {
        "wood": 2,
        "clay": 2
    },
    vp: 1,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M097_VillageHall_impl = M097_VillageHall.impl
