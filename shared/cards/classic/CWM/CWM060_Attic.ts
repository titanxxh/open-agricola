import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { roomFoodMarkers } from '../../helpers/room-food-markers'
import { positionKey } from '../../../domain/farm'
import { getActionRoomConstructions } from '../../helpers/construction-events'

const CARD_ID = 'CWM060_Attic'

const rooms = roomFoodMarkers(CARD_ID, true, 'wood')
const cardImpl = {
  listeners: [{
    id: CARD_ID + '-rooms', cardIds: [CARD_ID], actions: ['construct'], phases: ['after'],
    handler: context => {
      const built = new Set(getActionRoomConstructions(context, context.player.id)
        .flatMap(operation => operation.positions.map(positionKey)))
      const flow = rooms.flow(context.player, built.size, built)
      return flow ? { sourceCard: CARD_ID, flow } : undefined
    },
  }],
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) => rooms.score(player),
    getStatePresentation: rooms.presentation,
    onRoomsRemoved: rooms.onRoomsRemoved,
  },
} satisfies CardImpl

export const CWM060_Attic = defineMinorCard({
  meta: {
    id: 'CWM060_Attic',
    name: "Attic",
    deck: 'CWM',
    number: 60,
    desc: ["Whenever you build rooms, you may place 1 wood from your supply on each new room. Each such wood is worth 1 bonus point at the end of the game."],
    cost: {},
    vp: 0,
    prerequisite: "",
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM060.png',
  },
  impl: cardImpl,
})

export const CWM060_Attic_impl = CWM060_Attic.impl
