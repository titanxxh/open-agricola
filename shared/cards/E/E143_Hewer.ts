import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'
import { HOLLOW_SPACE_IDS } from '../helpers/action-space-categories'

const CARD_ID = 'E143_Hewer'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBeforeReturnHome: (state, _player) => {
    if (state.round < 3) return

    const claySpaceIds = [
      'clay-pit',
      ...HOLLOW_SPACE_IDS.filter((id) => state.actionSpaces.some((space) => space.id === id)),
    ]

    const allUnoccupied = claySpaceIds.every((id) => {
      const space = state.actionSpaces.find((s) => s.id === id)
      return !space || !isSpaceOccupied(space)
    })

    if (!allUnoccupied) return

    return gainLeaf(CARD_ID, { stone: 1, food: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E143_Hewer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Hewer',
    deck: 'E',
    number: 143,
    category: 'BUILDING_RESOURCES_-_CLAY_OR_STONE',
    desc: [
        'From round 3 on, at the end of each work phase in which all <CLAY> accumulation spaces are unoccupied, you get 1 <STONE> and 1 <FOOD>.',
      ],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const E143_Hewer_impl = E143_Hewer.impl
