import { ResourceStore } from '../../storage/resource-store'
import { ReplayResources } from '../../storage/replay-resources'
import { S3ObjectStore } from '../../storage/s3-store'
import { testStorageEnvironment } from '../../__tests__/_helpers/objects'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDatabase } from '../../__tests__/_helpers/postgres'
import type { PostgresDatabase } from '../../database/postgres'
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
import { PostgresRoomPersistence } from '../persistence/postgres-adapter.ts'
import { RoomOwnershipError } from '../room-directory.ts'

const makeRoom = (id = 'room-1'): Room => ({
  id,
  session: new GameSession(587, undefined, { playerCount: 2 }),
  players: [],
  seatOwners: [],
  maxPlayers: 2,
  version: 0,
  status: 'playing', replayRecording: true, replayViewerBuildId: 'viewer-1', replayGameBuildId: 'game-1',
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
  let db: PostgresDatabase
  let persistence: PostgresRoomPersistence
  let resources: ReplayResources

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'open-agricola-room-committer-'))
    process.env.DB_PATH = join(tempDir, 'test.db')
    vi.resetModules()
    db = await createTestDatabase()
    persistence = new PostgresRoomPersistence(db)
    resources = new ReplayResources(new ResourceStore(db, S3ObjectStore.fromEnv(testStorageEnvironment(), `test/${randomUUID()}/`)))
  })

  afterEach(async () => {
    await resources.storage.objects.clearPrefix()
    resources.storage.objects.close()
    ;(await db.close())
    delete process.env.DB_PATH
    rmSync(tempDir, { recursive: true, force: true })
    vi.resetModules()
  })

  const createCommitter = (options: {
    scheduler?: RoomCommitScheduler
    viewerBuildExists?: (viewerBuildId: string) => boolean
    viewerBuildId?: string
    gameBuildId?: string
  } = {}) => new RoomCommitter({
    persistence,
    viewerBuildId: options.viewerBuildId ?? 'viewer-1',
    gameBuildId: options.gameBuildId ?? 'game-1',
    viewerBuildExists: options.viewerBuildExists ?? (() => true),
    resources,
    scheduler: options.scheduler,
    now: () => 1_000,
  })

  it('waits until a restored waiting Room starts before creating Step 0', async () => {
    const room = makeRoom()
    room.status = 'waiting'
    room.startedAt = undefined
    const committer = createCommitter()

    expect((await committer.prepareRoom(room, { missingPrefix: false }))).toEqual({
      kind: 'unchanged',
    })
    expect((await persistence.loadReplayHead(room.id))).toBeNull()

    room.status = 'playing'
    room.startedAt = 100
    expect((await committer.prepareRoom(room, { missingPrefix: false }))).toMatchObject({
      kind: 'committed',
      stepNo: 0,
    })
  })

  it('rejects new replay rooms when the configured Viewer Build does not exist', async () => {
    const committer = createCommitter({ viewerBuildExists: () => false })

    expect(await committer.canCreateRoom()).toEqual({
      ok: false,
      error: 'replay viewer build not found',
    })
  })

  it('pins build identities at creation and refuses to invent a missing recorded prefix', async () => {
    const room = makeRoom()
    const initial = createCommitter()
    initial.lockNewRoom(room)
    expect(room).toMatchObject({ replayRecording: true, replayViewerBuildId: 'viewer-1', replayGameBuildId: 'game-1', replayViewerBuildId: 'viewer-1', replayGameBuildId: 'game-1' })
    await initial.prepareRoom(room, { missingPrefix: false })
    const restored = snapshotToRoom((await persistence.load(room.id))!)
    const next = createCommitter({ viewerBuildId: 'viewer-2', gameBuildId: 'game-2' })
    expect(await next.prepareRoom(restored, { missingPrefix: true })).toMatchObject({ kind: 'committed', stepNo: 0 })
    expect(await persistence.loadReplayHead(room.id)).toMatchObject({ viewerBuildId: 'viewer-1', gameBuildId: 'game-1' })
    const corrupt = makeRoom('missing-header')
    initial.lockNewRoom(corrupt)
    expect(await next.prepareRoom(corrupt, { missingPrefix: true })).toMatchObject({ kind: 'blocked', error: 'recorded room replay header is missing' })
    expect(await persistence.loadReplayHead(corrupt.id)).toBeNull()
  })

  it('pauses and retries replay-head reads', async () => {
    const room = makeRoom()
    const { scheduler, tasks } = fakeScheduler()
    const committer = createCommitter({ scheduler })
    const load = vi.spyOn(persistence, 'loadReplayHead')
    load.mockImplementationOnce(() => {
      throw new Error('read unavailable')
    })
    const ready: number[] = []

    expect((await committer.prepareRoom(room, {
      missingPrefix: false,
      onReady: (result) => {
        if (result.kind === 'committed') ready.push(result.stepNo)
      },
    }))).toEqual({ kind: 'blocked', error: 'read unavailable' })
    expect(committer.isRetrying(room.id)).toBe(true)
    expect(tasks.map(({ delay }) => delay)).toEqual([1_000])

    await tasks.shift()!.callback()

    expect(ready).toEqual([0])
    expect(committer.isBlocked(room.id)).toBe(false)
    expect((await persistence.loadReplayHead(room.id))?.latestStepNo).toBe(0)
  })

  it('creates Step 0, skips unchanged responses, and assigns consecutive global Steps', async () => {
    const room = makeRoom()
    const committer = createCommitter()

    expect((await committer.prepareRoom(room, { missingPrefix: false }))).toMatchObject({
      kind: 'committed',
      roomVersion: 0,
      stepNo: 0,
    })
    expect((await committer.commit(
      room,
      room.session.getState(),
      actionIntent!,
      0,
    ))).toEqual({ kind: 'unchanged' })

    const first = room.session.devSetResources(0, { food: 1 })
    const secondIntent = replayIntentFromCommand({
      type: 'devSetResources',
      playerIndex: 0,
      resources: { food: 1 },
      requestId: 'secret',
    })
    expect((await committer.commit(room, first, secondIntent!, 0))).toMatchObject({
      kind: 'committed',
      roomVersion: 1,
      stepNo: 1,
    })
    const second = room.session.devSetResources(1, { food: 4 })
    const thirdIntent = replayIntentFromCommand({
      type: 'devSetResources',
      playerIndex: 1,
      resources: { food: 4 },
    })
    expect((await committer.commit(room, second, thirdIntent!, 1))).toMatchObject({
      kind: 'committed',
      roomVersion: 2,
      stepNo: 2,
    })

    expect((await db.prepare(`
      SELECT step_no, room_version, player_index, command_type, intent_json
      FROM game_replay_steps ORDER BY step_no
    `).all())).toEqual([
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
        intent_json: '{"resources":{"food":4}}',
      },
    ])
  })

  it('persists a choice that advances only the authoritative session cursor', async () => {
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
    expect((await committer.prepareRoom(room, { missingPrefix: false }))).toMatchObject({
      kind: 'committed',
      stepNo: 0,
    })

    let response = room.session.takeAction(0, 'farm-expansion')
    expect((await committer.commit(
      room,
      response,
      replayIntentFromCommand({ type: 'action', spaceId: 'farm-expansion' })!,
      0,
    ))).toMatchObject({ kind: 'committed', stepNo: 1 })
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
    expect((await committer.commit(
      room,
      response,
      replayIntentFromCommand({ type: 'choice', value: construct!.value })!,
      0,
    ))).toMatchObject({ kind: 'committed', stepNo: 2 })

    const restored = snapshotToRoom((await persistence.load(room.id))!)
    const restoredCommitter = createCommitter()
    expect((await restoredCommitter.prepareRoom(restored, { missingPrefix: true }))).toMatchObject({
      kind: 'committed',
      stepNo: 2,
    })
    const restoredResponse = restored.session.getState()
    expect(restoredResponse.interaction.stateId === 'wait'
      ? restoredResponse.interaction.request.kind
      : undefined).toBe('farm-select')
    expect((await restoredCommitter.commit(restored, restoredResponse, actionIntent!, 0)))
      .toEqual({ kind: 'unchanged' })
  })

  it('persists provisional recovery privately and records abort as a new replay Step', async () => {
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
    ;(await committer.prepareRoom(room, { missingPrefix: false }))

    const actionResponse = room.session.takeAction(1, 'grain-utilization')
    expect((await committer.commit(
      room,
      actionResponse,
      replayIntentFromCommand({ type: 'action', spaceId: 'grain-utilization' })!,
      1,
    ))).toMatchObject({ kind: 'committed', stepNo: 1 })

    const rejectedDraw = room.session.devDrawCard(1, 'A001_Shelter')
    expect(rejectedDraw).toMatchObject({ ok: false, durableTransition: true })
    expect((await committer.commit(
      room,
      rejectedDraw,
      replayIntentFromCommand({
        type: 'devDrawCard',
        playerIndex: 1,
        cardId: 'A001_Shelter',
      })!,
      1,
    ))).toMatchObject({ kind: 'committed', stepNo: 2 })

    const activeSnapshot = (await persistence.load(room.id))!
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
    expect((await committer.prepareRoom(restored, { missingPrefix: true }))).toMatchObject({
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

    const commitChoice = async (playerIndex: number, value: string) => {
      const response = restored.session.resolveChoice(playerIndex, value)
      expect(response.ok).toBe(true)
      expect((await committer.commit(
        restored,
        response,
        replayIntentFromCommand({ type: 'choice', value })!,
        playerIndex,
      )).kind).toBe('committed')
      return response
    }
    let response = restored.session.getState()
    while (
      response.interaction.stateId === 'wait' &&
      response.interaction.request.kind === 'confirm-player-switch'
    ) {
      response = (await commitChoice(response.interaction.request.fromPlayerIndex, 'confirm'))
    }
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .toBe('A132_Publican')
    const provisionalStepNo = (await persistence.loadReplayHead(room.id))!.latestStepNo

    response = (await commitChoice(0, '__skip__'))
    while (
      response.interaction.stateId === 'wait' &&
      response.interaction.request.kind === 'confirm-player-switch'
    ) {
      response = (await commitChoice(response.interaction.request.fromPlayerIndex, 'confirm'))
    }

    const finalSnapshot = (await persistence.load(room.id))!
    const finalStepNo = (await persistence.loadReplayHead(room.id))!.latestStepNo
    const steps = (await db.prepare(`
      SELECT step_no FROM game_replay_steps WHERE room_id = ? ORDER BY step_no
    `).all(room.id)) as Array<{ step_no: number }>
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
    expect(finalSnapshot.serialized?.state.publicEventArchive).toContainEqual(
      expect.objectContaining({
        type: 'publicEvents.canceled',
        reason: 'provisionalContinuationRollback',
      }),
    )
    expect(JSON.stringify((await persistence.loadReplayFrame(room.id))))
      .not.toMatch(/provisionalContinuationScopes|checkpoint|failedAuthoritativeCommands/)
  })

  it('restores nested scopes and records child abort without rewriting Replay', async () => {
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
    expect((await committer.prepareRoom(room, { missingPrefix: false }))).toMatchObject({
      kind: 'committed',
      stepNo: 0,
    })
    const commit = async (
      response: ReturnType<GameSession['getState']>,
      command: Parameters<typeof replayIntentFromCommand>[0],
      playerIndex: number,
    ) => {
      expect(response.ok).toBe(true)
      expect((await committer.commit(
        room,
        response,
        replayIntentFromCommand(command)!,
        playerIndex,
      )).kind).toBe('committed')
      return response
    }

    let response = (await commit(
      room.session.takeAction(0, 'house-redevelopment'),
      { type: 'action', spaceId: 'house-redevelopment' },
      0,
    ))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected Construct choice')
    const construct = response.interaction.request.options.find(
      (option) => option.value !== '__skip__',
    )
    ;(await commit(
      room.session.resolveChoice(0, construct!.value),
      { type: 'choice', value: construct!.value },
      0,
    ))

    const activeSnapshot = (await persistence.load(room.id))!
    const activeScopes = activeSnapshot.serialized?.sessionCursor.provisionalContinuationScopes ?? []
    expect(activeScopes).toHaveLength(2)
    expect(activeScopes[1]!.parentScopeId).toBe(activeScopes[0]!.id)
    expect(JSON.stringify(activeSnapshot.serialized?.frame))
      .not.toMatch(/provisionalContinuationScopes|checkpoint|failedAuthoritativeCommands/)
    const restored = snapshotToRoom(activeSnapshot)
    expect((await committer.prepareRoom(restored, { missingPrefix: true }))).toMatchObject({
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
    response = (await commit(
      room.session.resolveChoice(switchOwner, 'confirm'),
      { type: 'choice', value: 'confirm' },
      switchOwner,
    ))
    expect(response.interaction.stateId === 'wait' ? response.interaction.playerIndex : undefined)
      .toBe(1)
    response = (await commit(
      room.session.resolveChoice(1, '__skip__'),
      { type: 'choice', value: '__skip__' },
      1,
    ))

    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, reed: 1, stone: 2 })
    expect(response.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(1)
    expect(response.scores).toHaveLength(2)
    const finalSnapshot = (await persistence.load(room.id))!
    expect(finalSnapshot.serialized?.sessionCursor.provisionalContinuationScopes)
      .toEqual([expect.objectContaining({ guarded: true })])
    expect(finalSnapshot.serialized?.sessionCursor.failedAuthoritativeCommands).toHaveLength(1)
    expect(JSON.stringify((await persistence.loadReplayFrame(room.id))))
      .not.toMatch(/provisionalContinuationScopes|checkpoint|failedAuthoritativeCommands/)
    expect(snapshotToRoom(finalSnapshot).session.resolveChoice(0, construct!.value).ok).toBe(false)

    const finalStepNo = (await persistence.loadReplayHead(room.id))!.latestStepNo
    const steps = (await db.prepare(`
      SELECT step_no FROM game_replay_steps WHERE room_id = ? ORDER BY step_no
    `).all(room.id)) as Array<{ step_no: number }>
    expect(steps.map(({ step_no }) => step_no)).toEqual(
      Array.from({ length: finalStepNo + 1 }, (_, index) => index),
    )
  })

  it('persists the serialized frame produced by the custom session worker', async () => {
    const room = makeRoom()
    let serialized = serializeSessionSnapshot(room.session.state, room.session)
    serialized.frame.players[0]!.pastureCapacities = { worker: 7 }
    room.customSessionExecutor = {
      serializedStateForPersistence: () => serialized,
    } as NonNullable<Room['customSessionExecutor']>
    const committer = createCommitter()

    expect((await committer.prepareRoom(room, { missingPrefix: false }))).toMatchObject({
      kind: 'committed',
      stepNo: 0,
    })
    expect((await persistence.loadReplayFrame(room.id))?.players[0]!.pastureCapacities)
      .toEqual({ worker: 7 })

    const response = room.session.devSetResources(0, { food: 1 })
    serialized = serializeSessionSnapshot(room.session.state, room.session)
    serialized.frame.players[0]!.pastureCapacities = { worker: 8 }
    expect((await committer.commit(room, response, actionIntent!, 0))).toMatchObject({
      kind: 'committed',
      stepNo: 1,
    })
    expect((await persistence.loadReplayFrame(room.id))?.players[0]!.pastureCapacities)
      .toEqual({ worker: 8 })
  })

  it('archives the authoritative score breakdown in the game-over frame', async () => {
    const room = makeRoom()
    const committer = createCommitter()
    ;(await committer.prepareRoom(room, { missingPrefix: false }))
    room.session.state.gameOver = true
    const response = room.session.getState()

    expect((await committer.commit(room, response, actionIntent!, 0))).toMatchObject({
      kind: 'committed',
      stepNo: 1,
    })
    const replay = (await new ReplayStore(db).segment(room.id, 0))
    expect(replay.ok).toBe(true)
    if (!replay.ok) return
    expect(replay.steps.at(-1)?.frame.scores)
      .toEqual(JSON.parse(JSON.stringify(response.scores)))
  })

  it('uses worker-produced scores in the durable result archive', async () => {
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
    ;(await committer.prepareRoom(room, { missingPrefix: false }))
    room.session.state.gameOver = true
    const response = { ...room.session.getState(), scores: workerScores }

    expect((await committer.commit(room, response, actionIntent!, 0))).toMatchObject({
      kind: 'committed',
      stepNo: 1,
    })
    expect((await db.prepare(`
      SELECT score FROM game_result_players
      WHERE room_id = ? ORDER BY player_index
    `).all(room.id))).toEqual([{ score: 100 }, { score: 101 }])
  })

  it.each(['/card-art/custom.webp', 'https://old-api.example:8443/card-art/custom.webp', 'https://api.example/agricola-api/card-art/custom.webp', '/agricola-api/card-art/custom.webp'])('copies custom card art into content-addressed replay storage: %s', async artUrl => {
    await resources.storage.stage('card-art/custom.webp', Buffer.from('custom-art'), 'image/webp')
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
      artUrl,
    }], { playerCount: 2 })
    const committer = createCommitter()
    committer.lockNewRoom(room)

    expect((await committer.prepareRoom(room, { missingPrefix: false }))).toMatchObject({
      kind: 'committed',
      stepNo: 0,
    })

    const row = (await db.prepare(`
      SELECT custom_cards_json FROM game_replays WHERE room_id = ?
    `).get(room.id)) as { custom_cards_json: string }
    const [definition] = JSON.parse(row.custom_cards_json) as Array<{ artUrl: string }>
    const hash = definition!.artUrl.slice('/replay-assets/'.length)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect((await resources.storage.read(`replay-assets/${hash}`))?.body).toEqual(Buffer.from('custom-art'))
  })

  it('rejects custom card art whose content hash has been taken down', async () => {
    const art = Buffer.from('removed-art')
    const hash = createHash('sha256').update(art).digest('hex')
    await resources.storage.stage('card-art/removed.webp', art, 'image/webp')
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
    await resources.storage.ledger.append({ version: 1, entries: [], assetTakedowns: [{ hash, reason: 'moderation', removedAt: 1 }] })
    const committer = createCommitter()
    committer.lockNewRoom(room)

    expect((await committer.prepareRoom(room, { missingPrefix: false }))).toEqual({
      kind: 'blocked',
      error: 'unable to archive custom card art: replay asset has been removed',
    })
    expect(await resources.storage.objects.get(`replay-assets/${hash}`)).toBeNull()
  })

  it('retries transient custom card art archival failures', async () => {
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
    const committer = createCommitter({ scheduler })
    const ready: number[] = []
    committer.lockNewRoom(room)

    const result = (await committer.prepareRoom(room, {
      missingPrefix: false,
      onReady: (prepared) => {
        if (prepared.kind === 'committed') ready.push(prepared.stepNo)
      },
    }))

    expect(result.kind).toBe('blocked')
    expect(committer.isRetrying(room.id)).toBe(true)
    expect(tasks.map(({ delay }) => delay)).toEqual([1_000])

    await resources.storage.stage('card-art/late.webp', Buffer.from('late-art'), 'image/webp')
    await tasks.shift()!.callback()

    expect(ready).toEqual([0])
    expect(committer.isBlocked(room.id)).toBe(false)
    expect((await persistence.loadReplayHead(room.id))?.latestStepNo).toBe(0)
  })

  it('permanently rejects invalid custom card art URLs', async () => {
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

    expect((await committer.prepareRoom(room, { missingPrefix: false }))).toEqual({
      kind: 'blocked',
      error: 'unable to archive custom card art: unsupported custom card art URL',
    })
    expect(committer.isRetrying(room.id)).toBe(false)
    expect(tasks).toEqual([])
  })

  it('blocks restored custom-card rooms with a missing recording header', async () => {
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

    expect((await committer.prepareRoom(room, { missingPrefix: true }))).toEqual({
      kind: 'blocked', error: 'recorded room replay header is missing',
    })
    expect((await persistence.loadReplayHead(room.id))).toBeNull()
  })

  it('removes replay card art after its final replay reference is discarded', async () => {
    await resources.storage.stage('card-art/shared.webp', Buffer.from('shared-art'), 'image/webp')
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
    const committer = createCommitter()
    committer.lockNewRoom(first)
    committer.lockNewRoom(second)
    ;(await committer.prepareRoom(first, { missingPrefix: false }))
    ;(await committer.prepareRoom(second, { missingPrefix: false }))

    const row = (await db.prepare(`
      SELECT custom_cards_json FROM game_replays WHERE room_id = ?
    `).get(first.id)) as { custom_cards_json: string }
    const [definition] = JSON.parse(row.custom_cards_json) as Array<{ artUrl: string }>
    const hash = definition!.artUrl.slice('/replay-assets/'.length)
    const assetPath = `replay-assets/${hash}`
    await db.prepare("UPDATE stored_objects SET retain_until = 0").run()
    expect(await resources.storage.read(assetPath)).not.toBeNull()

    ;(await persistence.discard(first.id))
    ;(await committer.retireRoom(first.id))
    expect(await resources.storage.read(assetPath)).not.toBeNull()

    ;(await persistence.discard(second.id))
    ;(await committer.cleanupReplayAssets())
    expect(await resources.storage.read(assetPath)).toBeNull()
  })

  it('serializes simultaneous player submissions and includes automatic resolution in the last Step', async () => {
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
    ;(await committer.prepareRoom(room, { missingPrefix: false }))

    const p1Pool = session.state.draft!.pools.p1
    const p1Pick = {
      occCardId: p1Pool.occ[0]!,
      minorCardId: p1Pool.minor[0]!,
    }
    const p1Response = session.submitDraftPick('p1', p1Pick)
    expect((await committer.commit(
      room,
      p1Response,
      replayIntentFromCommand({ type: 'draftSubmit', playerId: 'p1', pick: p1Pick })!,
      0,
    ))).toMatchObject({ kind: 'committed', stepNo: 1 })
    expect(p1Response.state.draft?.round).toBe(1)

    const p2Pool = session.state.draft!.pools.p2
    const p2Pick = {
      occCardId: p2Pool.occ[0]!,
      minorCardId: p2Pool.minor[0]!,
    }
    const p2Response = session.submitDraftPick('p2', p2Pick)
    expect((await committer.commit(
      room,
      p2Response,
      replayIntentFromCommand({ type: 'draftSubmit', playerId: 'p2', pick: p2Pick })!,
      1,
    ))).toMatchObject({ kind: 'committed', stepNo: 2 })
    expect(p2Response.state.draft?.round).toBe(2)
    expect((await persistence.loadReplayHead(room.id))?.latestStepNo).toBe(2)
  })

  it('freezes a failed commit, blocks new commands, and retries the same Step', async () => {
    const room = makeRoom()
    const { scheduler, tasks } = fakeScheduler()
    const committer = createCommitter({ scheduler })
    ;(await committer.prepareRoom(room, { missingPrefix: false }))
    ;(await db.exec(`
      CREATE FUNCTION reject_step_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.step_no = 1 THEN RAISE EXCEPTION 'disk unavailable'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_step BEFORE INSERT ON game_replay_steps FOR EACH ROW EXECUTE FUNCTION reject_step_fn();
    `))
    const response = room.session.devSetResources(0, { food: 1 })
    const retried: number[] = []

    expect((await committer.commit(room, response, actionIntent!, 0, (result) => {
      retried.push(result.stepNo)
    }))).toEqual({ kind: 'blocked', error: 'disk unavailable' })
    expect(committer.isBlocked(room.id)).toBe(true)
    expect(tasks.map(({ delay }) => delay)).toEqual([1_000])
    expect((await committer.commit(room, response, actionIntent!, 0))).toEqual({
      kind: 'blocked',
      error: 'disk unavailable',
    })

    ;(await db.exec('DROP TRIGGER reject_step ON game_replay_steps'))
    await tasks.shift()!.callback()

    expect(retried).toEqual([1])
    expect(committer.isBlocked(room.id)).toBe(false)
    expect((await persistence.loadReplayHead(room.id))?.latestStepNo).toBe(1)
  })

  it.each(['commit', 'load'] as const)('settles %s retry waiters and reconnects after asynchronous publication rejection', async (path) => {
    const room = makeRoom()
    const { scheduler, tasks } = fakeScheduler()
    const committer = createCommitter({ scheduler })
    await committer.prepareRoom(room, { missingPrefix: false })
    const close = vi.fn()
    room.players = [{ ws: { close } as never, playerIndex: 0, name: 'Alice' }]
    const publication = vi.fn(async () => { throw new Error('publication unavailable') })
    if (path === 'commit') {
      vi.spyOn(persistence, 'commitReplay').mockRejectedValueOnce(new Error('write unavailable'))
      await committer.commit(room, room.session.devSetResources(0, { food: 1 }), actionIntent!, 0, publication)
    } else {
      vi.spyOn(persistence, 'loadReplayHead').mockRejectedValueOnce(new Error('read unavailable'))
      await committer.prepareRoom(room, { missingPrefix: true, onReady: publication })
    }
    const waiter = vi.fn()
    expect(committer.waitUntilReady(room.id, waiter)).toBe(true)
    await tasks.shift()!.callback()
    expect(waiter).toHaveBeenCalledExactlyOnceWith('publication unavailable')
    expect(close).toHaveBeenCalledExactlyOnceWith(1012, 'Reload committed room state')
    expect(publication).toHaveBeenCalledOnce()
    expect(tasks).toHaveLength(0)
    expect(committer.isBlocked(room.id)).toBe(false)
    expect((await persistence.loadReplayHead(room.id))!.latestStepNo).toBe(path === 'commit' ? 1 : 0)
  })

  it('settles retry waiters when the publication fence rejects the previous owner', async () => {
    const room = makeRoom()
    const { scheduler, tasks } = fakeScheduler()
    const committer = createCommitter({ scheduler })
    await committer.prepareRoom(room, { missingPrefix: false })
    vi.spyOn(persistence, 'commitReplay').mockRejectedValueOnce(new Error('write unavailable'))
    await committer.commit(room, room.session.devSetResources(0, { food: 1 }), actionIntent!, 0,
      async () => { throw new RoomOwnershipError('ownership changed') })
    const waiter = vi.fn()
    expect(committer.waitUntilReady(room.id, waiter)).toBe(true)
    await tasks.shift()!.callback()
    expect(waiter).toHaveBeenCalledExactlyOnceWith('ownership changed')
    expect(committer.isRetrying(room.id)).toBe(false)
    expect(committer.blockedError(room.id)).toBe('ownership changed')
    expect(tasks).toHaveLength(0)
  })

  it('keeps a failed Step 0 on the durable path while it retries', async () => {
    const room = makeRoom()
    const { scheduler } = fakeScheduler()
    const committer = createCommitter({ scheduler })
    ;(await db.exec(`
      CREATE FUNCTION reject_step_zero_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.step_no = 0 THEN RAISE EXCEPTION 'disk unavailable'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_step_zero BEFORE INSERT ON game_replay_steps FOR EACH ROW EXECUTE FUNCTION reject_step_zero_fn();
    `))

    expect((await committer.prepareRoom(room, { missingPrefix: false }))).toEqual({
      kind: 'blocked',
      error: 'disk unavailable',
    })
    expect(committer.hasReplay(room.id)).toBe(true)
    committer.shutdown()
  })

  it('uses 1/2/5/10/30 second retry backoff and stays at 30 seconds', async () => {
    const room = makeRoom()
    const { scheduler, tasks } = fakeScheduler()
    const committer = createCommitter({ scheduler })
    ;(await committer.prepareRoom(room, { missingPrefix: false }))
    ;(await db.exec(`
      CREATE FUNCTION reject_step_backoff_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.step_no = 1 THEN RAISE EXCEPTION 'still unavailable'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_step_backoff BEFORE INSERT ON game_replay_steps FOR EACH ROW EXECUTE FUNCTION reject_step_backoff_fn();
    `))
    const response = room.session.devSetResources(0, { food: 1 })

    ;(await committer.commit(room, response, actionIntent!, 0))

    for (const delay of [1_000, 2_000, 5_000, 10_000, 30_000, 30_000]) {
      expect(tasks[0]?.delay).toBe(delay)
      await tasks.shift()!.callback()
    }
    expect(tasks[0]?.delay).toBe(30_000)
    committer.shutdown()
  })

  it('continues the existing replay after process recovery', async () => {
    const room = makeRoom()
    const firstCommitter = createCommitter()
    ;(await firstCommitter.prepareRoom(room, { missingPrefix: false }))
    const response = room.session.devSetResources(0, { food: 1 })
    ;(await firstCommitter.commit(room, response, actionIntent!, 0))

    const restored = snapshotToRoom((await persistence.load(room.id))!)
    const recoveredCommitter = createCommitter({})

    expect((await recoveredCommitter.prepareRoom(restored, { missingPrefix: true }))).toMatchObject({
      kind: 'committed',
      roomVersion: 1,
      stepNo: 1,
    })
    expect(restored.version).toBe(1)
    expect((await persistence.loadReplayHead(room.id))?.missingPrefix).toBe(false)

    const next = restored.session.devSetResources(1, { food: 4 })
    expect((await recoveredCommitter.commit(restored, next, actionIntent!, 1))).toMatchObject({
      kind: 'committed',
      roomVersion: 2,
      stepNo: 2,
    })
  })

  it('recovers and commits from the Room head despite corrupt Replay payload', async () => {
    const room = makeRoom()
    const first = createCommitter()
    ;(await first.prepareRoom(room, { missingPrefix: false }))
    ;(await first.commit(room, room.session.devSetResources(0, { food: 7 }), actionIntent!, 0))
    ;(await db.exec("UPDATE game_replay_steps SET payload_gzip = decode('ff', 'hex')"))
    const restored = snapshotToRoom((await persistence.load(room.id))!)
    const recovered = createCommitter({})
    expect((await recovered.prepareRoom(restored, { missingPrefix: true }))).toMatchObject({ kind: 'committed', stepNo: 1 })
    expect((await recovered.commit(restored, restored.session.devSetResources(1, { food: 8 }), actionIntent!, 1)))
      .toMatchObject({ kind: 'committed', stepNo: 2 })
  })

  it('permanently blocks a corrupt Room history reference without scheduling storage retries', async () => {
    const room = makeRoom()
    ;(await createCommitter().prepareRoom(room, { missingPrefix: false }))
    const restored = snapshotToRoom((await persistence.load(room.id))!)
    ;(await db.exec("DELETE FROM room_history_nodes"))
    const { scheduler, tasks } = fakeScheduler()
    const recovered = createCommitter({ scheduler })
    expect((await recovered.prepareRoom(restored, { missingPrefix: true }))).toMatchObject({ kind: 'blocked', error: expect.stringContaining('Missing Room history') })
    expect(tasks).toHaveLength(0)
    expect(recovered.blockedError(room.id)).toContain('Missing Room history')
  })

  it('pauses and retries persisted replay-frame reads', async () => {
    const room = makeRoom()
    const firstCommitter = createCommitter()
    ;(await firstCommitter.prepareRoom(room, { missingPrefix: false }))
    const response = room.session.devSetResources(0, { food: 1 })
    ;(await firstCommitter.commit(room, response, actionIntent!, 0))

    const restored = snapshotToRoom((await persistence.load(room.id))!)
    const { scheduler, tasks } = fakeScheduler()
    const recoveredCommitter = createCommitter({ scheduler })
    const load = vi.spyOn(persistence, 'loadReplayFrame')
    load.mockImplementationOnce(() => {
      throw new Error('snapshot read unavailable')
    })
    const ready: number[] = []

    expect((await recoveredCommitter.prepareRoom(restored, {
      missingPrefix: true,
      onReady: (result) => {
        if (result.kind === 'committed') ready.push(result.stepNo)
      },
    }))).toEqual({ kind: 'blocked', error: 'snapshot read unavailable' })
    expect(recoveredCommitter.isRetrying(room.id)).toBe(true)
    expect(tasks.map(({ delay }) => delay)).toEqual([1_000])

    await tasks.shift()!.callback()

    expect(ready).toEqual([1])
    expect(recoveredCommitter.isBlocked(room.id)).toBe(false)
  })

  it('continues a replay when rehydration normalizes the persisted frame', async () => {
    const room = makeRoom()
    const firstCommitter = createCommitter()
    ;(await firstCommitter.prepareRoom(room, { missingPrefix: false }))
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

    expect((await firstCommitter.commit(room, played, playIntent!, 0))).toMatchObject({
      kind: 'committed',
      roomVersion: 1,
      stepNo: 1,
    })

    const restored = snapshotToRoom((await persistence.load(room.id))!)
    expect(restored.session.state.actionSpaces.find(
      (space) => space.id === 'C104_Collector',
    )?.blockedBy).toEqual([])
    expect(restored.session.state.players[0]!.playedCards)
      .toEqual(['occupation:C104_Collector'])

    const recoveredCommitter = createCommitter({})
    expect((await recoveredCommitter.prepareRoom(restored, { missingPrefix: true }))).toMatchObject({
      kind: 'committed',
      roomVersion: 1,
      stepNo: 1,
    })

    restored.session.devSetResources(1, { food: 4 })
    restored.session.state.gameOver = true
    const next = restored.session.getState()
    expect((await recoveredCommitter.commit(restored, next, actionIntent!, 1))).toMatchObject({
      kind: 'committed',
      roomVersion: 2,
      stepNo: 2,
    })
    const replay = (await new ReplayStore(db).segment(room.id, 0))
    expect(replay.ok).toBe(true)
  })

  it('blocks replay recovery when the persisted room cannot be rehydrated', async () => {
    const room = makeRoom()
    ;(await createCommitter().prepareRoom(room, { missingPrefix: false }))
    const snapshot = (await persistence.load(room.id))!
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
    ;(await db.prepare('UPDATE rooms SET state_json = ? WHERE id = ?')
      .run(JSON.stringify(incompatibleSnapshot), room.id))
    ;(await db.prepare(`
      UPDATE game_replay_steps
      SET payload_kind = ?, payload_gzip = ?, checkpoint_step_no = ?, frame_hash = ?
      WHERE room_id = ? AND step_no = 0
    `).run(
      encoded.payloadKind,
      encoded.payloadGzip,
      encoded.checkpointStepNo,
      encoded.frameHash,
      room.id,
    ))

    const restored = snapshotToRoom((await persistence.load(room.id))!)

    expect((await createCommitter().prepareRoom(restored, { missingPrefix: true }))).toEqual({
      kind: 'blocked',
      error: `room snapshot rehydration failed for ${room.id} step 0`,
    })
  })

  it('blocks recovery of an unsupported replay schema', async () => {
    const room = makeRoom()
    const firstCommitter = createCommitter()
    ;(await firstCommitter.prepareRoom(room, { missingPrefix: false }))
    ;(await db.prepare('UPDATE game_replays SET schema_version = 2 WHERE room_id = ?').run(room.id))

    expect((await createCommitter().prepareRoom(room, { missingPrefix: false }))).toEqual({
      kind: 'blocked',
      error: `unsupported replay schema 2 for ${room.id}`,
    })
  })

  it('rejects unrecorded old active rooms without synthesizing history', async () => {
    const room = makeRoom()
    room.replayRecording = false
    const committer = createCommitter()
    expect(await committer.prepareRoom(room, { missingPrefix: true })).toMatchObject({ kind: 'blocked' })
    expect(await persistence.loadReplayHead(room.id)).toBeNull()
    expect(committer.isBlocked(room.id)).toBe(true)
  })

  it('permanently blocks a different Hash at the same Step', async () => {
    const room = makeRoom()
    const { scheduler, tasks } = fakeScheduler()
    const committer = createCommitter({ scheduler })
    ;(await committer.prepareRoom(room, { missingPrefix: false }))
    ;(await db.prepare(`
      INSERT INTO game_replay_steps (
        room_id, step_no, room_version, checkpoint_step_no, player_index,
        command_type, intent_json, payload_kind, payload_gzip, frame_hash, created_at
      ) VALUES (?, 1, 1, 0, 0, 'action', '{}', 'delta', decode('00', 'hex'), ?, 1001)
    `).run(room.id, 'f'.repeat(64)))

    const response = room.session.devSetResources(0, { food: 1 })
    expect((await committer.commit(room, response, actionIntent!, 0))).toEqual({
      kind: 'blocked',
      error: `replay hash conflict at ${room.id} step 1`,
    })
    expect(committer.isBlocked(room.id)).toBe(true)
    expect(committer.isRetrying(room.id)).toBe(false)
    expect(tasks).toEqual([])
  })

  it('releases the in-memory replay head when a room retires', async () => {
    const room = makeRoom()
    const committer = createCommitter()
    ;(await committer.prepareRoom(room, { missingPrefix: false }))

    expect(committer.isRecording(room.id)).toBe(true)
    expect(committer.hasReplay(room.id)).toBe(true)

    ;(await committer.retireRoom(room.id))

    expect(committer.isRecording(room.id)).toBe(false)
    expect(committer.hasReplay(room.id)).toBe(false)
  })

  it('notifies queued reconnects when a blocked room retires', async () => {
    const room = makeRoom()
    const { scheduler, tasks } = fakeScheduler()
    const committer = createCommitter({ scheduler })
    ;(await committer.prepareRoom(room, { missingPrefix: false }))
    ;(await db.exec(`
      CREATE FUNCTION reject_retired_step_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.step_no = 1 THEN RAISE EXCEPTION 'disk unavailable'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_retired_step BEFORE INSERT ON game_replay_steps FOR EACH ROW EXECUTE FUNCTION reject_retired_step_fn();
    `))
    const response = room.session.devSetResources(0, { food: 1 })
    ;(await committer.commit(room, response, actionIntent!, 0))
    const errors: Array<string | undefined> = []

    expect(committer.waitUntilReady(room.id, (error) => errors.push(error))).toBe(true)
    ;(await committer.retireRoom(room.id))

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
