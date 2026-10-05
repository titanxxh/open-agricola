import { createServer } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import * as database from '../../db'
import { createTestDatabase } from '../../__tests__/_helpers/postgres'
import { recordingResources } from '../../__tests__/_helpers/recording'
import { createCard, approveCurrentDraft, publish } from '../../workshop-drafts'
import { PostgresRoomPersistence } from '../../game/persistence/postgres-adapter'
import { createWsServer } from '../ws-server'
import { createConnectionCtx } from '../connection-ctx'
import { dispatch } from '../room-router'
import { CommandStore } from '../../game/command-store'
import { randomUUID } from 'node:crypto'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })
it('restores a recorded custom Room using its pinned definitions even after the mutable Workshop card is deleted', async () => {
  const db = await createTestDatabase()
  const recording = await recordingResources(db)
  vi.spyOn(database, 'getDb').mockReturnValue(db)
  vi.stubEnv('ALLOW_ANONYMOUS_WS', 'true')
  const persistence = new PostgresRoomPersistence(db)
  const commands = new CommandStore(db)
  const scope = await commands.issueScope('development-anonymous')
  const servers: Array<Awaited<ReturnType<typeof createWsServer>>> = []
  try {
    await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES ('author','author','Author','x',1)").run()
    const card = await createCard(db, { authorId: 'author', draft: {
      cardId: 'CUSTOM_Restored', cardType: 'minor', name: 'Restored', description: 'Restored card',
      cardJson: { id: 'CUSTOM_Restored', name: 'Restored', card_type: 'minor', deck: 'CUSTOM', number: 1, desc: ['Restored card'] },
      effectCode: null, compiledCode: null, codeManifest: null, artUrl: null, generation: {},
    } as never })
    await approveCurrentDraft(db, { cardId: card.id, authorId: 'author' })
    await publish(db, { cardId: card.id, authorId: 'author', baseRevision: card.revision })
    const first = await createWsServer(createServer(), { persistence, ...recording }); servers.push(first)
    const socket = () => ({ OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() }) as never
    const host = createConnectionCtx(socket(), { ...first, commands }, true)
    const guest = createConnectionCtx(socket(), { ...first, commands }, true)
    await dispatch(host, { type: 'createRoom', maxPlayers: 2, enableParentCards: false, enableCommunityDeck: true, customCardIds: [card.id],
      commandContext: { scopeId: scope.scopeId, commandId: randomUUID() } })
    const id = host.currentRoom!.id
    await dispatch(guest, { type: 'joinRoom', roomId: id })
    expect((await persistence.loadReplayHead(id))?.latestStepNo).toBe(0)
    const encoded = await db.prepare('SELECT payload_gzip,frame_hash FROM game_replay_steps WHERE room_id=?').all(id)
    await first.shutdown(); servers.pop()
    await db.prepare('DELETE FROM workshop_cards WHERE id=?').run(card.id)
    const restored = await createWsServer(createServer(), { persistence, ...recording }); servers.push(restored)
    expect(restored.registry.get(id)?.session.getCustomCardDefs()).toEqual([expect.objectContaining({
      cardType: 'minor', cardJson: expect.objectContaining({ id: 'CUSTOM_Restored' }),
    })])
    expect(await db.prepare('SELECT payload_gzip,frame_hash FROM game_replay_steps WHERE room_id=?').all(id)).toEqual(encoded)
    expect((await persistence.load(id))?.meta.customCards).toHaveLength(1)
  } finally {
    for (const server of servers) await server.shutdown()
    await recording.close(); await db.close()
  }
}, 15000)
