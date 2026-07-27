import type Database from 'better-sqlite3'
import type { CustomCardDef } from '../../shared/contract/protocol/game.ts'
import type { GameContextLifecycle } from '../../shared/contract/protocol/game-context.ts'
import type {
  ReplayAnchorResponse,
  ReplayFrameStep,
  ReplayJsonValue,
  ReplayManifest,
  ReplayManifestResponse,
  ReplaySegmentDescriptor,
  ReplaySegmentResponse,
  ReplayStepSummary,
  ReplayUnavailableError,
} from '../../shared/contract/protocol/replay.ts'
import type { SerializedGameState } from '../../shared/session/serialization.ts'
import { decodeReplayFrame, type JsonValue } from './replay-codec.ts'

type SqliteDb = Pick<Database.Database, 'prepare'>

type ReplayHeaderRow = {
  lifecycle: GameContextLifecycle
  replay_status: 'available' | 'legacy_no_replay' | null
  status: 'recording' | 'completed' | null
  schema_version: number | null
  viewer_build_id: string | null
  game_build_id: string | null
  latest_step_no: number | null
  missing_prefix: number | null
  custom_cards_json: string | null
}

type ReplayParticipantRow = {
  player_index: number
  display_name: string
}

type ReplaySegmentRow = {
  checkpoint_step_no: number
  first_step_no: number
  last_step_no: number
}

type ReplayStepRow = {
  step_no: number
  room_version: number
  checkpoint_step_no: number
  player_index: number | null
  command_type: string
  intent_json: string
  payload_kind: 'checkpoint' | 'delta'
  payload_gzip: Buffer
  frame_hash: string
  created_at: number
}

type ReplayAnchorRow = {
  checkpoint_step_no: number
  frame_hash: string
}

type ReplayStepSummaryRow = Omit<ReplayStepRow, 'payload_kind' | 'payload_gzip'>

type AvailableHeader = {
  schemaVersion: number
  viewerBuildId: string
  gameBuildId: string
  latestStepNo: number
  missingPrefix: boolean
  customCards: CustomCardDef[]
}

const replayError = (
  code: ReplayUnavailableError['code'],
  message: string,
  lifecycle?: GameContextLifecycle,
): ReplayUnavailableError => ({
  ok: false,
  code,
  message,
  ...(lifecycle ? { lifecycle } : {}),
})

const parseCustomCards = (raw: string): CustomCardDef[] => {
  const value = JSON.parse(raw) as unknown
  if (!Array.isArray(value)) throw new Error('invalid replay custom cards')
  return value as CustomCardDef[]
}

const parseIntent = (raw: string): ReplayJsonValue =>
  JSON.parse(raw) as ReplayJsonValue

const logPlayerNameKeys = ['player', 'playerName', 'fromPlayer', 'toPlayer'] as const

const projectParticipantNames = (
  frame: SerializedGameState,
  participantNames: ReadonlyMap<number, string>,
): SerializedGameState => {
  const replacements = new Map<string, string>()
  const ambiguousNames = new Set<string>()
  const projectedNames = new Map<string, Set<string>>()
  const namesByPlayerId = new Map<string, string>()
  frame.players.forEach((player, playerIndex) => {
    const name = participantNames.get(playerIndex) ?? player.name
    namesByPlayerId.set(player.id, name)
    const targets = projectedNames.get(player.name) ?? new Set<string>()
    targets.add(name)
    projectedNames.set(player.name, targets)
  })
  projectedNames.forEach((targets, originalName) => {
    if (targets.size === 1) {
      const [name] = targets
      if (name !== originalName) replacements.set(originalName, name!)
    } else if ([...targets].some((name) => name !== originalName)) {
      ambiguousNames.add(originalName)
    }
  })
  const projectZones = (
    zones: SerializedGameState['players'][number]['borrowedPlayedCardAnimalZones'] | undefined,
  ) => zones?.map((zone) => {
    const name = zone.ownerPlayerId
      ? namesByPlayerId.get(zone.ownerPlayerId)
      : undefined
    return name && zone.displayOwnerName !== name
      ? { ...zone, displayOwnerName: name }
      : zone
  })
  const frameWithScores = frame as SerializedGameState & {
    scores?: Array<{ playerId: string; playerName: string }>
  }
  return {
    ...frame,
    players: frame.players.map((player, playerIndex) => ({
      ...player,
      name: participantNames.get(playerIndex) ?? player.name,
      ...(player.playedCardAnimalZones
        ? { playedCardAnimalZones: projectZones(player.playedCardAnimalZones) }
        : {}),
      ...(player.farmCardAnimalZones
        ? { farmCardAnimalZones: projectZones(player.farmCardAnimalZones) }
        : {}),
      ...(player.borrowedPlayedCardAnimalZones
        ? { borrowedPlayedCardAnimalZones: projectZones(player.borrowedPlayedCardAnimalZones) }
        : {}),
    })),
    ...(frame.log
      ? {
          log: frame.log.map((entry) => {
            if (!entry.params) return entry
            const params = { ...entry.params }
            logPlayerNameKeys.forEach((key) => {
              if (typeof params[key] === 'string') {
                const idKey = key === 'fromPlayer'
                  ? 'fromPlayerId'
                  : key === 'toPlayer'
                    ? 'toPlayerId'
                    : 'playerId'
                const playerId = typeof params[idKey] === 'string'
                  ? params[idKey]
                  : (key === 'player' || key === 'playerName')
                      ? entry.playerId
                      : undefined
                params[key] = (
                  playerId ? namesByPlayerId.get(playerId) : undefined
                ) ?? replacements.get(params[key]) ?? (
                  ambiguousNames.has(params[key]) ? 'Deleted player' : params[key]
                )
              }
            })
            return { ...entry, params }
          }),
        }
      : {}),
    ...(frameWithScores.scores
      ? {
          scores: frameWithScores.scores.map((score) => ({
            ...score,
            playerName: namesByPlayerId.get(score.playerId) ?? score.playerName,
          })),
        }
      : {}),
  }
}

export class ReplayStore {
  private readonly db: SqliteDb

  constructor(db: SqliteDb) {
    this.db = db
  }

  private header(roomId: string): AvailableHeader | ReplayUnavailableError {
    const row = this.db.prepare(`
      SELECT context.lifecycle,
             context.replay_status,
             replay.status,
             replay.schema_version,
             replay.viewer_build_id,
             replay.game_build_id,
             replay.latest_step_no,
             replay.missing_prefix,
             replay.custom_cards_json
      FROM game_contexts AS context
      LEFT JOIN game_replays AS replay ON replay.room_id = context.room_id
      WHERE context.room_id = ?
    `).get(roomId) as ReplayHeaderRow | undefined
    if (!row) return replayError('unknown_context', 'Game context not found')
    if (row.lifecycle === 'removed') {
      return replayError('context_removed', 'Replay has been removed', 'removed')
    }
    if (row.lifecycle === 'expired') {
      return replayError('context_expired', 'Replay has expired', 'expired')
    }
    if (row.lifecycle === 'active') {
      return replayError('context_changed', 'Game is still active', 'active')
    }
    if (
      row.replay_status !== 'available'
      || row.status !== 'completed'
      || row.schema_version === null
      || row.viewer_build_id === null
      || row.game_build_id === null
      || row.latest_step_no === null
      || row.missing_prefix === null
      || row.custom_cards_json === null
    ) {
      return replayError(
        'replay_segment_unavailable',
        'This completed game has no replay archive',
        'completed',
      )
    }
    try {
      return {
        schemaVersion: row.schema_version,
        viewerBuildId: row.viewer_build_id,
        gameBuildId: row.game_build_id,
        latestStepNo: row.latest_step_no,
        missingPrefix: row.missing_prefix === 1,
        customCards: parseCustomCards(row.custom_cards_json),
      }
    } catch {
      return replayError(
        'replay_segment_unavailable',
        'Replay metadata is unavailable',
        'completed',
      )
    }
  }

  private segmentDescriptors(roomId: string): ReplaySegmentDescriptor[] {
    return (this.db.prepare(`
      SELECT checkpoint_step_no,
             MIN(step_no) AS first_step_no,
             MAX(step_no) AS last_step_no
      FROM game_replay_steps
      WHERE room_id = ?
      GROUP BY checkpoint_step_no
      ORDER BY checkpoint_step_no
    `).all(roomId) as ReplaySegmentRow[]).map((row) => ({
      checkpointStepNo: row.checkpoint_step_no,
      firstStepNo: Math.min(row.checkpoint_step_no, row.first_step_no),
      lastStepNo: row.last_step_no,
    }))
  }

  private participants(roomId: string): ReplayParticipantRow[] {
    return this.db.prepare(`
      SELECT player_index, display_name
      FROM game_result_players
      WHERE room_id = ?
      ORDER BY player_index
    `).all(roomId) as ReplayParticipantRow[]
  }

  manifest(roomId: string): ReplayManifestResponse {
    const header = this.header(roomId)
    if ('ok' in header) return header
    const segments = this.segmentDescriptors(roomId)
    if (segments.length === 0) {
      return replayError(
        'replay_segment_unavailable',
        'Replay has no readable segments',
        'completed',
      )
    }
    const participants = this.participants(roomId)
    let steps: ReplayStepSummary[]
    try {
      steps = (this.db.prepare(`
        SELECT step_no,
               room_version,
               checkpoint_step_no,
               player_index,
               command_type,
               intent_json,
               frame_hash,
               created_at
        FROM game_replay_steps
        WHERE room_id = ?
        ORDER BY step_no
      `).all(roomId) as ReplayStepSummaryRow[]).map((step) => ({
        stepNo: step.step_no,
        roomVersion: step.room_version,
        checkpointStepNo: step.checkpoint_step_no,
        playerIndex: step.player_index,
        commandType: step.command_type,
        intent: parseIntent(step.intent_json),
        frameHash: step.frame_hash,
        createdAt: step.created_at,
      }))
    } catch {
      return replayError(
        'replay_segment_unavailable',
        'Replay metadata is unavailable',
        'completed',
      )
    }
    const corruptRanges: ReplayManifest['corruptRanges'] = []
    let expectedStepNo = 0
    for (const step of steps) {
      if (step.stepNo > expectedStepNo) {
        const lastStepNo = step.stepNo - 1
        const nextCheckpointStepNo = segments.find(
          (segment) => segment.checkpointStepNo > lastStepNo,
        )?.checkpointStepNo
        corruptRanges.push({
          firstStepNo: expectedStepNo,
          lastStepNo,
          ...(nextCheckpointStepNo === undefined ? {} : { nextCheckpointStepNo }),
        })
      }
      expectedStepNo = step.stepNo + 1
    }
    if (expectedStepNo <= header.latestStepNo) {
      corruptRanges.push({
        firstStepNo: expectedStepNo,
        lastStepNo: header.latestStepNo,
      })
    }
    return {
      ok: true,
      kind: 'replayManifest',
      apiVersion: 1,
      roomId,
      schemaVersion: header.schemaVersion,
      viewerBuildId: header.viewerBuildId,
      gameBuildId: header.gameBuildId,
      firstStepNo: 0,
      lastStepNo: header.latestStepNo,
      missingPrefix: header.missingPrefix,
      participants: participants.map((participant) => ({
        playerIndex: participant.player_index,
        displayName: participant.display_name,
      })),
      segments,
      steps,
      corruptRanges,
      customCards: header.customCards,
    }
  }

  segment(roomId: string, checkpointStepNo: number): ReplaySegmentResponse {
    const header = this.header(roomId)
    if ('ok' in header) return header
    const descriptor = this.segmentDescriptors(roomId)
      .find((segment) => segment.checkpointStepNo === checkpointStepNo)
    if (!descriptor) {
      return replayError(
        'replay_segment_unavailable',
        'Replay segment not found',
        'completed',
      )
    }
    const rows = this.db.prepare(`
      SELECT step_no,
             room_version,
             checkpoint_step_no,
             player_index,
             command_type,
             intent_json,
             payload_kind,
             payload_gzip,
             frame_hash,
             created_at
      FROM game_replay_steps
      WHERE room_id = ? AND checkpoint_step_no = ?
      ORDER BY step_no
    `).all(roomId, checkpointStepNo) as ReplayStepRow[]
    const participantNames = new Map(
      this.participants(roomId).map((participant) => [
        participant.player_index,
        participant.display_name,
      ]),
    )
    let previousFrame: JsonValue | null = null
    const steps: ReplayFrameStep[] = []
    try {
      for (const row of rows) {
        if (
          row.checkpoint_step_no !== checkpointStepNo
          || (steps.length === 0 && (
            row.step_no !== checkpointStepNo
            || row.payload_kind !== 'checkpoint'
          ))
        ) throw new Error('invalid replay segment boundary')
        const frame = decodeReplayFrame(previousFrame, {
          payloadKind: row.payload_kind,
          payloadGzip: row.payload_gzip,
          checkpointStepNo: row.checkpoint_step_no,
          frameHash: row.frame_hash,
        })
        previousFrame = frame
        const serializedFrame = frame as unknown as SerializedGameState
        steps.push({
          stepNo: row.step_no,
          roomVersion: row.room_version,
          checkpointStepNo: row.checkpoint_step_no,
          playerIndex: row.player_index,
          commandType: row.command_type,
          intent: parseIntent(row.intent_json),
          frameHash: row.frame_hash,
          createdAt: row.created_at,
          frame: projectParticipantNames(serializedFrame, participantNames),
        })
      }
    } catch {
      const nextCheckpointStepNo = this.segmentDescriptors(roomId)
        .find((segment) => segment.checkpointStepNo > checkpointStepNo)
        ?.checkpointStepNo
      return {
        ...replayError(
          'replay_segment_unavailable',
          'Replay segment failed its integrity check',
          'completed',
        ),
        unavailableRange: {
          firstStepNo: descriptor.firstStepNo,
          lastStepNo: descriptor.lastStepNo,
          ...(nextCheckpointStepNo === undefined ? {} : { nextCheckpointStepNo }),
        },
      }
    }
    return {
      ok: true,
      kind: 'replaySegment',
      apiVersion: 1,
      roomId,
      schemaVersion: header.schemaVersion,
      viewerBuildId: header.viewerBuildId,
      checkpointStepNo,
      steps,
    }
  }

  anchor(roomId: string, stepNo: number, expectedHash: string): ReplayAnchorResponse {
    const header = this.header(roomId)
    if ('ok' in header) return header
    const row = this.db.prepare(`
      SELECT checkpoint_step_no, frame_hash
      FROM game_replay_steps
      WHERE room_id = ? AND step_no = ?
    `).get(roomId, stepNo) as ReplayAnchorRow | undefined
    if (!row || row.frame_hash !== expectedHash) {
      return replayError(
        'anchor_mismatch',
        'Replay anchor does not match the archived frame',
        'completed',
      )
    }
    const segment = this.segment(roomId, row.checkpoint_step_no)
    if (!segment.ok) {
      return {
        ...segment,
        verifiedAnchor: { stepNo, frameHash: expectedHash },
      }
    }
    const step = segment.steps.find((candidate) => candidate.stepNo === stepNo)
    if (!step) {
      return replayError(
        'anchor_mismatch',
        'Replay anchor does not match the archived frame',
        'completed',
      )
    }
    return {
      ok: true,
      kind: 'replayAnchor',
      apiVersion: 1,
      roomId,
      schemaVersion: header.schemaVersion,
      viewerBuildId: header.viewerBuildId,
      anchor: { stepNo, frameHash: expectedHash },
      step,
    }
  }
}
