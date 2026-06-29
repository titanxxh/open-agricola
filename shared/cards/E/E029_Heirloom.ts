import { defineMinorCard } from '../card-source'
import { spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'E029_Heirloom'

const cardImpl = {
  // E29 Heirloom: prerequisite — you have a person placed on the Day Laborer action.
  // Pure bonus-VP minor (2 VP). Once played, has no additional effect.
  prerequisiteCheck: (player, state) => {
    if (!state) return true
    const dayLaborerSpace = (state.actionSpaces ?? []).find((space) => space.id === 'day-laborer')
    if (!dayLaborerSpace) return false
    return spaceHasPlayer(dayLaborerSpace, player.id)
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E029_Heirloom = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Heirloom',
    deck: 'E',
    number: 29,
    category: 'BONUS_POINTS_-_GET',
    desc: ['(This card has no additional effect.)'],
    cost: {},
    vp: 2,
    prerequisite: 'Your Person on Day Laborer',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const E029_Heirloom_impl = E029_Heirloom.impl
