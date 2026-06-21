import type { GameState, PlayerState, Resource } from '../../contract/types'

export const evaluateWithReservedResources = (
  state: GameState,
  player: PlayerState,
  reserved: Partial<Resource>,
  evaluate: (state: GameState, player: PlayerState) => boolean,
): boolean => {
  for (const [rawKey, rawAmount] of Object.entries(reserved)) {
    const amount = rawAmount ?? 0
    if (amount <= 0) continue
    const key = rawKey as keyof Resource
    if ((player.resources[key] ?? 0) < amount) return false
  }
  const nextPlayer: PlayerState = {
    ...player,
    resources: { ...player.resources },
  }
  for (const [rawKey, rawAmount] of Object.entries(reserved)) {
    const amount = rawAmount ?? 0
    if (amount <= 0) continue
    const key = rawKey as keyof Resource
    nextPlayer.resources[key] = (nextPlayer.resources[key] ?? 0) - amount
  }
  const index = state.players.indexOf(player)
  const nextState = index >= 0
    ? { ...state, players: state.players.map((entry, i) => (i === index ? nextPlayer : entry)) }
    : state
  return evaluate(nextState, nextPlayer)
}
