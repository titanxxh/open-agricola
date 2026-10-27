import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { vi } from 'vitest'
import * as database from '../../db'
import * as rng from '../../../shared/utils/rng'
import { createLocalUserForTests, createSession } from '../../auth'
import { createWsServer } from '../../connection/ws-server'
import { PostgresRoomPersistence } from '../../game/persistence/postgres-adapter'
import { RoomDirectory } from '../../game/room-directory'
import { GameContextStore } from '../../game/game-context-store'
import type { StateUpdateEnvelope } from '../../../shared/contract/protocol/game'
import { createTestDatabase } from './postgres'
import { createFormalSoloRecording, SoloNetworkPeer } from './formal-solo-network'

export async function createSoloRecoveryHost(seed = 24) {
  const db = await createTestDatabase()
  vi.spyOn(database, 'getDb').mockReturnValue(db)
  const resolveSeed = rng.resolveSeed
  vi.spyOn(rng, 'resolveSeed').mockImplementation(input => resolveSeed(input ?? seed))
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('ALLOW_ANONYMOUS_WS', 'false')
  const recording = await createFormalSoloRecording(db)
  const user = await createLocalUserForTests(`solo_recovery_${randomUUID().slice(0, 8)}`, 'password123', 'Recovery farmer')
  const token = await createSession(user.id)
  const peers: SoloNetworkPeer[] = []
  type Runtime = Awaited<ReturnType<typeof start>>
  let current: Runtime | undefined

  async function start() {
    const http = createServer()
    await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
    const address = http.address()
    if (!address || typeof address === 'string') throw new Error('Recovery HTTP listener did not start')
    const directory = new RoomDirectory(db)
    const persistence = new PostgresRoomPersistence(db, directory)
    const backend = await createWsServer(http, { directory, persistence, resources: recording.resources,
      gameContextStore: new GameContextStore(db),
      replay: { viewerBuildId: recording.buildId, gameBuildId: 'standard-solo-recovery' },
      internalUrl: `http://127.0.0.1:${address.port}`,
    })
    return { http, directory, persistence, backend, url: `ws://127.0.0.1:${address.port}/ws` }
  }

  const runtime = () => {
    if (!current) throw new Error('Recovery service is stopped')
    return current
  }
  const connect = async () => {
    const peer = await SoloNetworkPeer.connect(runtime().url, `oa_session=${token}`)
    peers.push(peer)
    return peer
  }
  const stop = async () => {
    const running = current
    current = undefined
    for (const peer of peers.splice(0)) await peer.close()
    if (!running) return
    await running.backend.shutdown()
    await new Promise<void>((resolve, reject) => running.http.close(error => error ? reject(error) : resolve()))
  }
  const resume = async (roomId: string) => {
    const peer = await connect()
    peer.socket.send(JSON.stringify({ type: 'joinRoom', roomId, intent: 'resume', requestId: randomUUID() }))
    const state = await peer.wait((event): event is StateUpdateEnvelope => event.type === 'stateUpdate' && event.roomId === roomId)
    return { peer, state }
  }
  try { current = await start() } catch (error) {
    try { await recording.close() } finally { await db.close() }
    throw error
  }
  return {
    db, user, runtime, connect, resume, seed,
    source: { schema: (await db.prepare('SELECT current_schema() AS name').get<{ name: string }>())!.name,
      s3Prefix: recording.prefix, viewerBuildId: recording.buildId },
    create: async (parents = false) => {
      const allocationId = randomUUID()
      await runtime().directory.allocate(`user:${user.id}`, allocationId)
      const peer = await connect()
      const created = await peer.mutate({ type: 'createRoom', maxPlayers: 1, name: 'Recovery farmer',
        soloHandMode: 'choose-7', enableFarmersOfTheMoor: true, enableParentCards: parents, draftParents: parents,
      }, undefined, allocationId)
      return { peer, ...created }
    },
    rebuild: async (roomId: string) => {
      const before = await runtime().persistence.load(roomId)
      const headBefore = await runtime().persistence.loadReplayHead(roomId)
      await stop()
      current = await start()
      const result = await resume(roomId)
      const after = await runtime().persistence.load(roomId)
      const headAfter = await runtime().persistence.loadReplayHead(roomId)
      return { ...result, before, after, headBefore, headAfter }
    },
    close: async () => {
      try { await stop() } finally {
        try { await recording.close() } finally { await db.close() }
      }
    },
  }
}
