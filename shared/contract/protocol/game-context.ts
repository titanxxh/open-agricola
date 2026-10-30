import type { GameTermination } from './game-termination'

export type GameContextLifecycle = 'active' | 'completed' | 'terminated' | 'expired' | 'removed'

export type TerminatedGameContextDescriptor = {
  ok: true
  roomId: string
  lifecycle: 'terminated'
  replayStatus: 'available'
  termination: GameTermination
  replay: NonNullable<CompletedGameContextDescriptor['replay']>
}

export type ActiveGameContextDescriptor = {
  ok: true
  roomId: string
  lifecycle: 'active'
  phase: 'waiting' | 'playing'
  playerIndex: number
  roomVersion: number
  stepNo: number
  expiresAt?: number
}

export type CompletedGameContextDescriptor = {
  ok: true
  roomId: string
  lifecycle: 'completed'
  replayStatus: 'available' | 'legacy_no_replay'
  result: {
    startedAt: number
    finishedAt: number
    roundsPlayed: number
    playerCount: number
    enableCommunityDeck: boolean
    enableParentCards: boolean
    enableThroughTheSeasons: boolean
    enableFarmersOfTheMoor: boolean
    enableMoorBalanceRules?: boolean
    enableSnakeOpening: boolean
    players: Array<{
      playerIndex: number
      displayName: string
      nameIsDefault?: boolean
      score: number
    }>
  }
  replay?: {
    firstStepNo: number
    lastStepNo: number
    missingPrefix: boolean
    schemaVersion: number
    viewerBuildId: string
  }
}

export type ExpiredGameContextDescriptor = {
  ok: true
  roomId: string
  lifecycle: 'expired'
}

export type RemovedGameContextDescriptor = {
  ok: true
  roomId: string
  lifecycle: 'removed'
  reason: 'moderation' | 'legal' | 'removed'
}

export type GameContextDescriptor =
  | ActiveGameContextDescriptor
  | CompletedGameContextDescriptor
  | TerminatedGameContextDescriptor
  | ExpiredGameContextDescriptor
  | RemovedGameContextDescriptor

export type GameContextErrorCode =
  | 'invalid_context_link'
  | 'login_required'
  | 'not_participant'
  | 'unknown_context'
  | 'anchor_mismatch'
  | 'context_changed'
  | 'context_expired'
  | 'context_removed'
  | 'rate_limited'
  | 'replay_segment_unavailable'
  | 'viewer_unavailable'

export type GameContextError = {
  ok: false
  code: GameContextErrorCode
  message: string
  lifecycle?: GameContextLifecycle
  returnTo?: string
}

export type GameContextResponse = GameContextDescriptor | GameContextError
