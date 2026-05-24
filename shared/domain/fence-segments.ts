import type { FenceSegment, PlayerState } from '../contract/types'

export const MAX_ORDINARY_FENCE_PIECES = 15

export function isOwnOrdinaryFenceSegment(segment: FenceSegment, playerId: string): boolean {
  if (segment.type !== 'fence') return false
  if (!segment.source) return true
  return segment.source.kind === 'own' && segment.source.ownerPlayerId === playerId
}

export function getOwnOrdinaryFenceCount(player: PlayerState): number {
  return player.fenceSegments.filter((segment) => isOwnOrdinaryFenceSegment(segment, player.id)).length
}

export function getAvailableOwnOrdinaryFenceCount(player: PlayerState): number {
  return Math.max(0, MAX_ORDINARY_FENCE_PIECES - getOwnOrdinaryFenceCount(player))
}
