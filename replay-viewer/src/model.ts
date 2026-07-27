import type {
  ReplayLayout,
  ReplayPerspective,
} from './types'
import type {
  ReplayManifest,
  ReplaySegmentDescriptor,
} from '../../shared/contract/protocol/replay'
import type { SerializedGameState } from '../../shared/session/serialization'
import { filterSerializedStateForPlayer } from '../../shared/session/serialization'

export const validPerspective = (
  value: string | null,
  manifest: ReplayManifest,
): ReplayPerspective | null => {
  if (value === 'open') return value
  const match = /^p([1-9]\d*)$/.exec(value ?? '')
  if (!match) return null
  const playerIndex = Number(match[1]) - 1
  return manifest.participants.some((participant) => participant.playerIndex === playerIndex)
    ? `p${playerIndex + 1}`
    : null
}

export const resolveLayout = (
  value: string | null,
  width: number,
): ReplayLayout =>
  value === 'timeline' || value === 'board'
    ? value
    : width <= 900
      ? 'board'
      : 'timeline'

export const segmentForStep = (
  manifest: ReplayManifest,
  stepNo: number,
): ReplaySegmentDescriptor | null =>
  manifest.segments.find((segment) =>
    stepNo >= segment.firstStepNo && stepNo <= segment.lastStepNo,
  ) ?? null

export const frameForPerspective = (
  frame: SerializedGameState,
  perspective: ReplayPerspective,
): SerializedGameState => {
  if (perspective === 'open') return frame
  const playerIndex = Number(perspective.slice(1)) - 1
  const playerId = frame.players[playerIndex]?.id ?? null
  return filterSerializedStateForPlayer(frame, playerId)
}

export const perspectivePlayerId = (
  frame: SerializedGameState,
  perspective: ReplayPerspective,
): string | null =>
  perspective === 'open'
    ? null
    : frame.players[Number(perspective.slice(1)) - 1]?.id ?? null
