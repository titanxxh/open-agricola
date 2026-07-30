/**
 * Farm-choice pre-validation shared by the HTTP `/api/game/validate` endpoint
 * and the browser-local sandbox worker. Runs the farmyard validators against
 * the normalized player view, mirroring the historical router behavior.
 */
import { playerBoard, type SowSelection, normalizePlayerFarm } from '../domain/index.ts'
import { playerCanBuildPalisades } from '../cards/helpers/card-type.ts'
import { collectLockedFarmTileKeys } from '../cards/card-effects.ts'
import type { FarmTilePosition, GameState } from '../contract/types.ts'

export type FarmChoiceType = 'fence' | 'room' | 'stable' | 'plow' | 'sow'

// `requestError` marks a malformed request (missing player / unknown type) that
// the HTTP endpoint should answer with 400, versus an ordinary invalid farm
// placement which is a well-formed 200 response with `valid: false`.
export type FarmChoiceValidation = { valid: boolean; error: string | null; requestError?: boolean }

export const validateFarmChoice = (
  state: Readonly<GameState>,
  type: FarmChoiceType,
  playerId: string,
  payload: Record<string, unknown>,
): FarmChoiceValidation => {
  const playerIndex = state.players.findIndex((p) => p.id === playerId)
  if (playerIndex === -1) {
    return { valid: false, error: 'Player not found', requestError: true }
  }
  const player = normalizePlayerFarm(state.players[playerIndex]!)
  // Validate against the normalized player by swapping it into a shallow
  // state clone — validators run on the normalized view, not the raw state.
  const normalizedPlayers = state.players.slice()
  normalizedPlayers[playerIndex] = player
  const normalizedState = { ...state, players: normalizedPlayers }
  const board = playerBoard(normalizedState, playerIndex)

  if (type === 'fence') {
    const fp = payload as {
      edges?: string[]
      palisadeEdges?: string[]
      extraWood?: number
      fenceSources?: Record<string, string>
    }
    const edges = Array.isArray(fp.edges) ? fp.edges : []
    const palisadeEdges = Array.isArray(fp.palisadeEdges) ? fp.palisadeEdges : []
    const extraWood = fp.extraWood ?? 0
    const lockedKeys = collectLockedFarmTileKeys(state.players[playerIndex]!)
    const result = board.farmyard.canBuildFence({
      edges,
      palisadeEdges,
      extraWood,
      fenceSources: fp.fenceSources,
      freeFences: 0,
      options: { skipPayment: true, allowPalisades: playerCanBuildPalisades(player) },
      lockedKeys,
    })
    return { valid: result.ok, error: result.ok ? null : result.error?.code ?? 'validation failed' }
  }
  if (type === 'room') {
    const rooms = (payload as { rooms?: FarmTilePosition[] }).rooms
    const lockedKeys = collectLockedFarmTileKeys(state.players[playerIndex]!)
    const result = board.farmyard.canBuildRoom(Array.isArray(rooms) ? rooms : [], lockedKeys)
    return { valid: result.ok, error: result.ok ? null : result.code }
  }
  if (type === 'stable') {
    const stables = (payload as { stables?: FarmTilePosition[] }).stables ?? []
    const lockedKeys = collectLockedFarmTileKeys(state.players[playerIndex]!)
    const result = board.farmyard.canBuildStable(stables, lockedKeys)
    return { valid: result.ok, error: result.ok ? null : result.code ?? 'validation failed' }
  }
  if (type === 'plow') {
    const tile = (payload as { tile?: FarmTilePosition }).tile
    const lockedKeys = collectLockedFarmTileKeys(state.players[playerIndex]!)
    const result = board.farmyard.canPlow(tile, lockedKeys)
    return { valid: result.ok, error: result.ok ? null : result.error?.code ?? 'validation failed' }
  }
  if (type === 'sow') {
    const crops = (payload as { crops?: unknown }).crops
    if (!Array.isArray(crops)) {
      return { valid: false, error: 'NO_SELECTION' }
    }
    const result = board.farmyard.canSow({ fields: crops as SowSelection[] })
    return { valid: result.ok, error: result.ok ? null : result.error?.code ?? 'validation failed' }
  }
  return { valid: false, error: 'Unknown validation type', requestError: true }
}
