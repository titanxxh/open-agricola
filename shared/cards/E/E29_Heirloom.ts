import { spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'

export const E29_Heirloom_impl = {
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
