import { getFarmyardFields } from '../../helpers/card-field'
import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM010_CloisterDweller'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) => {
      const columns = new Set(
        [
          ...player.roomTiles,
          ...getFarmyardFields(player),
          ...player.pastures.flatMap((p) => p.tiles),
        ].map((t) => t.col),
      )
      return [...columns].filter(
        (col) =>
          player.roomTiles.filter((t) => t.col === col).length === 3 ||
          getFarmyardFields(player).filter((t) => t.col === col).length === 3 ||
          player.pastures.some((p) => p.tiles.filter((t) => t.col === col).length === 3),
      ).length
    },
  },
} satisfies CardImpl

export const CWM010_CloisterDweller = defineOccupationCard({
  meta: {
    id: 'CWM010_CloisterDweller',
    name: "Cloister Dweller",
    deck: 'CWM',
    number: 10,
    desc: ["At the end of the game, get 1 bonus point for each column of three farmyard spaces consisting entirely of rooms, entirely of fields, or entirely of one pasture."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM010.png',
  },
  impl: cardImpl,
})

export const CWM010_CloisterDweller_impl = CWM010_CloisterDweller.impl
