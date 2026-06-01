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
  return Math.max(
    0,
    MAX_ORDINARY_FENCE_PIECES -
      Math.max(0, player.supplyTokensConsumed?.fence ?? 0) -
      getOwnOrdinaryFenceCount(player),
  )
}

export const getFenceCount = <T extends { fenceSegments: FenceSegment[] }>(
  p: T,
): number => p.fenceSegments.reduce((n, s) => n + (s.type === 'fence' ? 1 : 0), 0)

export const getPalisadeCount = <T extends { fenceSegments: FenceSegment[] }>(
  p: T,
): number => p.fenceSegments.reduce((n, s) => n + (s.type === 'palisade' ? 1 : 0), 0)

export const getBorrowedFenceCount = <T extends { fenceSegments: FenceSegment[] }>(
  p: T,
): number => p.fenceSegments.reduce(
  (n, s) => n + (s.type === 'fence' && s.source?.kind === 'borrowed' ? 1 : 0),
  0,
)
