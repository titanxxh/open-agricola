import type { CardImpl } from '../registry'

export const C32_AbortOriel_impl = {
  /**
   * C32 Abort Oriel: cannot be played once any player already has 5 or more
   * cards in front of them. ("May be played as your fifth card" — i.e. you
   * yourself only count BEFORE playing.)
   */
  prerequisiteCheck: (_player, state) => {
    if (!state) return true
    for (const other of state.players ?? []) {
      const count =
        (other.improvements?.length ?? 0) +
        (other.minorPlayed?.length ?? 0) +
        (other.occupationPlayed?.length ?? 0)
      if (count >= 5) return false
    }
    return true
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
