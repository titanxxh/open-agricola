import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import '../../../shared/cards/A/A132_Publican.ts'
import '../../../shared/cards/C/C104_Collector.ts'
import { requireActiveCardRegistry } from '../../../shared/cards/active-registry.ts'
import type { CardListenerRegistration } from '../../../shared/cards/card-listeners.ts'
import { setWorkersAtHome } from '../../../shared/domain/player.ts'
import { serializeSessionSnapshot } from '../../../shared/session/serialization.ts'
import { stabilizeRandomHands } from '../../__tests__/_helpers/stabilize-random-hands.ts'
import { GameSession } from '../authoritative-session.ts'
import { encodeReplayFrame, type JsonValue } from '../replay-codec.ts'
import { ReplayStore } from '../replay-store.ts'
import {
  RoomCommitter,
  replayIntentFromCommand,
  type RoomCommitScheduler,
} from '../room-committer.ts'
import { snapshotToRoom, type Room } from '../room.ts'
import { SqliteRoomPersistence } from '../persistence/sqlite-adapter.ts'

const makeRoom = (id = 'room-1'): Room => ({
  id,
  session: new GameSession(587, undefined, { playerCount: 2 }),
  players: [],
  seatOwners: [],
  maxPlayers: 2,
  version: 0,
  status: 'playing',
  startedAt: 100,
})

const registerNestedConstructHelper = (session: GameSession): void => {
  const cardId = '__TEST_room_nested_construct_helper__'
  const state = session.getState().state
  state.players[1]!.occupationPlayed.push(cardId)
  session.loadState(state)
  const isDoable: CardListenerRegistration = {
    id: '__TEST_room_nested_construct_is_doable__',
    cardIds: [cardId],
    actions: ['construct'],
    phases: ['isDoable'],
    scope: 'opponent',
    handler: (context) => context.actionContext?.skipBeforeTriggers === true
      ? undefined
      : { doable: true },
  }
  const before: CardListenerRegistration = {
    id: '__TEST_room_nested_construct_before__',
    cardIds: [cardId],
    actions: ['construct'],
    phases: ['before'],
    scope: 'opponent',
    handler: (context) => ({
      sourceCard: cardId,
      flow: {
        type: 'leaf',
        actionId: 'gain',
        optional: true,
        sourceCard: cardId,
        params: {
          clay: 3,
          reed: 1,
          recipientPlayerId: context.triggerPlayer?.id ?? context.player.id,
        },
      },
    }),
  }
  session.withCtx(() => {
    const registry = requireActiveCardRegistry('nested Room recovery test')
    registry.registerListener(isDoable)
    registry.registerListener(before)
  })
}

const actionIntent = replayIntentFromCommand({
  type: 'action',
  spaceId: 'forest',
  requestId: 'must-not-persist',
})

const fakeScheduler = () => {
  const tasks: Array<{ callback: () => void; delay: number }> = []
  const scheduler: RoomCommitScheduler = {
    setTimeout(callback, delay) {
      const task = { callback, delay }
      tasks.push(task)
      return task
    },
    clearTimeout(handle) {
      const index = tasks.indexOf(handle as (typeof tasks)[number])
      if (index >= 0) tasks.splice(index, 1)
    },
  }
  return { scheduler, tasks }
}

describe('RoomCommitter', () => {
  let tempDir = ''
  let db: Database.Database
  let persistence: SqliteRoomPersistence

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'open-agricola-room-committer-'))
    process.env.DB_PATH = join(tempDir, 'test.db')
    vi.resetModules()
    const { getDb } = await import('../../db.ts')
    db = getDb()
    persistence = new SqliteRoomPersistence(db)
  })

  afterEach(() => {
    db.close()
    delete process.env.DB_PATH
    rmSync(tempDir, { recursive: true, force: true })
    vi.resetModules()
  })

  const createCommitter = (options: {
    enabled?: boolean
    scheduler?: RoomCommitScheduler
    viewerBuildExists?: (viewerBuildId: string) => boolean
    viewerBuildId?: string
    gameBuildId?: string
    assetRoot?: string
    cardArtRoot?: string
    removedAssetHashes?: ReadonlySet<string>
  } = {}) => new RoomCommitter({
    persistence,
    enabled: options.enabled ?? true,
    viewerBuildId: options.viewerBuildId ?? 'viewer-1',
    gameBuildId: options.gameBuildId ?? 'game-1',
    viewerBuildExists: options.viewerBuildExists ?? (() => true),
    assetRoot: options.assetRoot,
    cardArtRoot: options.cardArtRoot,
    removedAssetHashes: options.removedAssetHashes,
    scheduler: options.scheduler,
    now: () => 1_000,
  })

  it('waits until a restored waiting Room starts before creating Step 0', () => {
    const room = makeRoom()
    room.status = 'waiting'
    room.startedAt = undefined
    const committer = createCommitter()

    expect(committer.prepareRoom(room, { missingPrefix: false })).toEqual({
      kind: 'unchanged',
    })
    expect(persistence.loadReplayHead(room.id)).toBeNull()

    room.status = 'playing'
    room.startedAt = 100
    expect(committer.prepareRoom(room, { missingPrefix: false })).toMatchObject({
      kind: 'committed',
      stepNo: 0,
    })
  })

  it('rejects new replay rooms when the configured Viewer Build does not exist', () => {
    const committer = createCommitter({ viewerBuildExists: () => false })

    expect(committer.canCreateRoom()).toEqual({
      ok: false,
      error: 'replay viewer build not found',
    })
  })

  it('locks the replay decision and build ids into room metadata', () => {
    const enabledRoom = makeRoom('enabled-room')
    const enabled = createCommitter()
    enabled.lockNewRoom(enabledRoom)
    persistence.save(
      enabledRoom.id,
      enabledRoom.session.getState().state as never,
      {
        createdBy: null,
        startedAt: enabledRoom.startedAt,
        maxPlayers: 2,
        customCardDbIds: [],
        status: 'playing',
        players: [],
        replayRecording: enabledRoom.replayRecording,
        replayViewerBuildId: enabledRoom.replayViewerBuildId,
        replayGameBuildId: enabledRoom.replayGameBuildId,
      },
    )
    const restoredEnabled = snapshotToRoom(persistence.load(enabledRoom.id)!)
    const changedDeployment = createCommitter({
      enabled: false,
      viewerBuildId: 'viewer-2',
      gameBuildId: 'game-2',
    })

    expect(changedDeployment.prepareRoom(restoredEnabled, { missingPrefix: true }))
      .toMatchObject({ kind: 'committed', stepNo: 0 })
    expect(db.prepare(`
      SELECT viewer_build_id, game_build_id, missing_prefix
      FROM game_replays WHERE room_id = ?
    `).get(enabledRoom.id)).toEqual({
      viewer_build_id: 'viewer-1',
      game_build_id: 'game-1',
      missing_prefix: 0,
    })

    const disabledRoom = makeRoom('disabled-room')
    changedDeployment.lockNewRoom(disabledRoom)
    expect(disabledRoom.replayRecording).toBe(false)
    expect(changedDeployment.prepareRoom(disabledRoom, { missingPrefix: true }))
      .toEqual({ kind: 'unchanged' })
  })

  it('pauses and retries replay-head reads', () => {
    const room = makeRoom()
    const { scheduler, tasks } = fakeScheduler()
    const committer = createCommitter({ scheduler })
    const load = vi.spyOn(persistence, 'loadReplayHead')
    load.mockImplementationOnce(() => {
      throw new Error('read unavailable')
    })
    const ready: number[] = []

    expect(committer.prepareRoom(room, {
      missingPrefix: false,
      onReady: (result) => {
        if (result.kind === 'committed') ready.push(result.stepNo)
      },
    })).toEqual({ kind: 'blocked', error: 'read unavailable' })
    expect(committer.isRetrying(room.id)).toBe(true)
    expect(tasks.map(({ delay }) => delay)).toEqual([1_000])

    tasks.shift()!.callback()

    expect(ready).toEqual([0])
    expect(committer.isBlocked(room.id)).toBe(false)
    expect(persistence.loadReplayHead(room.id)?.latestStepNo).toBe(0)
  })

  it('creates Step 0, skips unchanged responses, and assigns consecutive global Steps', () => {
    const room = makeRoom()
    const committer = createCommitter()

    expect(committer.prepareRoom(room, { missingPrefix: false })).toMatchObject({
      kind: 'committed',
      roomVersion: 0,
      stepNo: 0,
    })
    expect(committer.commit(
      room,
      room.session.getState(),
      actionIntent!,
      0,
    )).toEqual({ kind: 'unchanged' })

    const first = room.session.devSetResources(0, { food: 1 })
    const secondIntent = replayIntentFromCommand({
      type: 'devSetResources',
      playerIndex: 0,
      resources: { food: 1 },
      requestId: 'secret',
    })
    expect(committer.commit(room, first, secondIntent!, 0)).toMatchObject({
      kind: 'committed',
      roomVersion: 1,
      stepNo: 1,
    })
    const second = room.session.devSetResources(1, { food: 3 })
    const thirdIntent = replayIntentFromCommand({
      type: 'devSetResources',
      playerIndex: 1,
      resources: { food: 3 },
    })
    expect(committer.commit(room, second, thirdIntent!, 1)).toMatchObject({
      kind: 'committed',
      roomVersion: 2,
      stepNo: 2,
    })

    expect(db.prepare(`
      SELECT step_no, room_version, player_index, command_type, intent_json
      FROM game_replay_steps ORDER BY step_no
    `).all()).toEqual([
      {
        step_no: 0,
        room_version: 0,
        player_index: null,
        command_type: 'initial',
        intent_json: '{}',
      },
      {
        step_no: 1,
        room_version: 1,
        player_index: 0,
        command_type: 'devSetResources',
        intent_json: '{"resources":{"food":1}}',
      },
      {
        step_no: 2,
        room_version: 2,
        player_index: 1,
        command_type: 'devSetResources',
        intent_json: '{"resources":{"food":3}}',
      },
    ])
  })

  it('persists a choice that advances only the authoritative session cursor', () => {
    const room = makeRoom()
    const state = room.session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.players[0]!.resources = {
      ...state.players[0]!.resources,
      wood: 5,
      reed: 2,
    }
    room.session.loadState(state)
    const committer = createCommitter()
    expect(committer.prepareRoom(room, { missingPrefix: false })).toMatchObject({
      kind: 'committed',
      stepNo: 0,
    })

    let response = room.session.takeAction(0, 'farm-expansion')
    expect(committer.commit(
      room,
      response,
      replayIntentFromCommand({ type: 'action', spaceId: 'farm-expansion' })!,
      0,
    )).toMatchObject({ kind: 'committed', stepNo: 1 })
    if (response.interaction.stateId !== 'wait') throw new Error('expected action choice')
    const construct = response.interaction.request.options?.find(
      (option) => option.labelKey === 'actions.construct.name',
    )
    expect(construct).toBeDefined()
    const beforeSnapshot = serializeSessionSnapshot(room.session.state, room.session)

    response = room.session.resolveChoice(0, construct!.value)
    expect(response.ok).toBe(true)
    const afterSnapshot = serializeSessionSnapshot(room.session.state, room.session)
    expect(afterSnapshot.frame).toEqual(beforeSnapshot.frame)
    expect(afterSnapshot.sessionCursor).not.toEqual(beforeSnapshot.sessionCursor)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : undefined)
      .toBe('farm-select')
    expect(committer.commit(
      room,
      response,
      replayIntentFromCommand({ type: 'choice', value: construct!.value })!,
      0,
    )).toMatchObject({ kind: 'committed', stepNo: 2 })

    const restored = snapshotToRoom(persistence.load(room.id)!)
    const restoredCommitter = createCommitter()
    expect(restoredCommitter.prepareRoom(restored, { missingPrefix: true })).toMatchObject({
      kind: 'committed',
      stepNo: 2,
    })
    const restoredResponse = restored.session.getState()
    expect(restoredResponse.interaction.stateId === 'wait'
      ? restoredResponse.interaction.request.kind
      : undefined).toBe('farm-select')
    expect(restoredCommitter.commit(restored, restoredResponse, actionIntent!, 0))
      .toEqual({ kind: 'unchanged' })
  })

  it('persists provisional recovery privately and records abort as a new replay Step', () => {
    const room = makeRoom()
    const state = room.session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 1
    state.round = 1
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'grain-utilization'
    state.players[0]!.occupationPlayed.push('A132_Publican')
    state.players[0]!.resources.grain = 1
    state.players[1]!.resources.grain = 0
    state.players[1]!.fields = [{ row: 0, col: 0, stacks: [] }]
    room.session.loadState(state)
    const committer = createCommitter()
    committer.prepareRoom(room, { missingPrefix: false })

    const actionResponse = room.session.takeAction(1, 'grain-utilization')
    expect(committer.commit(
      room,
      actionResponse,
      replayIntentFromCommand({ type: 'action', spaceId: 'grain-utilization' })!,
      1,
    )).toMatchObject({ kind: 'committed', stepNo: 1 })

    const rejectedDraw = room.session.devDrawCard(1, 'A001_Shelter')
    expect(rejectedDraw).toMatchObject({ ok: false, durableTransition: true })
    expect(committer.commit(
      room,
      rejectedDraw,
      replayIntentFromCommand({
        type: 'devDrawCard',
        playerIndex: 1,
        cardId: 'A001_Shelter',
      })!,
      1,
    )).toMatchObject({ kind: 'committed', stepNo: 2 })

    const activeSnapshot = persistence.load(room.id)!
    expect(activeSnapshot.serialized?.sessionCursor.provisionalContinuationScopes)
      .toHaveLength(1)
    expect(activeSnapshot.serialized?.sessionCursor.failedAuthoritativeCommands)
      .toHaveLength(1)
    expect(activeSnapshot.serialized?.state.log.filter(
      (entry) => entry.key === 'log.provisionalProtectedObservationRejected',
    )).toHaveLength(1)
    expect(activeSnapshot.serialized?.state.players[1]!.minorHand)
      .not.toContain('A001_Shelter')
    expect(JSON.stringify(activeSnapshot.serialized?.frame))
      .not.toMatch(/provisionalContinuationScopes|checkpoint|failedAuthoritativeCommands/)
    expect(activeSnapshot.serialized?.frame.players[1]!.minorHand)
      .not.toContain('A001_Shelter')
    expect(room.session.buildSyncPayload(rejectedDraw, null, 'viewer').privateEvents)
      .toBeUndefined()
    expect(JSON.stringify(room.session.buildSyncPayload(actionResponse, null, 'viewer')))
      .not.toMatch(/provisionalContinuationScopes|checkpoint|failedAuthoritativeCommands/)

    const restored = snapshotToRoom(activeSnapshot)
    expect(committer.prepareRoom(restored, { missingPrefix: true })).toMatchObject({
      kind: 'committed',
      stepNo: 2,
    })
    expect(restored.session.createSessionPrivateCursor().provisionalContinuationScopes)
      .toHaveLength(1)
    expect(restored.session.getState().state.log.filter(
      (entry) => entry.key === 'log.provisionalProtectedObservationRejected',
    )).toHaveLength(1)
    const repeatedDraw = restored.session.devDrawCard(1, 'A001_Shelter')
    expect(repeatedDraw).toMatchObject({ ok: false })
    expect(repeatedDraw.durableTransition).toBeUndefined()

    const commitChoice = (playerIndex: number, value: string) => {
      const response = restored.session.resolveChoice(playerIndex, value)
      expect(response.ok).toBe(true)
      expect(committer.commit(
        restored,
        response,
        replayIntentFromCommand({ type: 'choice', value })!,
        playerIndex,
      ).kind).toBe('committed')
      return response
    }
    let response = restored.session.getState()
    while (
      response.interaction.stateId === 'wait' &&
      response.interaction.request.kind === 'confirm-player-switch'
    ) {
      response = commitChoice(response.interaction.request.fromPlayerIndex, 'confirm')
    }
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .toBe('A132_Publican')
    const provisionalStepNo = persistence.loadReplayHead(room.id)!.latestStepNo

    response = commitChoice(0, '__skip__')
    while (
      response.interaction.stateId === 'wait' &&
      response.interaction.request.kind === 'confirm-player-switch'
    ) {
      response = commitChoice(response.interaction.request.fromPlayerIndex, 'confirm')
    }

    const finalSnapshot = persistence.load(room.id)!
    const finalStepNo = persistence.loadReplayHead(room.id)!.latestStepNo
    const steps = db.prepare(`
      SELECT step_no FROM game_replay_steps WHERE room_id = ? ORDER BY step_no
    `).all(room.id) as Array<{ step_no: number }>
    expect(finalStepNo).toBeGreaterThan(provisionalStepNo)
    expect(steps.map(({ step_no }) => step_no)).toEqual(
      Array.from({ length: finalStepNo + 1 }, (_, index) => index),
    )
    expect(response.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(1)
    expect(response.publicEventCancellations).toEqual([
      expect.objectContaining({ reason: 'provisionalContinuationRollback' }),
    ])
    expect(finalSnapshot.serialized?.sessionCursor.provisionalContinuationScopes).toEqual([])
    expect(finalSnapshot.serialized?.state.publicEventArchive.at(-1)).toEqual(
      expect.objectContaining({
        type: 'publicEvents.canceled',
        reason: 'provisionalContinuationRollback',
      }),
    )
    expect(JSON.stringify(persistence.loadReplayFrame(room.id)))
      .not.toMatch(/provisionalContinuationScopes|checkpoint|failedAuthoritativeCommands/)
  })

  it('restores nested scopes and records child abort without rewriting Replay', () => {
    let room: Room = {
      ...makeRoom('nested-room'),
      session: new GameSession(7, undefined, { playerCount: 2 }),
    }
    const state = room.session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 6
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    const actor = state.players[0]!
    actor.houseType = 'clay'
    actor.rooms = 2
    actor.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
    actor.resources = { ...actor.resources, clay: 0, reed: 0, stone: 2 }
    actor.minorPlayed.push('D014_HammerCrusher')
    setWorkersAtHome(state, actor, 2)
    room.session.loadState(state)
    registerNestedConstructHelper(room.session)

    const committer = createCommitter()
    expect(committer.prepareRoom(room, { missingPrefix: false })).toMatchObject({
      kind: 'committed',
      stepNo: 0,
    })
    const commit = (
      response: ReturnType<GameSession['getState']>,
      command: Parameters<typeof replayIntentFromCommand>[0],
      playerIndex: number,
    ) => {
      expect(response.ok).toBe(true)
      expect(committer.commit(
        room,
        response,
        replayIntentFromCommand(command)!,
        playerIndex,
      ).kind).toBe('committed')
      return response
    }

    let response = commit(
      room.session.takeAction(0, 'house-redevelopment'),
      { type: 'action', spaceId: 'house-redevelopment' },
      0,
    )
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected Construct choice')
    const construct = response.interaction.request.options.find(
      (option) => option.value !== '__skip__',
    )
    commit(
      room.session.resolveChoice(0, construct!.value),
      { type: 'choice', value: construct!.value },
      0,
    )

    const activeSnapshot = persistence.load(room.id)!
    const activeScopes = activeSnapshot.serialized?.sessionCursor.provisionalContinuationScopes ?? []
    expect(activeScopes).toHaveLength(2)
    expect(activeScopes[1]!.parentScopeId).toBe(activeScopes[0]!.id)
    expect(JSON.stringify(activeSnapshot.serialized?.frame))
      .not.toMatch(/provisionalContinuationScopes|checkpoint|failedAuthoritativeCommands/)
    const restored = snapshotToRoom(activeSnapshot)
    expect(committer.prepareRoom(restored, { missingPrefix: true })).toMatchObject({
      kind: 'committed',
    })
    room = restored
    response = room.session.getState()
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : undefined)
      .toBe('confirm-player-switch')

    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'confirm-player-switch') {
      throw new Error('expected player switch')
    }
    const switchOwner = response.interaction.request.fromPlayerIndex
    response = commit(
      room.session.resolveChoice(switchOwner, 'confirm'),
      { type: 'choice', value: 'confirm' },
      switchOwner,
    )
    expect(response.interaction.stateId === 'wait' ? response.interaction.playerIndex : undefined)
      .toBe(1)
    response = commit(
      room.session.resolveChoice(1, '__skip__'),
      { type: 'choice', value: '__skip__' },
      1,
    )

    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, reed: 1, stone: 2 })
    expect(response.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(1)
    expect(response.scores).toHaveLength(2)
    const finalSnapshot = persistence.load(room.id)!
    expect(finalSnapshot.serialized?.sessionCursor.provisionalContinuationScopes)
      .toEqual([expect.objectContaining({ guarded: true })])
    expect(finalSnapshot.serialized?.sessionCursor.failedAuthoritativeCommands).toHaveLength(1)
    expect(JSON.stringify(persistence.loadReplayFrame(room.id)))
      .not.toMatch(/provisionalContinuationScopes|checkpoint|failedAuthoritativeCommands/)
    expect(snapshotToRoom(finalSnapshot).session.resolveChoice(0, construct!.value).ok).toBe(false)

    const finalStepNo = persistence.loadReplayHead(room.id)!.latestStepNo
    const steps = db.prepare(`
      SELECT step_no FROM game_replay_steps WHERE room_id = ? ORDER BY step_no
    `).all(room.id) as Array<{ step_no: number }>
    expect(steps.map(({ step_no }) => step_no)).toEqual(
      Array.from({ length: finalStepNo + 1 }, (_, index) => index),
    )
  })

  it('persists the serialized frame produced by the custom session worker', () => {
    const room = makeRoom()
    let serialized = serializeSessionSnapshot(room.session.state, room.session)
    serialized.frame.players[0]!.pastureCapacities = { worker: 7 }
    room.customSessionExecutor = {
      serializedStateForPersistence: () => serialized,
    } as NonNullable<Room['customSessionExecutor']>
    const committer = createCommitter()

    expect(committer.prepareRoom(room, { missingPrefix: false })).toMatchObject({
      kind: 'committed',
      stepNo: 0,
    })
    expect(persistence.loadReplayFrame(room.id)?.players[0]!.pastureCapacities)
      .toEqual({ worker: 7 })

    const response = room.session.devSetResources(0, { food: 1 })
    serialized = serializeSessionSnapshot(room.session.state, room.session)
    serialized.frame.players[0]!.pastureCapacities = { worker: 8 }
    expect(committer.commit(room, response, actionIntent!, 0)).toMatchObject({
      kind: 'committed',
      stepNo: 1,
    })
    expect(persistence.loadReplayFrame(room.id)?.players[0]!.pastureCapacities)
      .toEqual({ worker: 8 })
  })

  it('archives the authoritative score breakdown in the game-over frame', () => {
    const room = makeRoom()
    const committer = createCommitter()
    committer.prepareRoom(room, { missingPrefix: false })
    room.session.state.gameOver = true
    const response = room.session.getState()

    expect(committer.commit(room, response, actionIntent!, 0)).toMatchObject({
      kind: 'committed',
      stepNo: 1,
    })
    const replay = new ReplayStore(db).segment(room.id, 0)
    expect(replay.ok).toBe(true)
    if (!replay.ok) return
    expect(replay.steps.at(-1)?.frame.scores)
      .toEqual(JSON.parse(JSON.stringify(response.scores)))
  })

  it('uses worker-produced scores in the durable result archive', () => {
    const room = makeRoom()
    const serialized = serializeSessionSnapshot(room.session.state, room.session)
    const workerScores = room.session.getState().scores!.map((score, index) => ({
      ...score,
      total: 100 + index,
    }))
    room.customSessionExecutor = {
      serializedStateForPersistence: () => serialized,
      scoresForPersistence: () => workerScores,
    } as never
    const committer = createCommitter()
    committer.prepareRoom(room, { missingPrefix: false })
    room.session.state.gameOver = true
    const response = { ...room.session.getState(), scores: workerScores }

    expect(committer.commit(room, response, actionIntent!, 0)).toMatchObject({
      kind: 'committed',
      stepNo: 1,
    })
    expect(db.prepare(`
      SELECT score FROM game_result_players
      WHERE room_id = ? ORDER BY player_index
    `).all(room.id)).toEqual([{ score: 100 }, { score: 101 }])
  })

  it('copies custom card art into content-addressed replay storage', () => {
    const cardArtRoot = join(tempDir, 'card-art')
    const assetRoot = join(tempDir, 'replay-assets')
    mkdirSync(cardArtRoot)
    writeFileSync(join(cardArtRoot, 'custom.webp'), Buffer.from('custom-art'))
    const room = makeRoom()
    room.session = new GameSession(587, [{
      cardType: 'minor',
      cardJson: {
        id: 'CUSTOM_Art',
        name: 'Art',
        deck: 'CUSTOM',
        number: 1,
        desc: [],
      },
      artUrl: '/card-art/custom.webp',
    }], { playerCount: 2 })
    const committer = createCommitter({ assetRoot, cardArtRoot })
    committer.lockNewRoom(room)

    expect(committer.prepareRoom(room, { missingPrefix: false })).toMatchObject({
      kind: 'committed',
      stepNo: 0,
    })

    const row = db.prepare(`
      SELECT custom_cards_json FROM game_replays WHERE room_id = ?
    `).get(room.id) as { custom_cards_json: string }
    const [definition] = JSON.parse(row.custom_cards_json) as Array<{ artUrl: string }>
    const hash = definition!.artUrl.slice('/replay-assets/'.length)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(readFileSync(join(assetRoot, hash))).toEqual(Buffer.from('custom-art'))
  })

  it('rejects custom card art whose content hash has been taken down', () => {
    const cardArtRoot = join(tempDir, 'card-art')
    const assetRoot = join(tempDir, 'replay-assets')
    const art = Buffer.from('removed-art')
    const hash = createHash('sha256').update(art).digest('hex')
    mkdirSync(cardArtRoot)
    writeFileSync(join(cardArtRoot, 'removed.webp'), art)
    const room = makeRoom()
    room.session = new GameSession(587, [{
      cardType: 'minor',
      cardJson: {
        id: 'CUSTOM_RemovedArt',
        name: 'Removed Art',
        deck: 'CUSTOM',
        number: 1,
        desc: [],
      },
      artUrl: '/card-art/removed.webp',
    }], { playerCount: 2 })
    const committer = createCommitter({
      assetRoot,
      cardArtRoot,
      removedAssetHashes: new Set([hash]),
    })
    committer.lockNewRoom(room)

    expect(committer.prepareRoom(room, { missingPrefix: false })).toEqual({
      kind: 'blocked',
      error: 'unable to archive custom card art: replay asset has been removed',
    })
    expect(existsSync(join(assetRoot, hash))).toBe(false)
  })

  it('retries transient custom card art archival failures', () => {
    const cardArtRoot = join(tempDir, 'card-art')
    const assetRoot = join(tempDir, 'replay-assets')
    mkdirSync(cardArtRoot)
    const room = makeRoom()
    room.session = new GameSession(587, [{
      cardType: 'minor',
      cardJson: {
        id: 'CUSTOM_LateArt',
        name: 'Late Art',
        deck: 'CUSTOM',
        number: 1,
        desc: [],
      },
      artUrl: '/card-art/late.webp',
    }], { playerCount: 2 })
    const { scheduler, tasks } = fakeScheduler()
    const committer = createCommitter({ assetRoot, cardArtRoot, scheduler })
    const ready: number[] = []
    committer.lockNewRoom(room)

    const result = committer.prepareRoom(room, {
      missingPrefix: false,
      onReady: (prepared) => {
        if (prepared.kind === 'committed') ready.push(prepared.stepNo)
      },
    })

    expect(result.kind).toBe('blocked')
    expect(committer.isRetrying(room.id)).toBe(true)
    expect(tasks.map(({ delay }) => delay)).toEqual([1_000])

    writeFileSync(join(cardArtRoot, 'late.webp'), Buffer.from('late-art'))
    tasks.shift()!.callback()

    expect(ready).toEqual([0])
    expect(committer.isBlocked(room.id)).toBe(false)
    expect(persistence.loadReplayHead(room.id)?.latestStepNo).toBe(0)
  })

  it('permanently rejects invalid custom card art URLs', () => {
    const room = makeRoom()
    room.session = new GameSession(587, [{
      cardType: 'minor',
      cardJson: {
        id: 'CUSTOM_InvalidArt',
        name: 'Invalid Art',
        deck: 'CUSTOM',
        number: 1,
        desc: [],
      },
      artUrl: 'https://example.invalid/art.webp',
    }], { playerCount: 2 })
    const { scheduler, tasks } = fakeScheduler()
    const committer = createCommitter({ scheduler })
    committer.lockNewRoom(room)

    expect(committer.prepareRoom(room, { missingPrefix: false })).toEqual({
      kind: 'blocked',
      error: 'unable to archive custom card art: unsupported custom card art URL',
    })
    expect(committer.isRetrying(room.id)).toBe(false)
    expect(tasks).toEqual([])
  })

  it('does not enroll legacy custom-card rooms without replay consent', () => {
    const room = makeRoom()
    room.session = new GameSession(587, [{
      cardType: 'minor',
      cardJson: {
        id: 'CUSTOM_Legacy',
        name: 'Legacy',
        deck: 'CUSTOM',
        number: 1,
        desc: [],
      },
    }], { playerCount: 2 })
    const committer = createCommitter()

    expect(committer.prepareRoom(room, { missingPrefix: true })).toEqual({
      kind: 'unchanged',
    })
    expect(persistence.loadReplayHead(room.id)).toBeNull()
  })

  it('removes replay card art after its final replay reference is discarded', () => {
    const cardArtRoot = join(tempDir, 'card-art')
    const assetRoot = join(tempDir, 'replay-assets')
    mkdirSync(cardArtRoot)
    writeFileSync(join(cardArtRoot, 'shared.webp'), Buffer.from('shared-art'))
    const customCards = [{
      cardType: 'minor' as const,
      cardJson: {
        id: 'CUSTOM_SharedArt',
        name: 'Shared Art',
        deck: 'CUSTOM',
        number: 1,
        desc: [],
      },
      artUrl: '/card-art/shared.webp',
    }]
    const first = makeRoom('asset-room-1')
    first.session = new GameSession(587, customCards, { playerCount: 2 })
    const second = makeRoom('asset-room-2')
    second.session = new GameSession(587, customCards, { playerCount: 2 })
    const committer = createCommitter({ assetRoot, cardArtRoot })
    committer.lockNewRoom(first)
    committer.lockNewRoom(second)
    committer.prepareRoom(first, { missingPrefix: false })
    committer.prepareRoom(second, { missingPrefix: false })

    const row = db.prepare(`
      SELECT custom_cards_json FROM game_replays WHERE room_id = ?
    `).get(first.id) as { custom_cards_json: string }
    const [definition] = JSON.parse(row.custom_cards_json) as Array<{ artUrl: string }>
    const hash = definition!.artUrl.slice('/replay-assets/'.length)
    const assetPath = join(assetRoot, hash)
    expect(existsSync(assetPath)).toBe(true)

    persistence.discard(first.id)
    committer.retireRoom(first.id)
    expect(existsSync(assetPath)).toBe(true)

    persistence.discard(second.id)
    committer.cleanupReplayAssets()
    expect(existsSync(assetPath)).toBe(false)
  })

  it('serializes simultaneous player submissions and includes automatic resolution in the last Step', () => {
    const session = new GameSession(587, undefined, {
      playerCount: 2,
      draftMode: 'simultaneous',
      draftPoolSize: 7,
    })
    const room: Room = {
      ...makeRoom(),
      session,
    }
    const committer = createCommitter()
    committer.prepareRoom(room, { missingPrefix: false })

    const p1Pool = session.state.draft!.pools.p1
    const p1Pick = {
      occCardId: p1Pool.occ[0]!,
      minorCardId: p1Pool.minor[0]!,
    }
    const p1Response = session.submitDraftPick('p1', p1Pick)
    expect(committer.commit(
      room,
      p1Response,
      replayIntentFromCommand({ type: 'draftSubmit', playerId: 'p1', pick: p1Pick })!,
      0,
    )).toMatchObject({ kind: 'committed', stepNo: 1 })
    expect(p1Response.state.draft?.round).toBe(1)

    const p2Pool = session.state.draft!.pools.p2
    const p2Pick = {
      occCardId: p2Pool.occ[0]!,
      minorCardId: p2Pool.minor[0]!,
    }
    const p2Response = session.submitDraftPick('p2', p2Pick)
    expect(committer.commit(
      room,
      p2Response,
      replayIntentFromCommand({ type: 'draftSubmit', playerId: 'p2', pick: p2Pick })!,
      1,
    )).toMatchObject({ kind: 'committed', stepNo: 2 })
    expect(p2Response.state.draft?.round).toBe(2)
    expect(persistence.loadReplayHead(room.id)?.latestStepNo).toBe(2)
  })

  it('freezes a failed commit, blocks new commands, and retries the same Step', () => {
    const room = makeRoom()
    const { scheduler, tasks } = fakeScheduler()
    const committer = createCommitter({ scheduler })
    committer.prepareRoom(room, { missingPrefix: false })
    db.exec(`
      CREATE TRIGGER reject_step
      BEFORE INSERT ON game_replay_steps
      WHEN NEW.step_no = 1
      BEGIN
        SELECT RAISE(ABORT, 'disk unavailable');
      END;
    `)
    const response = room.session.devSetResources(0, { food: 1 })
    const retried: number[] = []

    expect(committer.commit(room, response, actionIntent!, 0, (result) => {
      retried.push(result.stepNo)
    })).toEqual({ kind: 'blocked', error: 'disk unavailable' })
    expect(committer.isBlocked(room.id)).toBe(true)
    expect(tasks.map(({ delay }) => delay)).toEqual([1_000])
    expect(committer.commit(room, response, actionIntent!, 0)).toEqual({
      kind: 'blocked',
      error: 'disk unavailable',
    })

    db.exec('DROP TRIGGER reject_step')
    tasks.shift()!.callback()

    expect(retried).toEqual([1])
    expect(committer.isBlocked(room.id)).toBe(false)
    expect(persistence.loadReplayHead(room.id)?.latestStepNo).toBe(1)
  })

  it('keeps a failed Step 0 on the durable path while it retries', () => {
    const room = makeRoom()
    const { scheduler } = fakeScheduler()
    const committer = createCommitter({ scheduler })
    db.exec(`
      CREATE TRIGGER reject_step_zero
      BEFORE INSERT ON game_replay_steps
      WHEN NEW.step_no = 0
      BEGIN
        SELECT RAISE(ABORT, 'disk unavailable');
      END;
    `)

    expect(committer.prepareRoom(room, { missingPrefix: false })).toEqual({
      kind: 'blocked',
      error: 'disk unavailable',
    })
    expect(committer.hasReplay(room.id)).toBe(true)
    committer.shutdown()
  })

  it('uses 1/2/5/10/30 second retry backoff and stays at 30 seconds', () => {
    const room = makeRoom()
    const { scheduler, tasks } = fakeScheduler()
    const committer = createCommitter({ scheduler })
    committer.prepareRoom(room, { missingPrefix: false })
    db.exec(`
      CREATE TRIGGER reject_step_backoff
      BEFORE INSERT ON game_replay_steps
      WHEN NEW.step_no = 1
      BEGIN
        SELECT RAISE(ABORT, 'still unavailable');
      END;
    `)
    const response = room.session.devSetResources(0, { food: 1 })

    committer.commit(room, response, actionIntent!, 0)

    for (const delay of [1_000, 2_000, 5_000, 10_000, 30_000, 30_000]) {
      expect(tasks[0]?.delay).toBe(delay)
      tasks.shift()!.callback()
    }
    expect(tasks[0]?.delay).toBe(30_000)
    committer.shutdown()
  })

  it('continues an existing replay after process recovery even when new recording is disabled', () => {
    const room = makeRoom()
    const firstCommitter = createCommitter()
    firstCommitter.prepareRoom(room, { missingPrefix: false })
    const response = room.session.devSetResources(0, { food: 1 })
    firstCommitter.commit(room, response, actionIntent!, 0)

    const restored = snapshotToRoom(persistence.load(room.id)!)
    const recoveredCommitter = createCommitter({ enabled: false })

    expect(recoveredCommitter.prepareRoom(restored, { missingPrefix: true })).toMatchObject({
      kind: 'committed',
      roomVersion: 1,
      stepNo: 1,
    })
    expect(restored.version).toBe(1)
    expect(persistence.loadReplayHead(room.id)?.missingPrefix).toBe(false)

    const next = restored.session.devSetResources(1, { food: 3 })
    expect(recoveredCommitter.commit(restored, next, actionIntent!, 1)).toMatchObject({
      kind: 'committed',
      roomVersion: 2,
      stepNo: 2,
    })
  })

  it('pauses and retries persisted replay-frame reads', () => {
    const room = makeRoom()
    const firstCommitter = createCommitter()
    firstCommitter.prepareRoom(room, { missingPrefix: false })
    const response = room.session.devSetResources(0, { food: 1 })
    firstCommitter.commit(room, response, actionIntent!, 0)

    const restored = snapshotToRoom(persistence.load(room.id)!)
    const { scheduler, tasks } = fakeScheduler()
    const recoveredCommitter = createCommitter({ enabled: false, scheduler })
    const load = vi.spyOn(persistence, 'loadReplayFrame')
    load.mockImplementationOnce(() => {
      throw new Error('snapshot read unavailable')
    })
    const ready: number[] = []

    expect(recoveredCommitter.prepareRoom(restored, {
      missingPrefix: true,
      onReady: (result) => {
        if (result.kind === 'committed') ready.push(result.stepNo)
      },
    })).toEqual({ kind: 'blocked', error: 'snapshot read unavailable' })
    expect(recoveredCommitter.isRetrying(room.id)).toBe(true)
    expect(tasks.map(({ delay }) => delay)).toEqual([1_000])

    tasks.shift()!.callback()

    expect(ready).toEqual([1])
    expect(recoveredCommitter.isBlocked(room.id)).toBe(false)
  })

  it('continues a replay when rehydration normalizes the persisted frame', () => {
    const room = makeRoom()
    const firstCommitter = createCommitter()
    firstCommitter.prepareRoom(room, { missingPrefix: false })
    const played = room.session.devPlayCard(0, 'C104_Collector')
    const collectorSpace = room.session.state.actionSpaces.find(
      (space) => space.id === 'C104_Collector',
    )!
    delete collectorSpace.blockedBy
    room.session.state.players[0]!.playedCards = []
    const playIntent = replayIntentFromCommand({
      type: 'devPlayCard',
      playerIndex: 0,
      cardId: 'C104_Collector',
    })

    expect(firstCommitter.commit(room, played, playIntent!, 0)).toMatchObject({
      kind: 'committed',
      roomVersion: 1,
      stepNo: 1,
    })

    const restored = snapshotToRoom(persistence.load(room.id)!)
    expect(restored.session.state.actionSpaces.find(
      (space) => space.id === 'C104_Collector',
    )?.blockedBy).toEqual([])
    expect(restored.session.state.players[0]!.playedCards)
      .toEqual(['occupation:C104_Collector'])

    const recoveredCommitter = createCommitter({ enabled: false })
    expect(recoveredCommitter.prepareRoom(restored, { missingPrefix: true })).toMatchObject({
      kind: 'committed',
      roomVersion: 1,
      stepNo: 1,
    })

    restored.session.devSetResources(1, { food: 3 })
    restored.session.state.gameOver = true
    const next = restored.session.getState()
    expect(recoveredCommitter.commit(restored, next, actionIntent!, 1)).toMatchObject({
      kind: 'committed',
      roomVersion: 2,
      stepNo: 2,
    })
    const replay = new ReplayStore(db).segment(room.id, 0)
    expect(replay.ok).toBe(true)
  })

  it('blocks replay recovery when the persisted room cannot be rehydrated', () => {
    const room = makeRoom()
    createCommitter().prepareRoom(room, { missingPrefix: false })
    const snapshot = persistence.load(room.id)!
    const incompatibleSnapshot = {
      ...snapshot.serialized!,
      state: { ...snapshot.serialized!.state, players: null },
    }
    const incompatibleFrame = {
      ...snapshot.serialized!.frame,
      players: null,
    } as unknown as JsonValue
    const encoded = encodeReplayFrame({
      frame: incompatibleFrame,
      previousFrame: null,
      stepNo: 0,
      previousCheckpointStepNo: 0,
    })
    db.prepare('UPDATE rooms SET state_json = ? WHERE id = ?')
      .run(JSON.stringify(incompatibleSnapshot), room.id)
    db.prepare(`
      UPDATE game_replay_steps
      SET payload_kind = ?, payload_gzip = ?, checkpoint_step_no = ?, frame_hash = ?
      WHERE room_id = ? AND step_no = 0
    `).run(
      encoded.payloadKind,
      encoded.payloadGzip,
      encoded.checkpointStepNo,
      encoded.frameHash,
      room.id,
    )

    const restored = snapshotToRoom(persistence.load(room.id)!)

    expect(createCommitter().prepareRoom(restored, { missingPrefix: true })).toEqual({
      kind: 'blocked',
      error: `room snapshot rehydration failed for ${room.id} step 0`,
    })
  })

  it('blocks recovery of an unsupported replay schema', () => {
    const room = makeRoom()
    const firstCommitter = createCommitter()
    firstCommitter.prepareRoom(room, { missingPrefix: false })
    db.prepare('UPDATE game_replays SET schema_version = 2 WHERE room_id = ?').run(room.id)

    expect(createCommitter().prepareRoom(room, { missingPrefix: false })).toEqual({
      kind: 'blocked',
      error: `unsupported replay schema 2 for ${room.id}`,
    })
  })

  it('starts an old active room at a missing-prefix Step 0', () => {
    const room = makeRoom()
    persistence.save(
      room.id,
      room.session.getState().state as never,
      {
        createdBy: null,
        startedAt: room.startedAt,
        maxPlayers: 2,
        customCardDbIds: [],
        status: 'playing',
        players: [],
      },
    )
    const committer = createCommitter()

    expect(committer.prepareRoom(room, { missingPrefix: true })).toMatchObject({
      kind: 'committed',
      stepNo: 0,
    })
    expect(persistence.loadReplayHead(room.id)?.missingPrefix).toBe(true)
  })

  it('leaves old active rooms writable while replay rollout is disabled', () => {
    const room = makeRoom()
    const committer = createCommitter({
      enabled: false,
      viewerBuildId: '',
      gameBuildId: '',
    })

    expect(committer.prepareRoom(room, { missingPrefix: true })).toEqual({
      kind: 'unchanged',
    })
    expect(committer.isBlocked(room.id)).toBe(false)
    expect(persistence.loadReplayHead(room.id)).toBeNull()
  })

  it('permanently blocks a different Hash at the same Step', () => {
    const room = makeRoom()
    const { scheduler, tasks } = fakeScheduler()
    const committer = createCommitter({ scheduler })
    committer.prepareRoom(room, { missingPrefix: false })
    db.prepare(`
      INSERT INTO game_replay_steps (
        room_id, step_no, room_version, checkpoint_step_no, player_index,
        command_type, intent_json, payload_kind, payload_gzip, frame_hash, created_at
      ) VALUES (?, 1, 1, 0, 0, 'action', '{}', 'delta', X'00', ?, 1001)
    `).run(room.id, 'f'.repeat(64))

    const response = room.session.devSetResources(0, { food: 1 })
    expect(committer.commit(room, response, actionIntent!, 0)).toEqual({
      kind: 'blocked',
      error: `replay hash conflict at ${room.id} step 1`,
    })
    expect(committer.isBlocked(room.id)).toBe(true)
    expect(committer.isRetrying(room.id)).toBe(false)
    expect(tasks).toEqual([])
  })

  it('releases the in-memory replay head when a room retires', () => {
    const room = makeRoom()
    const committer = createCommitter()
    committer.prepareRoom(room, { missingPrefix: false })

    expect(committer.isRecording(room.id)).toBe(true)
    expect(committer.hasReplay(room.id)).toBe(true)

    committer.retireRoom(room.id)

    expect(committer.isRecording(room.id)).toBe(false)
    expect(committer.hasReplay(room.id)).toBe(false)
  })

  it('notifies queued reconnects when a blocked room retires', () => {
    const room = makeRoom()
    const { scheduler, tasks } = fakeScheduler()
    const committer = createCommitter({ scheduler })
    committer.prepareRoom(room, { missingPrefix: false })
    db.exec(`
      CREATE TRIGGER reject_retired_step
      BEFORE INSERT ON game_replay_steps
      WHEN NEW.step_no = 1
      BEGIN
        SELECT RAISE(ABORT, 'disk unavailable');
      END;
    `)
    const response = room.session.devSetResources(0, { food: 1 })
    committer.commit(room, response, actionIntent!, 0)
    const errors: Array<string | undefined> = []

    expect(committer.waitUntilReady(room.id, (error) => errors.push(error))).toBe(true)
    committer.retireRoom(room.id)

    expect(errors).toEqual(['room retired'])
    expect(tasks).toEqual([])
    expect(committer.isBlocked(room.id)).toBe(false)
  })

  it('whitelists intent fields and excludes request and arbitrary payload data', () => {
    expect(actionIntent).toEqual({
      commandType: 'action',
      intentJson: '{"spaceId":"forest"}',
    })
    expect(replayIntentFromCommand({
      type: 'choice',
      value: 'confirm',
      payload: { token: 'secret', userId: 'u1' },
      requestId: 'req-1',
    })).toEqual({
      commandType: 'choice',
      intentJson: '{"value":"confirm"}',
    })
    expect(replayIntentFromCommand({
      type: 'draftSubmit',
      playerId: 'p1',
      pick: {
        occCardId: 'A001',
        minorCardId: 'B001',
        secret: 'must-not-persist',
      } as never,
    })).toEqual({
      commandType: 'draftSubmit',
      intentJson: '{"pick":{"minorCardId":"B001","occCardId":"A001"}}',
    })
    expect(replayIntentFromCommand({
      type: 'parentSubmit',
      playerIndex: 0,
      selection: {
        mother: 'PR01',
        father: 'PS01',
        secret: 'must-not-persist',
      } as never,
    })).toEqual({
      commandType: 'parentSubmit',
      intentJson: '{"selection":{"father":"PS01","mother":"PR01"}}',
    })
    expect(replayIntentFromCommand({ type: 'auth', token: 'secret' })).toBeNull()
  })
})
