import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestDatabase } from '../../__tests__/_helpers/postgres'
import type { PostgresDatabase } from '../../database/postgres'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stabilizeRandomHands } from '../../__tests__/_helpers/stabilize-random-hands.ts'
import { GameSession } from '../authoritative-session.ts'
import { PostgresRoomPersistence } from '../persistence/postgres-adapter.ts'
import * as cursorComparison from '../private-cursor-comparison.ts'
import { RoomCommitter, replayIntentFromCommand, type RoomCommitScheduler } from '../room-committer.ts'
import type { Room } from '../room.ts'

describe('RoomCommitter private cursor ownership', () => {
  let tempDir: string
  let db: PostgresDatabase
  let persistence: PostgresRoomPersistence
  const committers: RoomCommitter[] = []

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'open-agricola-private-cursor-'))
    process.env.DB_PATH = join(tempDir, 'test.db')
    vi.resetModules()
    db = await createTestDatabase()
    persistence = new PostgresRoomPersistence(db)
  })

  afterEach(async () => {
    committers.splice(0).forEach(committer => committer.shutdown())
    vi.restoreAllMocks()
    ;(await db.close())
    delete process.env.DB_PATH
    rmSync(tempDir, { recursive: true, force: true })
    vi.resetModules()
  })

  const makeRoom = (): Room => {
    const session = new GameSession(587, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    return {
      id: 'private-cursor-room', session, players: [], seatOwners: [],
      maxPlayers: 2, version: 0, status: 'playing', replayRecording: true, replayViewerBuildId: 'viewer-1', replayGameBuildId: 'game-1', startedAt: 100,
    }
  }
  const makeCommitter = (scheduler?: RoomCommitScheduler): RoomCommitter => {
    const committer = new RoomCommitter({
      persistence, viewerBuildId: 'viewer', gameBuildId: 'game',
      viewerBuildExists: () => true, scheduler, now: () => 1_000,
    })
    committers.push(committer)
    return committer
  }
  const intent = replayIntentFromCommand({ type: 'action', spaceId: 'forest' })!

  it('skips private equality when the public Frame changes or a durable rejection forces a Step', async () => {
    const room = makeRoom()
    const committer = makeCommitter()
    ;(await committer.prepareRoom(room, { missingPrefix: false }))
    const compare = vi.spyOn(cursorComparison, 'privateCursorEquals')

    const response = room.session.devSetResources(0, { food: 42 })
    expect((await committer.commit(room, response, intent, 0))).toMatchObject({ kind: 'committed', stepNo: 1 })
    expect(compare).not.toHaveBeenCalled()

    const rejected = { ...room.session.getState(), ok: false, durableTransition: true }
    expect((await committer.commit(room, rejected, intent, 0))).toMatchObject({ kind: 'committed', stepNo: 2 })
    expect(compare).not.toHaveBeenCalled()
    expect((await committer.commit(room, { ...rejected, durableTransition: undefined }, intent, 0)))
      .toEqual({ kind: 'unchanged' })
    expect((await committer.commit(room, room.session.getState(), intent, 0))).toEqual({ kind: 'unchanged' })
    expect(compare).toHaveBeenCalledOnce()
  })
})
