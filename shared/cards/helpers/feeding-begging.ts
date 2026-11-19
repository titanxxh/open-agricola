import type { GameState, PlayerState } from '../../contract/types'
export function feedingBeggingRemaining(state: GameState, player: PlayerState): number {
  return Math.max(
    0,
    state.events.reduce((count, event) => {
      if (event.type !== 'resource.paid' || event.actorPlayerId !== player.id) return count
      const amount = event.resources.begging ?? 0
      return count + (event.paymentFor === 'feeding' ? amount : -amount)
    }, 0),
  )
}
