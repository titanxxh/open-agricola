import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM084_FriendlyPastures'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onComputeAnimalZones: (player, zones) => {
      for (const zone of zones) {
        if (zone.zoneType !== 'pasture' || zone.pastureIndex === undefined) continue
        const pasture = player.pastures[zone.pastureIndex]
        if (
          pasture?.tiles.some((tile) =>
            player.stableTiles.some((stable) => stable.row === tile.row && stable.col === tile.col),
          )
        )
          zone.allowedAnimalType = null
      }
    },
  },
} satisfies CardImpl

export const CWM084_FriendlyPastures = defineMinorCard({
  meta: {
    id: 'CWM084_FriendlyPastures',
    name: "Friendly Pastures",
    deck: 'CWM',
    number: 84,
    desc: ["Each of your pastures containing a stable may hold different animal types together. Its total capacity is unchanged."],
    cost: {
      wood: 2,
    },
    vp: 1,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM084.png',
  },
  impl: cardImpl,
})

export const CWM084_FriendlyPastures_impl = CWM084_FriendlyPastures.impl
