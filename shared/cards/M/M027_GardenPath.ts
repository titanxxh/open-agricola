import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { addPublicCardMarker, readPublicCardMarkers, writePublicCardMarkers } from '../helpers/public-card-markers'
import type { CardImpl } from '../registry'
import type { GameState } from '../../contract/types'

const CARD_ID = 'M027_GardenPath'
const MARKER_ID = 'garden-path'

const leftPlayerOf = (state: GameState, playerId: string) => {
  const index = state.players.findIndex((player) => player.id === playerId)
  if (index < 0 || state.players.length === 0) return undefined
  return state.players[(index + 1) % state.players.length]
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const leftPlayer = leftPlayerOf(state, player.id)
      if (leftPlayer && leftPlayer.id !== player.id) {
        for (const holder of state.players) {
          const markers = readPublicCardMarkers(holder, CARD_ID)
          const remaining = markers.filter(marker => marker.id !== MARKER_ID || marker.sourceCardId !== CARD_ID)
          if (remaining.length !== markers.length) writePublicCardMarkers(holder, CARD_ID, remaining)
        }
        addPublicCardMarker(leftPlayer, CARD_ID, {
          id: MARKER_ID,
          label: 'Garden Path',
          labelKey: 'cardFaces.M027_GardenPath.name',
          score: -1,
          sourceCardId: CARD_ID,
          sourcePlayerId: player.id,
        })
      }
      return gainLeaf(CARD_ID, { wood: 3 })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M027_GardenPath = defineMinorCard({
  presentation: { publicCardMarkers: true },
  meta: {
    id: CARD_ID,
    name: "Garden Path",
    deck: "M",
    number: 27,
    category: "ACTIONS_BOOSTER",
    desc: [
        "You immediately get 3 <WOOD>. The player to your left must immediately place the \"Garden Path\" token in front of them."
    ],
    rules: [
      'During scoring, the player holding the __Garden Path__ token loses 1 <SCORE>. There is only one token: each time this card is played, move it to the player to the left. The previous holder no longer has it.',
    ],
    cost: {
        "clay": 1
    },
    prerequisite: "At Least 1 Forest",
    passing: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M027_GardenPath_impl = M027_GardenPath.impl
