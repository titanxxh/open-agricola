import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { workersAvailable } from '../../../domain/player'

const CARD_ID = 'CWM061_BackDoor'

const cardImpl = {
  prerequisiteCheck: (player, state) =>
    !!state &&
    state.actionSpaces.some((space) => space.id === 'wish-children') &&
    workersAvailable(state, player) >= 1,
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'leaf',
      actionId: 'place-farmer-on-space',
      sourceCard: CARD_ID,
      params: { spaceId: 'wish-children', allowOccupied: true },
    }),
  },
} satisfies CardImpl

export const CWM061_BackDoor = defineMinorCard({
  meta: {
    id: 'CWM061_BackDoor',
    name: "Back Door",
    deck: 'CWM',
    number: 61,
    desc: ["Immediately place another person on the __Wish for Children__ action space, even if it is occupied. Afterwards, pass this card to the next player, who adds it to their hand."],
    cost: {
      reed: 1,
    },
    vp: 1,
    prerequisite: "Family Growth with Room revealed",
    passing: true,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM061.png',
  },
  impl: cardImpl,
})

export const CWM061_BackDoor_impl = CWM061_BackDoor.impl
