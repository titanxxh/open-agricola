import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { roomFoodMarkers } from '../../helpers/room-food-markers'

const CARD_ID = 'CWM050_TapestryWeaver'

const rooms = roomFoodMarkers(CARD_ID, false)
const cardImpl = {
  effect: {
    id: CARD_ID,
    onStartHarvestFieldPhase: (_state, player) =>
      player.resources.sheep >= 3 ? rooms.flow(player, 1) : undefined,
    computeBonusScore: (_state, player) => rooms.score(player),
    getStatePresentation: rooms.presentation,
  },
} satisfies CardImpl

export const CWM050_TapestryWeaver = defineOccupationCard({
  meta: {
    id: 'CWM050_TapestryWeaver',
    name: "Tapestry Weaver",
    deck: 'CWM',
    number: 50,
    desc: ["At the start of each harvest field phase, if you have at least 3 <SHEEP>, place 1 <FOOD> from the supply on a room without such a <FOOD> marker. Each marker is worth 1 bonus <SCORE> at the end of the game."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '4+',
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM050.png',
  },
  impl: cardImpl,
})

export const CWM050_TapestryWeaver_impl = CWM050_TapestryWeaver.impl
