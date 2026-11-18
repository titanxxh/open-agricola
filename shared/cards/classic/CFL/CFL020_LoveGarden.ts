import { openRoundForSpace } from '../../../actions/helpers/placement-availability'
import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CFL020_LoveGarden'

const cardImpl = {
  prerequisiteCheck: (_player, state) =>
    !!state?.actionSpaces.some(
      (space) =>
        openRoundForSpace(state, space) <= state.round &&
        ['wish-children', 'urgent-wish-children', 'modest-wish-children-56'].includes(space.id) &&
        openRoundForSpace(state, space) <= state.round,
    ),
  effect: {
    id: CARD_ID,
    onAllWorkersPlaced: (state) => {
      const spaces = state.actionSpaces.filter(
        (space) =>
          [
            'farm-expansion',
            'wish-children',
            'urgent-wish-children',
            'modest-wish-children-56',
            'house-building-56',
          ].includes(space.id) && openRoundForSpace(state, space) <= state.round,
      )
      if (spaces.length > 1 && spaces.every((space) => space.takenBy.length > 0))
        return {
          type: 'leaf',
          actionId: 'family-growth',
          sourceCard: CARD_ID,
          optional: true,
          actionContext: { trueAction: false },
        }
    },
  },
} satisfies CardImpl

export const CFL020_LoveGarden = defineMinorCard({
  meta: {
    id: 'CFL020_LoveGarden',
    name: 'Love Garden',
    deck: 'CFL',
    number: 20,
    cost: {
      food: 2,
    },
    desc: [
      'At the end of each work phase, if all revealed Family Growth and Build Rooms action spaces are occupied, you may take a Family Growth action with room.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL020.png',
    prerequisite: 'A revealed Family Growth action space',
  },
  impl: cardImpl,
})
