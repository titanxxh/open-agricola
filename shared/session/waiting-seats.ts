import { playerColorOptions } from '../contract/state-constants'
import { migrateLegacyDraft } from '../draft/legacy-draft'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const draftNeedsChoice = (draft: Record<string, unknown>, playerId: string): boolean => {
  if (!Array.isArray(draft.stages)) return false
  for (const value of draft.stages) {
    if (!isRecord(value) || !isRecord(value.seats)) return false
    const seat = value.seats[playerId]
    if (!isRecord(seat) || !isRecord(seat.kept) || !isRecord(seat.inbox)) return false
    const kept = value.kind === 'standard' || value.kind === 'occupation' ? seat.kept.occ : seat.kept.minor
    if (!Array.isArray(kept) || typeof value.totalRounds !== 'number') return false
    if (kept.length < value.totalRounds) return isRecord(seat.inbox[kept.length + 1])
  }
  return false
}

export function waitingSeatIndexes(
  status: 'waiting' | 'playing',
  state: unknown,
  occupiedSeats: readonly number[],
  actorIndex: number | null,
): number[] {
  if (!isRecord(state)) return []
  const players = Array.isArray(state.players) ? state.players : []
  let draft = isRecord(state.draft) ? state.draft : null
  try { draft = migrateLegacyDraft(draft) ?? draft } catch { return [] }
  const parentSelection = isRecord(state.parentSelection) ? state.parentSelection : null
  const parentSubmissions = parentSelection && isRecord(parentSelection.submissions)
    ? parentSelection.submissions
    : null
  const waiting: number[] = []
  players.forEach((player: unknown, playerIndex) => {
    if (!occupiedSeats.includes(playerIndex) || !isRecord(player) || typeof player.name !== 'string') return
    if (!playerColorOptions.some(color => color === player.color)) return
    if (status === 'playing' && state.phase === 'draft' && draft && typeof player.id === 'string') {
      if (draftNeedsChoice(draft, player.id)) waiting.push(playerIndex)
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
