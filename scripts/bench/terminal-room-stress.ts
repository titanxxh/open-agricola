import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GameSession } from '../../server/game/authoritative-session.ts'
import { SqliteRoomPersistence } from '../../server/game/persistence/sqlite-adapter.ts'
import type { Room } from '../../server/game/room.ts'
import { createRoomPersistenceCheckpoint } from '../../server/game/room-persistence-checkpoint.ts'

const sizeOf = (path: string): number => {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

const makeRoom = (id: string, startedAt: number): Room => ({
  id,
  session: new GameSession(563, undefined, { playerCount: 2 }),
  players: [],
  maxPlayers: 2,
  version: 0,
  status: 'playing',
  startedAt,
})

const runTerminalRoomStress = async (roomCount: number) => {
  if (!Number.isInteger(roomCount) || roomCount <= 0) throw new Error('roomCount must be a positive integer')
  const tempDir = mkdtempSync(join(tmpdir(), 'oa-terminal-room-stress-'))
  const dbPath = join(tempDir, 'stress.db')
  const previousDbPath = process.env.DB_PATH
  let closeDb: (() => void) | undefined
  process.env.DB_PATH = dbPath
  try {
    const { getDb } = await import('../../server/db.ts')
    const db = getDb()
    closeDb = () => db.close()
    const persistence = new SqliteRoomPersistence(db)
    const checkpoint = createRoomPersistenceCheckpoint({ persistence })
    const now = Date.now()

    for (let index = 0; index < roomCount; index += 1) {
      const room = makeRoom(`completed-${index}`, now)
      checkpoint.recordCreated(room)
      room.session.state.gameOver = true
      const result = checkpoint.completeGame(room, now + 1)
      if (!result.ok || !result.archived) throw new Error(`completion failed for ${room.id}`)
      checkpoint.flushRoom(room)
      checkpoint.recordState(room)
      checkpoint.completeGame(room, now + 2)
    }

    for (let index = 0; index < roomCount; index += 1) {
      const room = makeRoom(`discarded-${index}`, now)
      checkpoint.recordCreated(room)
      checkpoint.flushRoom(room)
      checkpoint.discardRoom(room.id)
      checkpoint.flushRoom(room)
      checkpoint.recordState(room)
    }

    for (let index = 0; index < roomCount; index += 1) {
      const room = makeRoom(`active-${index}`, now)
      checkpoint.recordCreated(room)
      checkpoint.flushRoom(room)
    }

    const previousRoomId = randomUUID()
    const nextRoomId = randomUUID()
    const previousRoom = makeRoom(previousRoomId, now)
    checkpoint.recordCreated(previousRoom)
    checkpoint.discardRoom(previousRoomId)
    const nextRoom = makeRoom(nextRoomId, now + 1)
    checkpoint.recordCreated(nextRoom)
    checkpoint.flushRoom(nextRoom)
    checkpoint.shutdown()
    checkpoint.shutdown()

    const restorable = persistence.listRestorable({
      now: now + 2,
      waitingTtlMs: 30 * 60 * 1000,
      playingTtlMs: 24 * 60 * 60 * 1000,
    })
    const counts = {
      rooms: (db.prepare('SELECT COUNT(*) AS count FROM rooms').get() as { count: number }).count,
      gameResults: (db.prepare('SELECT COUNT(*) AS count FROM game_results').get() as { count: number }).count,
      gameResultPlayers: (db.prepare('SELECT COUNT(*) AS count FROM game_result_players').get() as { count: number }).count,
      nonActiveRooms: (db.prepare("SELECT COUNT(*) AS count FROM rooms WHERE id NOT LIKE 'active-%' AND id != ?")
        .get(nextRoomId) as { count: number }).count,
      restorableRooms: restorable.length,
    }
    const expectedActive = roomCount + 1
    if (
      counts.rooms !== expectedActive ||
      counts.gameResults !== roomCount ||
      counts.gameResultPlayers !== roomCount * 2 ||
      counts.nonActiveRooms !== 0 ||
      counts.restorableRooms !== expectedActive ||
      persistence.hasRoomId(previousRoomId) ||
      !persistence.hasRoomId(nextRoomId)
    ) {
      throw new Error(`terminal room invariant failed: ${JSON.stringify(counts)}`)
    }
    const summary = {
      roomCount,
      ...counts,
      rotatedRoomId: previousRoomId !== nextRoomId,
      databaseBytes: sizeOf(dbPath),
      walBytes: sizeOf(`${dbPath}-wal`),
    }
    closeDb()
    closeDb = undefined
    return summary
  } finally {
    closeDb?.()
    if (previousDbPath === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = previousDbPath
    rmSync(tempDir, { recursive: true, force: true })
  }
}

if (process.argv[1]?.endsWith('terminal-room-stress.ts')) {
  const roomCount = Number(process.argv[2] ?? 100)
  process.stdout.write(`${JSON.stringify(await runTerminalRoomStress(roomCount))}\n`)
}
