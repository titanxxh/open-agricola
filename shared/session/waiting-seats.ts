import { playerColorOptions } from '../contract/state-constants'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const draftPickSubmitted = (draft: Record<string, unknown>, pick: unknown): boolean => {
  if (!isRecord(pick)) return false
  if (draft.stage === 'occupation') return typeof pick.occ === 'string'
  if (draft.stage === 'farmersOfTheMoorMinor' || draft.stage === 'publishedMinor') return typeof pick.minor === 'string'
  return typeof pick.occ === 'string' && typeof pick.minor === 'string'
}

export function waitingSeatIndexes(
  status: 'waiting' | 'playing',
  state: unknown,
  occupiedSeats: readonly number[],
  actorIndex: number | null,
): number[] {
  if (!isRecord(state)) return []
  const players = Array.isArray(state.players) ? state.players : []
  const draft = isRecord(state.draft) ? state.draft : null
  const pendingPicks = draft && isRecord(draft.pendingPicks) ? draft.pendingPicks : {}
  const parentSelection = isRecord(state.parentSelection) ? state.parentSelection : null
  const parentSubmissions = parentSelection && isRecord(parentSelection.submissions)
    ? parentSelection.submissions
    : null
  const waiting: number[] = []
  players.forEach((player: unknown, playerIndex) => {
    if (!occupiedSeats.includes(playerIndex) || !isRecord(player) || typeof player.name !== 'string') return
    if (!playerColorOptions.some(color => color === player.color)) return
    if (status === 'playing' && state.phase === 'draft' && draft && typeof player.id === 'string') {
      if (!draftPickSubmitted(draft, pendingPicks[player.id])) waiting.push(playerIndex)
    } else if (status === 'playing' && state.phase === 'parent-selection' && parentSubmissions && typeof player.id === 'string') {
      if (!isRecord(parentSubmissions[player.id])) waiting.push(playerIndex)
    } else if (status === 'playing' && state.phase === 'playing' && playerIndex === actorIndex) waiting.push(playerIndex)
  })
  return waiting
}

export function playingActorIndex(
  phase: unknown,
  gameOver: unknown,
  frameOwnerIndex: number | null,
  currentPlayerIndex: number,
): number | null {
  if (phase !== 'playing' || gameOver === true) return null
  return frameOwnerIndex ?? currentPlayerIndex
}
