import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { countUnusedFarmyardSpaces } from '../../domain/farm'
import { buildPlaceTerrainFlow } from '../../moor/terrain-flow'

const CARD_ID = 'M066_LandParcel'

const countImprovements = (player: { improvements: string[]; minorPlayed: string[] }) =>
  player.improvements.length + player.minorPlayed.length

const cardImpl = {
  prerequisiteCheck: (player) => countImprovements(player) <= 2,
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => buildPlaceTerrainFlow(CARD_ID, player, 'forest'),
    computeBonusScore: (_state, player) => {
      const unused = countUnusedFarmyardSpaces(player)
      if (unused === 1) return 2
      if (unused === 2) return -1
      if (unused >= 3) return -3
      return 0
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M066_LandParcel = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Land Parcel",
    deck: "M",
    number: 66,
    category: "POINTS_PROVIDER",
    desc: [
        "Place 1 forest on an unused farmyard space. During scoring, if you have 1/2/3+ unused farmyard spaces, you get +2/-1/-3 bonus points on top of the negative points for the unused spaces."
    ],
    cost: {},
    extraVp: true,
    prerequisite: "At Most 2 Improvements",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M066_LandParcel_impl = M066_LandParcel.impl
