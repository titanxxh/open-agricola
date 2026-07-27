import type { SerializedGameState } from '../../session/serialization'
import type { CustomCardDef } from './game'
import type { GameContextError } from './game-context'

export type ReplayJsonValue =
  | null
  | boolean
  | number
  | string
  | ReplayJsonValue[]
  | { [key: string]: ReplayJsonValue }

export type ReplayParticipant = {
  playerIndex: number
  displayName: string
}

export type ReplaySegmentDescriptor = {
  checkpointStepNo: number
  firstStepNo: number
  lastStepNo: number
}

export type ReplayStepSummary = {
  stepNo: number
  roomVersion: number
  checkpointStepNo: number
  playerIndex: number | null
  commandType: string
  intent: ReplayJsonValue
  frameHash: string
  createdAt: number
}

export type ReplayManifest = {
  ok: true
  kind: 'replayManifest'
  apiVersion: 1
  roomId: string
  schemaVersion: number
  viewerBuildId: string
  gameBuildId: string
  firstStepNo: number
  lastStepNo: number
  missingPrefix: boolean
  participants: ReplayParticipant[]
  segments: ReplaySegmentDescriptor[]
  steps: ReplayStepSummary[]
  corruptRanges: Array<{
    firstStepNo: number
    lastStepNo: number
    nextCheckpointStepNo?: number
  }>
  customCards: CustomCardDef[]
}

export type ReplayFrameStep = ReplayStepSummary & {
  frame: SerializedGameState
}

export type ReplaySegment = {
  ok: true
  kind: 'replaySegment'
  apiVersion: 1
  roomId: string
  schemaVersion: number
  viewerBuildId: string
  checkpointStepNo: number
  steps: ReplayFrameStep[]
}

export type ReplayAnchorEvidence = {
  ok: true
  kind: 'replayAnchor'
  apiVersion: 1
  roomId: string
  schemaVersion: number
  viewerBuildId: string
  anchor: {
    stepNo: number
    frameHash: string
  }
  step: ReplayFrameStep
}

export type ReplayUnavailableError = GameContextError & {
  unavailableRange?: {
    firstStepNo: number
    lastStepNo: number
    nextCheckpointStepNo?: number
  }
  verifiedAnchor?: {
    stepNo: number
    frameHash: string
  }
}

export type ReplayManifestResponse = ReplayManifest | ReplayUnavailableError
export type ReplaySegmentResponse = ReplaySegment | ReplayUnavailableError
export type ReplayAnchorResponse = ReplayAnchorEvidence | ReplayUnavailableError
