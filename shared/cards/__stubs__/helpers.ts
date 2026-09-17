import type { PlayerState } from '../../contract/types'

export const initCardState = (player: PlayerState, cardId: string) => {
  if (!player.cardStates) player.cardStates = {}
  if (!player.cardStates[cardId]) player.cardStates[cardId] = { counters: {} }
  if (!player.cardStates[cardId].counters) player.cardStates[cardId].counters = {}
  return player.cardStates[cardId].counters!
}

/** Stage-hook stubs (effects) may mutate state directly; listener stubs must not. */
export const incCounter = (player: PlayerState, cardId: string, key: string, delta = 1) => {
  const counters = initCardState(player, cardId)
  counters[key] = (counters[key] ?? 0) + delta
}

/**
 * Test-side observation ledger for listener stubs. Listener handlers must stay
 * state-pure, so stubs record "I fired" here instead of writing `cardStates`.
 */
const observations = new Map<string, number>()

const observationKey = (player: Pick<PlayerState, 'id'>, cardId: string, key: string) =>
  `${player.id}\u0000${cardId}\u0000${key}`

export const observe = (player: Pick<PlayerState, 'id'>, cardId: string, key = 'observedCount', delta = 1) => {
  const id = observationKey(player, cardId, key)
  observations.set(id, (observations.get(id) ?? 0) + delta)
}

export const readObservation = (player: Pick<PlayerState, 'id'>, cardId: string, key = 'observedCount'): number | undefined =>
  observations.get(observationKey(player, cardId, key))

export const clearObservations = () => {
  observations.clear()
}
