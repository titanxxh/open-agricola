import type { EventSink } from '../contract/events'
import type { FarmTilePosition, GameState, PlayerState } from '../contract/types'
import { reconcileOrdinaryHousePet } from './animal-zones'
import { commitFarmOperation, commitFirstAvailableRoom } from './farm-operations'

/** Commit room geometry and its ordinary pet assignment before trailing rules run. */
export function commitRoomConstruction(
  state: GameState,
  player: PlayerState,
  positions: readonly FarmTilePosition[],
  sourceCardId?: string,
  eventSink?: EventSink,
) {
  const receipt = commitFarmOperation(player, { kind: 'rooms', positions, sourceCardId }, eventSink)
  reconcileOrdinaryHousePet(player, state)
  return receipt
}

export function commitFirstAvailableRoomConstruction(
  state: GameState,
  player: PlayerState,
  sourceCardId?: string,
  eventSink?: EventSink,
) {
  const receipt = commitFirstAvailableRoom(player, sourceCardId, eventSink)
  if (receipt) reconcileOrdinaryHousePet(player, state)
  return receipt
}
