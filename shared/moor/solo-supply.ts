import type { GameState } from '../contract/types'
import type { MoorSpecialActionCardState } from './types'

export const soloMoorCurrent = (state: GameState): MoorSpecialActionCardState | undefined =>
  state.players.length === 1 ? state.farmersOfTheMoor?.specialActionCards.find(card => card.location.kind === 'solo-current') : undefined

export const soloMoorDraw = (state: GameState): MoorSpecialActionCardState[] =>
  (state.farmersOfTheMoor?.specialActionCards ?? []).filter(card => card.location.kind === 'solo-draw')
    .sort((a, b) => (a.location.kind === 'solo-draw' ? a.location.order : 0) - (b.location.kind === 'solo-draw' ? b.location.order : 0))

export const discardSoloMoorCurrent = (state: GameState, cardId: string): boolean => {
  const card = soloMoorCurrent(state)
  if (card?.id !== cardId) return false
  const orders = state.farmersOfTheMoor!.specialActionCards.flatMap(candidate => candidate.location.kind === 'solo-discard' ? [candidate.location.order] : [])
  card.location = { kind: 'solo-discard', order: Math.max(-1, ...orders) + 1 }
  return true
}

/** Returns whether a previously hidden face was disclosed. */
export const revealSoloMoorCurrent = (state: GameState): boolean => {
  if (soloMoorCurrent(state)) return false
  const next = soloMoorDraw(state)[0]
  if (next) { next.location = { kind: 'solo-current' }; return true }
  const last = (state.farmersOfTheMoor?.specialActionCards ?? []).filter(card => card.location.kind === 'solo-discard')
    .sort((a, b) => (b.location.kind === 'solo-discard' ? b.location.order : 0) - (a.location.kind === 'solo-discard' ? a.location.order : 0))[0]
  if (last) last.location = { kind: 'solo-current' }
  return false
}
